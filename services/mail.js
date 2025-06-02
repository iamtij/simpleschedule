const FormData = require('form-data');
const Mailgun = require('mailgun.js');

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere'
});

class MailService {
    constructor() {
        if (!process.env.MAILGUN_DOMAIN || !process.env.MAILGUN_API_KEY) {
            console.warn('Mailgun configuration missing. Email functionality will be disabled.');
            this.enabled = false;
        } else {
            this.enabled = true;
            this.domain = process.env.MAILGUN_DOMAIN;
        }
    }

    async sendTestEmail(to) {
        if (!this.enabled) {
            console.log('Email disabled: Would have sent test email to', to);
            return null;
        }

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [to],
                subject: 'Test Email from isked',
                text: 'This is a test email from your scheduling application - isked.',
            });
            console.log('Test email sent:', result);
            return result;
        } catch (error) {
            console.error('Failed to send test email:', error);
            throw error;
        }
    }

    async sendClientConfirmation(booking, host) {
        if (!this.enabled) {
            console.log('Email disabled: Would have sent client confirmation to', booking.client_email);
            return null;
        }

        const date = new Date(booking.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [booking.client_email],
                subject: `Appointment Confirmed with ${host.name || host.username}`,
                text: `Hello ${booking.client_name},

Your appointment has been confirmed!

Details:
- Date: ${formattedDate}
- Time: ${booking.formatted_start_time} - ${booking.formatted_end_time}
- With: ${host.name || host.username}

${booking.notes ? `Notes: ${booking.notes}

` : ''}Thank you for using isked!

You can add this appointment to your calendar using this link:
${this._generateGoogleCalendarLink(booking, host)}`,
            });
            console.log('Client confirmation email sent:', result);
            return result;
        } catch (error) {
            console.error('Failed to send client confirmation:', error);
            throw error;
        }
    }

    async sendHostNotification(booking, host) {
        if (!this.enabled) {
            console.log('Email disabled: Would have sent host notification to', host.email);
            return null;
        }

        const date = new Date(booking.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [host.email],
                subject: `New Appointment: ${booking.client_name}`,
                text: `Hello ${host.name || host.username},

You have a new appointment scheduled!

Client Details:
- Name: ${booking.client_name}
- Email: ${booking.client_email}
${booking.client_phone ? `- Phone: ${booking.client_phone}` : ''}

Appointment Details:
- Date: ${formattedDate}
- Time: ${booking.formatted_start_time} - ${booking.formatted_end_time}
${booking.notes ? `- Notes: ${booking.notes}` : ''}

You can view and manage this appointment in your dashboard:
${process.env.APP_URL || 'https://isked.app'}/dashboard

Add to your calendar:
${this._generateGoogleCalendarLink(booking, host)}`,
            });
            console.log('Host notification email sent:', result);
            return result;
        } catch (error) {
            console.error('Failed to send host notification:', error);
            throw error;
        }
    }

    _generateGoogleCalendarLink(booking, host) {
        const formatDateForGCal = (date) => date.replace(/-/g, '');
        const formatTimeForGCal = (time) => time.replace(/:/g, '');

        const details = `Client: ${booking.client_name}
Email: ${booking.client_email}${booking.client_phone ? '\nPhone: ' + booking.client_phone : ''}${booking.notes ? '\nNotes: ' + booking.notes : ''}`;

        return `https://calendar.google.com/calendar/event?action=TEMPLATE` +
            `&text=${encodeURIComponent(`Appointment with ${host.name || host.username}`)}` +
            `&dates=${formatDateForGCal(booking.date)}T${formatTimeForGCal(booking.start_time)}00` +
            `/${formatDateForGCal(booking.date)}T${formatTimeForGCal(booking.end_time)}00` +
            `&details=${encodeURIComponent(details)}`;
    }
}

module.exports = new MailService(); 