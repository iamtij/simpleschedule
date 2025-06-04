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

    async sendPasswordResetEmail(email, resetToken) {
        if (!this.enabled) {
            console.log('Email disabled: Would have sent password reset email to', email);
            return null;
        }

        try {
            const resetLink = `${process.env.APP_URL || 'https://isked.app'}/auth/reset-password/${resetToken}`;
            
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [email],
                subject: 'Reset Your Password - isked',
                text: `Hello,

You have requested to reset your password for your isked account.

Please click the link below to reset your password:
${resetLink}

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email.

Best regards,
The isked Team`,
            });
            console.log('Password reset email sent:', result);
            return result;
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw error;
        }
    }

    async sendWelcomeEmail(user) {
        if (!this.enabled) {
            console.log('Email disabled: Would have sent welcome email to', user.email);
            return null;
        }

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [user.email],
                subject: 'Welcome to isked! 🎉',
                text: `Hello ${user.name},

Welcome to isked! We're excited to have you on board.

Your account has been successfully created and you can now:
- Create and manage your schedule
- Accept bookings from clients
- Customize your availability
- And much more!

Get started by visiting your dashboard:
${process.env.APP_URL || 'https://isked.app'}/dashboard

If you have any questions or need assistance, feel free to reply to this email.

Best regards,
The isked Team`,
                html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #3b82f6; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
        }
        .footer { margin-top: 30px; font-size: 14px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to isked! 🎉</h1>
        </div>
        
        <p>Hello ${user.name},</p>
        
        <p>Welcome to isked! We're excited to have you on board.</p>
        
        <p>Your account has been successfully created and you can now:</p>
        <ul>
            <li>Create and manage your schedule</li>
            <li>Accept bookings from clients</li>
            <li>Customize your availability</li>
            <li>And much more!</li>
        </ul>
        
        <p style="text-align: center;">
            <a href="${process.env.APP_URL || 'https://isked.app'}/dashboard" class="button" style="color: #ffffff !important;">
                Visit Your Dashboard
            </a>
        </p>
        
        <p>If you have any questions or need assistance, feel free to reply to this email.</p>
        
        <div class="footer">
            <p>Best regards,<br>The isked Team</p>
        </div>
    </div>
</body>
</html>`
            });
            console.log('Welcome email sent:', result);
            return result;
        } catch (error) {
            console.error('Failed to send welcome email:', error);
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