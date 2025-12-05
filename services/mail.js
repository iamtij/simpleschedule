const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const fs = require('fs');
const timezone = require('../utils/timezone');

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere'
});

class MailService {
    constructor() {
        if (!process.env.MAILGUN_DOMAIN || !process.env.MAILGUN_API_KEY) {
            this.enabled = false;
        } else {
            this.enabled = true;
            this.domain = process.env.MAILGUN_DOMAIN;
        }
    }

    async sendTestEmail(to) {
        if (!this.enabled) {
            return null;
        }

        try {
            const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                This is a test email from your scheduling application - isked.
                            </p>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                This email demonstrates the new mobile-responsive design with centered layout and proper spacing.
                            </p>`;
            
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [to],
                subject: 'Test Email from isked',
                text: 'This is a test email from your scheduling application - isked.',
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendClientConfirmation(booking, host) {
        if (!this.enabled) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);
        const calendarLink = this._generateGoogleCalendarLink(booking, host);

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello ${booking.client_name},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your appointment has been confirmed!
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">With: ${host.name || host.username}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Meeting Link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 12px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Thank you for using isked!
                            </p>
                            <p style="margin: 0; text-align: center;">
                                <a href="${calendarLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Add to Calendar</a>
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [booking.client_email],
                subject: `Appointment Confirmed with ${host.name || host.username}`,
                text: `Hello ${booking.client_name},

Your appointment has been confirmed!

Details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
- With: ${host.name || host.username}
${host.meeting_link ? `\nMeeting Link: ${host.meeting_link}` : ''}

${booking.notes ? `Notes: ${booking.notes}

` : ''}Thank you for using isked!

You can add this appointment to your calendar using this link:
${calendarLink}`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendHostNotification(booking, host) {
        if (!this.enabled) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);
        const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/dashboard`;
        const calendarLink = this._generateGoogleCalendarLink(booking, host);

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello ${host.name || host.username},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                You have a new appointment scheduled!
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${booking.client_name}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${booking.client_email}" style="color: #3b82f6; text-decoration: none;">${booking.client_email}</a></p>
                                ${booking.client_phone ? `<p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Phone: ${booking.client_phone}</p>` : ''}
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Meeting Link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                            </div>
                            <p style="margin: 0 0 20px 0; text-align: center;">
                                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px; margin-right: 12px;">View Dashboard</a>
                                <a href="${calendarLink}" style="display: inline-block; padding: 12px 24px; background-color: #ffffff; color: #3b82f6 !important; text-decoration: none; border: 2px solid #3b82f6; border-radius: 6px; font-weight: 500; font-size: 15px;">Add to Calendar</a>
                            </p>`;

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
- Time: ${formattedStartTime} - ${formattedEndTime}
${booking.notes ? `- Notes: ${booking.notes}` : ''}
${host.meeting_link ? `- Meeting Link: ${host.meeting_link}` : ''}

You can view and manage this appointment in your dashboard:
${dashboardUrl}

Add to your calendar:
${calendarLink}`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendClientReminder(booking, host) {
        if (!this.enabled) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi ${booking.client_name},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Just a quick reminder that your appointment with ${host.name || host.username} begins in 30 minutes.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Join link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                See you soon!
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [booking.client_email],
                subject: `Reminder: Your appointment starts in 30 minutes`,
                text: `Hi ${booking.client_name},

Just a quick reminder that your appointment with ${host.name || host.username} begins in 30 minutes.

Details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
${host.meeting_link ? `- Join link: ${host.meeting_link}
` : ''}${booking.notes ? `- Notes: ${booking.notes}
` : ''}
See you soon!
`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendHostReminder(booking, host) {
        if (!this.enabled) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);
        const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/dashboard`;

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi ${host.name || host.username},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Heads up—your meeting with ${booking.client_name} starts in 30 minutes.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${booking.client_name}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${booking.client_email}" style="color: #3b82f6; text-decoration: none;">${booking.client_email}</a></p>
                                ${booking.client_phone ? `<p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Phone: ${booking.client_phone}</p>` : ''}
                            </div>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Meeting link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Manage Booking</a>
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [host.email],
                subject: `Reminder: ${booking.client_name} meets you in 30 minutes`,
                text: `Hi ${host.name || host.username},

Heads up—your meeting with ${booking.client_name} starts in 30 minutes.

Client details:
- Name: ${booking.client_name}
- Email: ${booking.client_email}
${booking.client_phone ? `- Phone: ${booking.client_phone}
` : ''}
Appointment details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
${host.meeting_link ? `- Meeting link: ${host.meeting_link}
` : ''}${booking.notes ? `- Notes: ${booking.notes}
` : ''}
Manage the booking at ${dashboardUrl}.
`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async scheduleClientReminder1Hour(booking, host, userTimezone) {
        if (!this.enabled) {
            return null;
        }

        if (!booking.date || !booking.start_time || !booking.client_email) {
            return null;
        }

        // Calculate delivery time (1 hour before appointment)
        const deliveryTime = this._calculateDeliveryTime(booking.date, booking.start_time, userTimezone, 60);
        if (!deliveryTime) {
            // Appointment is less than 1 hour away or invalid
            return null;
        }

        // Format delivery time in RFC-2822 format
        const rfc2822Time = this._formatRFC2822(deliveryTime);
        if (!rfc2822Time) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi ${booking.client_name},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Just a friendly reminder that your appointment with ${host.name || host.username} begins in 1 hour.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Join link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                See you soon!
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [booking.client_email],
                subject: `Reminder: Your appointment starts in 1 hour`,
                text: `Hi ${booking.client_name},

Just a friendly reminder that your appointment with ${host.name || host.username} begins in 1 hour.

Details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
${host.meeting_link ? `- Join link: ${host.meeting_link}
` : ''}${booking.notes ? `- Notes: ${booking.notes}
` : ''}
See you soon!
`,
                html: this._generateEmailTemplate(content),
                'o:deliverytime': rfc2822Time
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async scheduleHostReminder1Hour(booking, host, userTimezone) {
        if (!this.enabled) {
            return null;
        }

        if (!booking.date || !booking.start_time || !host.email) {
            return null;
        }

        // Calculate delivery time (1 hour before appointment)
        const deliveryTime = this._calculateDeliveryTime(booking.date, booking.start_time, userTimezone, 60);
        if (!deliveryTime) {
            // Appointment is less than 1 hour away or invalid
            return null;
        }

        // Format delivery time in RFC-2822 format
        const rfc2822Time = this._formatRFC2822(deliveryTime);
        if (!rfc2822Time) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);
        const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/dashboard`;

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi ${host.name || host.username},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Heads up—your meeting with ${booking.client_name} starts in 1 hour.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${booking.client_name}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${booking.client_email}" style="color: #3b82f6; text-decoration: none;">${booking.client_email}</a></p>
                                ${booking.client_phone ? `<p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Phone: ${booking.client_phone}</p>` : ''}
                            </div>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Meeting link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Manage Booking</a>
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [host.email],
                subject: `Reminder: ${booking.client_name} meets you in 1 hour`,
                text: `Hi ${host.name || host.username},

Heads up—your meeting with ${booking.client_name} starts in 1 hour.

Client details:
- Name: ${booking.client_name}
- Email: ${booking.client_email}
${booking.client_phone ? `- Phone: ${booking.client_phone}
` : ''}
Appointment details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
${host.meeting_link ? `- Meeting link: ${host.meeting_link}
` : ''}${booking.notes ? `- Notes: ${booking.notes}
` : ''}
Manage the booking at ${dashboardUrl}.
`,
                html: this._generateEmailTemplate(content),
                'o:deliverytime': rfc2822Time
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async scheduleClientReminder30Min(booking, host, userTimezone) {
        if (!this.enabled) {
            return null;
        }

        if (!booking.date || !booking.start_time || !booking.client_email) {
            return null;
        }

        // Calculate delivery time (30 minutes before appointment)
        const deliveryTime = this._calculateDeliveryTime(booking.date, booking.start_time, userTimezone, 30);
        if (!deliveryTime) {
            // Appointment is less than 30 minutes away or invalid
            return null;
        }

        // Format delivery time in RFC-2822 format
        const rfc2822Time = this._formatRFC2822(deliveryTime);
        if (!rfc2822Time) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi ${booking.client_name},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Just a quick reminder that your appointment with ${host.name || host.username} begins in 30 minutes.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Join link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                See you soon!
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [booking.client_email],
                subject: `Reminder: Your appointment starts in 30 minutes`,
                text: `Hi ${booking.client_name},

Just a quick reminder that your appointment with ${host.name || host.username} begins in 30 minutes.

Details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
${host.meeting_link ? `- Join link: ${host.meeting_link}
` : ''}${booking.notes ? `- Notes: ${booking.notes}
` : ''}
See you soon!
`,
                html: this._generateEmailTemplate(content),
                'o:deliverytime': rfc2822Time
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async scheduleHostReminder30Min(booking, host, userTimezone) {
        if (!this.enabled) {
            return null;
        }

        if (!booking.date || !booking.start_time || !host.email) {
            return null;
        }

        // Calculate delivery time (30 minutes before appointment)
        const deliveryTime = this._calculateDeliveryTime(booking.date, booking.start_time, userTimezone, 30);
        if (!deliveryTime) {
            // Appointment is less than 30 minutes away or invalid
            return null;
        }

        // Format delivery time in RFC-2822 format
        const rfc2822Time = this._formatRFC2822(deliveryTime);
        if (!rfc2822Time) {
            return null;
        }

        const formattedDate = this._formatBookingDate(booking.date);
        const formattedStartTime = booking.formatted_start_time || this._formatTime(booking.start_time);
        const formattedEndTime = booking.formatted_end_time || this._formatTime(booking.end_time);
        const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/dashboard`;

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi ${host.name || host.username},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Heads up—your meeting with ${booking.client_name} starts in 30 minutes.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${booking.client_name}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${booking.client_email}" style="color: #3b82f6; text-decoration: none;">${booking.client_email}</a></p>
                                ${booking.client_phone ? `<p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Phone: ${booking.client_phone}</p>` : ''}
                            </div>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: ${formattedDate}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: ${formattedStartTime} - ${formattedEndTime}</p>
                                ${host.meeting_link ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Meeting link: <a href="${host.meeting_link}" style="color: #3b82f6; text-decoration: none;">${host.meeting_link}</a></p>` : ''}
                                ${booking.notes ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">Notes: ${booking.notes}</p>` : ''}
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Manage Booking</a>
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [host.email],
                subject: `Reminder: ${booking.client_name} meets you in 30 minutes`,
                text: `Hi ${host.name || host.username},

Heads up—your meeting with ${booking.client_name} starts in 30 minutes.

Client details:
- Name: ${booking.client_name}
- Email: ${booking.client_email}
${booking.client_phone ? `- Phone: ${booking.client_phone}
` : ''}
Appointment details:
- Date: ${formattedDate}
- Time: ${formattedStartTime} - ${formattedEndTime}
${host.meeting_link ? `- Meeting link: ${host.meeting_link}
` : ''}${booking.notes ? `- Notes: ${booking.notes}
` : ''}
Manage the booking at ${dashboardUrl}.
`,
                html: this._generateEmailTemplate(content),
                'o:deliverytime': rfc2822Time
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendPasswordResetEmail(email, resetToken) {
        if (!this.enabled) {
            return null;
        }

        try {
            const resetLink = `${process.env.APP_URL || 'https://isked.app'}/auth/reset-password/${resetToken}`;
            
            const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello,
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                You have requested to reset your password for your isked account.
                            </p>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Reset Password</a>
                            </p>
                            <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                This link will expire in 1 hour.
                            </p>
                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                If you did not request this password reset, please ignore this email.
                            </p>`;
            
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
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendWelcomeEmail(user) {
        if (!this.enabled) {
            return null;
        }

        try {
            const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/dashboard`;
            const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello ${user.name},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Welcome to isked! 🎉 We're excited to have you on board.
                            </p>
                            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your account has been successfully created and you can now:
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0; text-align: left;">
                                <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Create and manage your schedule</li>
                                    <li style="margin-bottom: 8px;">Accept bookings from clients</li>
                                    <li style="margin-bottom: 8px;">Customize your availability</li>
                                    <li>And much more!</li>
                                </ul>
                            </div>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Visit Your Dashboard</a>
                            </p>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                If you have any questions or need assistance, feel free to reply to this email.
                            </p>`;
            
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
${dashboardUrl}

If you have any questions or need assistance, feel free to reply to this email.

Best regards,
The isked Team`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    _generateGoogleCalendarLink(booking, host) {
        const formatDateForGCal = (date) => date.replace(/-/g, '');
        const formatTimeForGCal = (time) => time.replace(/:/g, '');

        const details = `${host.meeting_link ? `We will meet using this link: ${host.meeting_link}\n\n` : ''}${booking.notes ? `Notes: ${booking.notes}` : ''}`;

        return `https://calendar.google.com/calendar/event?action=TEMPLATE` +
            `&text=${encodeURIComponent(`Appointment with ${host.name || host.username}`)}` +
            `&dates=${formatDateForGCal(booking.date)}T${formatTimeForGCal(booking.start_time)}00` +
            `/${formatDateForGCal(booking.date)}T${formatTimeForGCal(booking.end_time)}00` +
            `&details=${encodeURIComponent(details)}`;
    }

    _formatBookingDate(date) {
        if (!date) {
            return '';
        }

        const parsedDate = typeof date === 'string' ? new Date(date) : new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return '';
        }

        return parsedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }

    _formatTime(time) {
        if (!time || typeof time !== 'string') {
            return '';
        }

        const [hoursStr, minutes = '00'] = time.split(':');
        const hours = parseInt(hoursStr, 10);

        if (Number.isNaN(hours)) {
            return time;
        }

        const suffix = hours >= 12 ? 'PM' : 'AM';
        const hour12 = ((hours + 11) % 12) + 1;

        return `${hour12}:${minutes.padStart(2, '0')} ${suffix}`;
    }

    /**
     * Format a date in RFC-2822 format for Mailgun's o:deliverytime parameter
     * Mailgun expects UTC time, so we format in UTC
     * @param {Date} date - Date object to format
     * @returns {string} RFC-2822 formatted date string in UTC (e.g., "Mon, 21 Oct 2024 06:00:00 +0000")
     */
    _formatRFC2822(date) {
        if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
            return null;
        }

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const dayName = days[date.getUTCDay()];
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = months[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        // RFC-2822 format with UTC timezone (+0000)
        return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
    }

    /**
     * Generate base email template HTML structure
     * @param {string} content - Main content HTML
     * @param {string} signature - Optional signature text for footer
     * @returns {string} Complete HTML email template
     */
    _generateEmailTemplate(content, signature = 'Best regards,<br><span style="color: #111827; font-weight: 500;">The isked Team</span>') {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <!--[if mso]>
    <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
    <!-- Wrapper -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <!-- Main Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 20px 30px 20px;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.5px;">isked</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 40px 40px;">
                            ${content}
                        </td>
                    </tr>
                    
                    ${this._generateEmailFooter(signature)}
                </table>
            </td>
        </tr>
    </table>
    
    <!-- Mobile Responsive Styles -->
    <style type="text/css">
        @media only screen and (max-width: 600px) {
            table[role="presentation"][width="600"] {
                width: 100% !important;
                border-radius: 0 !important;
            }
            td[style*="padding: 0 40px"] {
                padding-left: 20px !important;
                padding-right: 20px !important;
            }
            td[style*="padding: 40px 20px"] {
                padding: 30px 20px 20px 20px !important;
            }
            td[style*="padding: 30px 40px"] {
                padding: 20px 20px 30px 20px !important;
            }
            h1 {
                font-size: 24px !important;
            }
        }
    </style>
</body>
</html>`;
    }

    /**
     * Generate email footer HTML with contact information and copyright
     * @param {string} signature - Optional signature text (e.g., "Best regards, The isked Team")
     * @returns {string} HTML footer string
     */
    _generateEmailFooter(signature = 'Best regards,<br><span style="color: #111827; font-weight: 500;">The isked Team</span>') {
        const currentYear = new Date().getFullYear();
        return `
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 30px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #6b7280; text-align: center;">
                                ${signature}
                            </p>
                            <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #9ca3af; text-align: center;">
                                Questions? Contact us at <a href="mailto:team@smallsimplesteps.co" style="color: #3b82f6; text-decoration: none;">team@smallsimplesteps.co</a><br>
                                <span style="color: #d1d5db;">© ${currentYear} isked. All rights reserved.</span>
                            </p>
                        </td>
                    </tr>`;
    }

    /**
     * Calculate delivery time (X minutes before appointment start) in UTC
     * @param {string} dateStr - Date string in YYYY-MM-DD format
     * @param {string} startTimeStr - Time string in HH:MM format
     * @param {string} userTimezone - User's timezone (e.g., 'Asia/Manila')
     * @param {number} minutesBefore - Number of minutes before appointment (default: 60, use 30 for 30-minute reminders)
     * @returns {Date|null} Date object in UTC representing X minutes before appointment, or null if invalid
     */
    _calculateDeliveryTime(dateStr, startTimeStr, userTimezone, minutesBefore = 60) {
        if (!dateStr || !startTimeStr) {
            return null;
        }

        try {
            // Parse date and time components
            const [year, month, day] = dateStr.split('-').map(Number);
            const [hours, minutes] = startTimeStr.split(':').map(Number);

            if ([year, month, day, hours, minutes].some(Number.isNaN)) {
                return null;
            }

            // Get user's timezone
            const userTz = timezone.getUserTimezone(userTimezone);
            
            // Create a date string representing the appointment start time in the user's timezone
            // We'll use Intl.DateTimeFormat to properly convert from local time to UTC
            const dateTimeStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
            
            // Create a date object assuming the time is in the user's timezone
            // We'll use a workaround: create the date in UTC first, then adjust for timezone offset
            const tempDate = new Date(dateTimeStr + 'Z'); // Treat as UTC temporarily
            const offsetMinutes = timezone.getTimezoneOffset(userTz, tempDate);
            
            // Convert: If user is in UTC+8 (offset = +480), and appointment is at 14:00 local,
            // then UTC time = 14:00 - 8 hours = 06:00 UTC
            // So we subtract the offset from the UTC date we created
            const appointmentStartUTC = new Date(Date.UTC(
                year,
                month - 1,
                day,
                hours,
                minutes,
                0
            ));
            
            // Adjust for timezone: subtract offset to convert local time to UTC
            // offsetMinutes is positive for timezones ahead of UTC
            const appointmentStart = new Date(appointmentStartUTC.getTime() - (offsetMinutes * 60 * 1000));

            if (Number.isNaN(appointmentStart.getTime())) {
                return null;
            }

            // Subtract X minutes to get delivery time
            const deliveryTime = new Date(appointmentStart.getTime() - minutesBefore * 60 * 1000);

            // Check if delivery time is in the past
            if (deliveryTime < new Date()) {
                return null;
            }

            return deliveryTime;
        } catch (error) {
            return null;
        }
    }

    async scheduleTrialExpirationEmail(user, daysRemaining, deliveryTime, token) {
        if (!this.enabled) {
            return null;
        }

        if (!user || !deliveryTime || !token) {
            return null;
        }

        // Format delivery time in RFC-2822 format
        const rfc2822Time = this._formatRFC2822(deliveryTime);
        if (!rfc2822Time) {
            return null;
        }

        const upgradeLink = `${process.env.APP_URL || 'https://isked.app'}/upgrade/${token}`;
        const subject = daysRemaining === 1 
            ? 'Your ISKED Free Trial Expires Tomorrow - Upgrade Now'
            : 'Your ISKED Free Trial Expires Today - Upgrade Now';
        
        const daysText = daysRemaining === 1 ? 'tomorrow' : 'today';
        const urgencyText = daysRemaining === 1 ? 'Don\'t miss out!' : 'Act now to continue!';

        const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello ${user.name || user.full_name || user.username},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your ISKED free trial expires ${daysText}! ${urgencyText}
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">What happens next:</p>
                                <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Your trial access will end ${daysText}</li>
                                    <li style="margin-bottom: 8px;">Upgrade to Pro to keep all your features</li>
                                    <li>Unlimited bookings, contacts, and more</li>
                                </ul>
                            </div>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="${upgradeLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Upgrade to Pro Now</a>
                            </p>
                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                This link will expire in 7 days. If you have any questions, feel free to reply to this email.
                            </p>`;

        try {
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [user.email],
                'h:Reply-To': 'team@smallsimplesteps.co',
                subject: subject,
                text: `Hello ${user.name || user.full_name || user.username},

Your ISKED free trial expires ${daysText}! ${urgencyText}

What happens next:
- Your trial access will end ${daysText}
- Upgrade to Pro to keep all your features
- Unlimited bookings, contacts, and more

Upgrade now: ${upgradeLink}

This link will expire in 7 days. If you have any questions, feel free to reply to this email.

Best regards,
The isked Team`,
                html: this._generateEmailTemplate(content),
                'o:deliverytime': rfc2822Time
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    async sendTestTrialExpirationEmail() {
        if (!this.enabled) {
            return null;
        }

        const testUser = {
            email: 'tjtalusan@gmail.com',
            name: 'Test User',
            full_name: 'Test User',
            username: 'testuser'
        };

        const testToken = 'test-token-' + Date.now();

        try {
            // Send email for "1 day before" scenario - schedule for 1 minute from now for testing
            const deliveryTime1 = new Date();
            deliveryTime1.setMinutes(deliveryTime1.getMinutes() + 1);

            await this.scheduleTrialExpirationEmail(testUser, 1, deliveryTime1, testToken + '-1day');

            // Send email for "expiration day" scenario - schedule for 2 minutes from now for testing
            const deliveryTime2 = new Date();
            deliveryTime2.setMinutes(deliveryTime2.getMinutes() + 2);

            await this.scheduleTrialExpirationEmail(testUser, 0, deliveryTime2, testToken + '-today');

            return { success: true, message: 'Test emails scheduled (will arrive in 1-2 minutes)' };
        } catch (error) {
            throw error;
        }
    }

    async sendPaymentProof(user, planType, planPrice, attachmentPath, attachmentName) {
        if (!this.enabled) {
            return null;
        }

        const adminEmail = 'tjtalusan@gmail.com';
        const planName = planType === 'monthly' ? 'Monthly (PHP 499)' : 'Yearly (PHP 3,999)';
        const adminUrl = `${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}`;

        const content = `
                            <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #111827; text-align: center; font-weight: 600;">
                                New Payment Proof Submission
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">User Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${user.display_name || user.full_name || 'N/A'}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email}</a></p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Username: ${user.username || 'N/A'}</p>
                                <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">User ID: ${user.id}</p>
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Subscription Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Plan: ${planName}</p>
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">Price: ${planPrice}</p>
                            </div>
                            <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e40af; text-align: center;">
                                    Please review the attached payment proof and activate the user's Pro subscription if verified.
                                </p>
                                <p style="margin: 0; text-align: center;">
                                    <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User Profile in Admin Dashboard</a>
                                </p>
                            </div>`;

        try {
            const messageData = {
                from: `isked <postmaster@${this.domain}>`,
                to: [adminEmail],
                subject: `Payment Proof - ${user.display_name || user.full_name || user.email} - ${planName}`,
                text: `New payment proof submission:

User Details:
- Name: ${user.display_name || user.full_name || 'N/A'}
- Email: ${user.email}
- Username: ${user.username || 'N/A'}

Subscription Details:
- Plan: ${planName}
- Price: ${planPrice}

Please review the attached payment proof and activate the user's Pro subscription if verified.

User ID: ${user.id}

View user profile: ${adminUrl}
`,
                html: this._generateEmailTemplate(content)
            };

            // Add attachment if provided
            if (attachmentPath && attachmentName) {
                try {
                    // Read file as buffer for Mailgun
                    const fileBuffer = fs.readFileSync(attachmentPath);
                    messageData.attachment = [{
                        filename: attachmentName,
                        data: fileBuffer
                    }];
                } catch (fileError) {
                    console.error('Error reading attachment file:', fileError);
                    // Continue without attachment if file read fails
                }
            }

            const result = await mg.messages.create(this.domain, messageData);
            return result;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new MailService(); 