const fs = require('fs');
const timezone = require('../utils/timezone');
const mailer = require('./mailer');

class MailService {
    constructor() {
        this.enabled = mailer.isEnabled();
        this.domain = process.env.MAILGUN_DOMAIN || null;
        if (!this.enabled) {
            console.error('[MAIL SERVICE] Disabled - Set RESEND_API_KEY or MAILGUN_DOMAIN + MAILGUN_API_KEY');
        } else {
            const provider = mailer.getProvider();
            if (provider === 'resend') {
                console.error('[MAIL SERVICE] Enabled - Provider: resend, from:', mailer.formatResendFromHeader());
            } else {
                console.error('[MAIL SERVICE] Enabled - Provider: mailgun, domain:', this.domain);
            }
        }
    }

    /**
     * @param {{
     *   to: string | string[],
     *   subject: string,
     *   text: string,
     *   html: string,
     *   replyTo?: string | null,
     *   attachments?: Array<{ filename: string, data: Buffer }>,
     *   scheduledAt?: Date | null,
     * }} payload
     */
    async _sendEmail(payload) {
        return mailer.sendMessage(payload);
    }

    _mailgunMessageDataToPayload(messageData) {
        const payload = {
            to: messageData.to,
            subject: messageData.subject,
            text: messageData.text,
            html: messageData.html
        };
        const replyTo = messageData.replyTo || messageData['h:Reply-To'];
        if (replyTo) {
            payload.replyTo = replyTo;
        }
        if (messageData.attachment && messageData.attachment.length) {
            payload.attachments = messageData.attachment.map((att) => ({
                filename: att.filename,
                data: att.data
            }));
        }
        if (messageData.scheduledAt) {
            payload.scheduledAt = messageData.scheduledAt;
        }
        return payload;
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
            
            const result = await this._sendEmail({
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
            const result = await this._sendEmail({
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
            const result = await this._sendEmail({
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
            const result = await this._sendEmail({
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
            const result = await this._sendEmail({
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
            const result = await this._sendEmail({
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
                scheduledAt: deliveryTime
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
            const result = await this._sendEmail({
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
                scheduledAt: deliveryTime
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
            const result = await this._sendEmail({
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
                scheduledAt: deliveryTime
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
            const result = await this._sendEmail({
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
                scheduledAt: deliveryTime
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
            
            const result = await this._sendEmail({
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
            
            const result = await this._sendEmail({
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

    /**
     * Send admin notification when a new user signs up
     * @param {{ id: number, full_name: string, email: string, username: string }} user - New user details
     */
    async sendAdminNewUserNotification(user) {
        if (!this.enabled) {
            return null;
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'tjtalusan@gmail.com';
        const adminUrl = `${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}`;

        const content = `
                            <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #111827; text-align: center; font-weight: 600;">
                                New User Sign-Up
                            </p>
                            <div style="background-color: #dcfce7; border-left: 4px solid #22c55e; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">User Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${user.full_name || 'N/A'}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email}</a></p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Username: ${user.username || 'N/A'}</p>
                                <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">User ID: ${user.id}</p>
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Account Status:</p>
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">5-day free trial started</p>
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User in Admin Dashboard</a>
                            </p>`;

        try {
            const result = await this._sendEmail({
                to: [adminEmail],
                subject: `New Sign-Up: ${user.full_name || user.email}`,
                text: `New user sign-up

User Details:
- Name: ${user.full_name || 'N/A'}
- Email: ${user.email}
- Username: ${user.username || 'N/A'}
- User ID: ${user.id}

Account Status: 5-day free trial started

View user: ${adminUrl}`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Send all 3 sample admin notification emails to a specified address (for preview/testing)
     * @param {string} toEmail - Email address to send samples to (e.g. tjtalusan@gmail.com)
     * @returns {Promise<Array<{type: string, success: boolean}>>}
     */
    async sendSampleAdminNotifications(toEmail) {
        if (!this.enabled) {
            return [];
        }

        const results = [];

        // 1. Sample: New user sign-up
        const sampleNewUser = {
            id: 99999,
            full_name: 'Sample New User',
            email: 'sample.user@example.com',
            username: 'sampleuser'
        };
        await this._sendAdminNewUserNotificationTo(sampleNewUser, toEmail, true);
        results.push({ type: 'New User Sign-Up', success: true });

        // 2. Sample: User subscribed (payment proof)
        const sampleSubscriber = {
            id: 99998,
            display_name: 'Sample Subscriber',
            full_name: 'Sample Subscriber',
            email: 'subscriber@example.com',
            username: 'subscriber'
        };
        await this._sendPaymentProofTo(sampleSubscriber, 'monthly', 'PHP 499', null, null, toEmail, true);
        results.push({ type: 'User Subscribed (Payment)', success: true });

        // 3. Sample: Trial expiring tomorrow
        const sampleTrialUser = {
            id: 99997,
            full_name: 'Sample Trial User',
            name: 'Sample Trial User',
            email: 'trial.user@example.com',
            username: 'trialuser'
        };
        await this.sendAdminTrialExpiringNotification(sampleTrialUser, toEmail);
        results.push({ type: 'Trial Expiring Tomorrow', success: true });

        return results;
    }

    async _sendAdminNewUserNotificationTo(user, toEmail, isSample = false) {
        if (!this.enabled) return null;

        const adminUrl = `${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}`;
        const subjectPrefix = isSample ? '[SAMPLE] ' : '';

        const content = `
                            <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #111827; text-align: center; font-weight: 600;">
                                New User Sign-Up
                            </p>
                            <div style="background-color: #dcfce7; border-left: 4px solid #22c55e; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">User Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${user.full_name || 'N/A'}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email}</a></p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Username: ${user.username || 'N/A'}</p>
                                <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">User ID: ${user.id}</p>
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Account Status:</p>
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">5-day free trial started</p>
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User in Admin Dashboard</a>
                            </p>`;

        return this._sendEmail({
            to: [toEmail],
            subject: `${subjectPrefix}New Sign-Up: ${user.full_name || user.email}`,
            text: `New user sign-up\n\nUser Details:\n- Name: ${user.full_name || 'N/A'}\n- Email: ${user.email}\n- Username: ${user.username || 'N/A'}\n- User ID: ${user.id}\n\nAccount Status: 5-day free trial started\n\nView user: ${adminUrl}`,
            html: this._generateEmailTemplate(content)
        });
    }

    async _sendPaymentProofTo(user, planType, planPrice, attachmentPath, attachmentName, toEmail, isSample = false) {
        if (!this.enabled) return null;

        const planName = planType === 'monthly' ? 'Monthly (PHP 499)' : 'Yearly (PHP 4,788)';
        const adminUrl = `${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}`;
        const subjectPrefix = isSample ? '[SAMPLE] ' : '';

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

        const messageData = {
            to: [toEmail],
            subject: `${subjectPrefix}Payment Proof - ${user.display_name || user.full_name || user.email} - ${planName}`,
            text: `New payment proof submission:\n\nUser Details:\n- Name: ${user.display_name || user.full_name || 'N/A'}\n- Email: ${user.email}\n- Username: ${user.username || 'N/A'}\n\nSubscription Details:\n- Plan: ${planName}\n- Price: ${planPrice}\n\nView user: ${adminUrl}`,
            html: this._generateEmailTemplate(content)
        };

        if (attachmentPath && attachmentName) {
            try {
                const fileBuffer = fs.readFileSync(attachmentPath);
                messageData.attachment = [{ filename: attachmentName, data: fileBuffer }];
            } catch (fileError) {
                console.error('Error reading attachment file:', fileError);
            }
        }

        return this._sendEmail(this._mailgunMessageDataToPayload(messageData));
    }

    /**
     * Send admin notification immediately (for trial expiring tomorrow - use for samples/tests)
     * @param {{ id: number, full_name: string, email: string, username: string }} user - User whose trial is expiring
     * @param {string} [adminEmailOverride] - Optional override for recipient (e.g. for samples)
     */
    async sendAdminTrialExpiringNotification(user, adminEmailOverride = null) {
        if (!this.enabled) {
            return null;
        }

        if (!user) {
            return null;
        }

        const toEmail = adminEmailOverride || process.env.ADMIN_EMAIL || 'tjtalusan@gmail.com';
        const isSample = !!adminEmailOverride;
        const subjectPrefix = isSample ? '[SAMPLE] ' : '';
        const adminUrl = `${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}`;

        const content = `
                            <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #111827; text-align: center; font-weight: 600;">
                                Trial Expiring Tomorrow
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">User Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${user.full_name || user.name || 'N/A'}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email}</a></p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Username: ${user.username || 'N/A'}</p>
                                <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">User ID: ${user.id}</p>
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Reminder:</p>
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">This user's 5-day free trial expires tomorrow. Consider reaching out to encourage upgrade.</p>
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User in Admin Dashboard</a>
                            </p>`;

        try {
            const result = await this._sendEmail({
                to: [toEmail],
                subject: `${subjectPrefix}Trial Expiring Tomorrow: ${user.full_name || user.name || user.email}`,
                text: `${subjectPrefix}Trial expiring tomorrow

User Details:
- Name: ${user.full_name || user.name || 'N/A'}
- Email: ${user.email}
- Username: ${user.username || 'N/A'}
- User ID: ${user.id}

This user's 5-day free trial expires tomorrow. Consider reaching out to encourage upgrade.

View user: ${adminUrl}`,
                html: this._generateEmailTemplate(content)
            });
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Schedule admin notification 1 day before a user's trial expires
     * @param {{ id: number, full_name: string, email: string, username: string }} user - User whose trial is expiring
     * @param {Date} deliveryTime - When to send (1 day before trial expires)
     */
    async scheduleAdminTrialExpiringNotification(user, deliveryTime) {
        if (!this.enabled) {
            return null;
        }

        if (!user || !deliveryTime) {
            return null;
        }

        const rfc2822Time = this._formatRFC2822(deliveryTime);
        if (!rfc2822Time) {
            return null;
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'tjtalusan@gmail.com';
        const adminUrl = `${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}`;

        const content = `
                            <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #111827; text-align: center; font-weight: 600;">
                                Trial Expiring Tomorrow
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">User Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: ${user.full_name || user.name || 'N/A'}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email}</a></p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Username: ${user.username || 'N/A'}</p>
                                <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">User ID: ${user.id}</p>
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Reminder:</p>
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">This user's 5-day free trial expires tomorrow. Consider reaching out to encourage upgrade.</p>
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User in Admin Dashboard</a>
                            </p>`;

        try {
            const result = await this._sendEmail({
                to: [adminEmail],
                subject: `Trial Expiring Tomorrow: ${user.full_name || user.name || user.email}`,
                text: `Trial expiring tomorrow

User Details:
- Name: ${user.full_name || user.name || 'N/A'}
- Email: ${user.email}
- Username: ${user.username || 'N/A'}
- User ID: ${user.id}

This user's 5-day free trial expires tomorrow. Consider reaching out to encourage upgrade.

View user: ${adminUrl}`,
                html: this._generateEmailTemplate(content),
                scheduledAt: deliveryTime
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
            // Get user's timezone
            const userTz = timezone.getUserTimezone(userTimezone);
            
            // Use the localToUtc helper function for proper timezone conversion
            // This converts the local booking time to UTC correctly
            const appointmentStartUtc = timezone.localToUtc(dateStr, startTimeStr, userTz);

            if (!appointmentStartUtc || Number.isNaN(appointmentStartUtc.getTime())) {
                return null;
            }

            // Subtract X minutes to get delivery time
            const deliveryTime = new Date(appointmentStartUtc.getTime() - minutesBefore * 60 * 1000);

            // Check if delivery time is in the past
            if (deliveryTime < new Date()) {
                return null;
            }

            return deliveryTime;
        } catch (error) {
            console.error('[MAIL SERVICE] Error calculating delivery time:', error);
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
            const result = await this._sendEmail({
                to: [user.email],
                replyTo: 'team@smallsimplesteps.co',
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
                scheduledAt: deliveryTime
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

        const adminEmail = process.env.ADMIN_EMAIL || 'tjtalusan@gmail.com';
        const planName = planType === 'monthly' ? 'Monthly (PHP 499)' : 'Yearly (PHP 4,788)';
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

            const result = await this._sendEmail(this._mailgunMessageDataToPayload(messageData));
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Replace template variables in a string
     * @param {string} template - Template string with {{variable}} placeholders
     * @param {object} variables - Object with variable values
     * @returns {string} Processed string with variables replaced
     */
    replaceTemplateVariables(template, variables = {}) {
        if (!template || typeof template !== 'string') {
            return template;
        }

        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, value || '');
        }

        return result;
    }

    /**
     * Send a custom email with template variable support
     * @param {string} to - Recipient email address
     * @param {string} subject - Email subject (supports template variables)
     * @param {string} body - Email body HTML (supports template variables)
     * @param {object} variables - Variables to replace in subject and body
     * @param {string} replyTo - Optional reply-to email address
     * @returns {Promise} Mailgun API response
     */
    async sendCustomEmail(to, subject, body, variables = {}, replyTo = null) {
        if (!this.enabled) {
            console.warn('Mail service is disabled. Email not sent to:', to);
            return null;
        }

        if (!to || !subject || !body) {
            throw new Error('To, subject, and body are required');
        }

        // Validate email address format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            throw new Error(`Invalid email address: ${to}`);
        }

        // Replace variables in subject and body
        const processedSubject = this.replaceTemplateVariables(subject, variables);
        const processedBody = this.replaceTemplateVariables(body, variables);

        // Generate plain text version from HTML (simple strip)
        const plainText = processedBody
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();

        try {
            const messageData = {
                to: [to],
                subject: processedSubject,
                text: plainText,
                html: this._generateEmailTemplate(processedBody)
            };

            // Add reply-to header if provided
            if (replyTo && replyTo.trim()) {
                messageData.replyTo = replyTo.trim();
            }

            const result = await this._sendEmail(this._mailgunMessageDataToPayload(messageData));
            
            // Log successful email send
            const logMessage = `[EMAIL SENT] To: ${to} | Subject: ${processedSubject} | MessageID: ${result.id || 'N/A'} | Provider: ${result.provider || mailer.getProvider()}`;
            console.error(logMessage);
            
            // Also log to file for easier tracking
            try {
                const path = require('path');
                const logFile = path.join(__dirname, '..', 'email-send.log');
                const logEntry = `[${new Date().toISOString()}] ${logMessage}\n`;
                fs.appendFileSync(logFile, logEntry);
            } catch (fileError) {
                console.error('[EMAIL LOG ERROR] Failed to write to log file:', fileError.message);
            }
            
            return result;
        } catch (error) {
            // Enhanced error logging
            const errorLog = {
                to: to,
                subject: processedSubject,
                domain: this.domain,
                error: error.message,
                errorDetails: error.response?.body || error.response?.data || error
            };
            console.error('[EMAIL ERROR]', JSON.stringify(errorLog, null, 2));
            throw error;
        }
    }

    _formatFrequencyLabel(frequency) {
        const labels = {
            weekly: 'Weekly',
            biweekly: 'Every 2 weeks',
            monthly: 'Monthly',
            custom: 'Custom dates'
        };
        return labels[frequency] || frequency;
    }

    _formatOccurrencesList(bookings) {
        return bookings
            .map((b) => {
                const d = this._formatBookingDate(b.date);
                const start = b.formatted_start_time || this._formatTime(b.start_time);
                const end = b.formatted_end_time || this._formatTime(b.end_time);
                return `<li style="margin: 0 0 6px 0; font-size: 15px; color: #374151;">${d} — ${start} to ${end}</li>`;
            })
            .join('');
    }

    _formatOccurrencesListPlain(bookings) {
        return bookings
            .map((b) => {
                const d = this._formatBookingDate(b.date);
                const start = b.formatted_start_time || this._formatTime(b.start_time);
                const end = b.formatted_end_time || this._formatTime(b.end_time);
                return `- ${d}: ${start} - ${end}`;
            })
            .join('\n');
    }

    async sendRecurringSeriesClientInvite(series, bookings, host, portalUrl) {
        if (!this.enabled || !bookings.length || !portalUrl) {
            return null;
        }

        const hostName = host.name || host.display_name || host.full_name || host.username;
        const frequencyLabel = this._formatFrequencyLabel(series.frequency);
        const listHtml = this._formatOccurrencesList(bookings);
        const plainList = this._formatOccurrencesListPlain(bookings);

        const content = `
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                Hello ${series.client_name},
            </p>
            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                ${hostName} proposed ${bookings.length} meetings with you (${frequencyLabel}).
                Please confirm <strong>each meeting</strong> before it is added to the calendar.
            </p>
            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                <ul style="margin: 0; padding-left: 20px;">${listHtml}</ul>
                ${series.notes ? `<p style="margin: 16px 0 0 0; font-size: 15px; color: #374151;">Notes: ${series.notes}</p>` : ''}
            </div>
            <p style="margin: 0 0 24px 0; text-align: center;">
                <a href="${portalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500;">Review &amp; confirm meetings</a>
            </p>
            <p style="margin: 0; font-size: 14px; color: #6b7280; text-align: center;">
                Calendar invites and reminders are sent only after you confirm each date.
            </p>`;

        try {
            return await this._sendEmail({
                to: [series.client_email],
                subject: `Please confirm your meetings with ${hostName}`,
                text: `Hello ${series.client_name},\n\n${hostName} proposed ${bookings.length} meetings (${frequencyLabel}). Confirm each meeting before it is added to the calendar.\n\n${plainList}\n\nConfirm here:\n${portalUrl}\n\nCalendar invites and reminders are sent only after you confirm each date.`,
                html: this._generateEmailTemplate(content)
            });
        } catch (error) {
            throw error;
        }
    }

    async sendRecurringSeriesHostPendingNotification(series, bookings, host, portalUrl) {
        if (!this.enabled || !bookings.length) {
            return null;
        }

        const hostName = host.name || host.display_name || host.full_name || host.username;
        const frequencyLabel = this._formatFrequencyLabel(series.frequency);
        const listHtml = this._formatOccurrencesList(bookings);
        const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/client-schedules`;
        const plainList = this._formatOccurrencesListPlain(bookings);

        const content = `
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; text-align: center;">Hello ${hostName},</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333333; text-align: center;">
                You created ${bookings.length} meetings with ${series.client_name} (${frequencyLabel}).
                They are <strong>pending client confirmation</strong> — nothing is on your calendar until the client confirms each date.
            </p>
            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                <ul style="margin: 0; padding-left: 20px;">${listHtml}</ul>
            </div>
            ${portalUrl ? `<p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280; text-align: center;">Client confirmation link:<br><a href="${portalUrl}" style="color: #3b82f6;">${portalUrl}</a></p>` : ''}
            <p style="margin: 0; text-align: center;">
                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500;">View Client Schedules</a>
            </p>`;

        try {
            return await this._sendEmail({
                to: [host.email],
                subject: `Recurring schedule created (awaiting confirmation): ${series.client_name}`,
                text: `Hello ${hostName},\n\nYou created ${bookings.length} meetings with ${series.client_name} (${frequencyLabel}). They are pending client confirmation.\n\n${plainList}${portalUrl ? `\n\nClient link:\n${portalUrl}\n` : ''}\n\nView: ${dashboardUrl}`,
                html: this._generateEmailTemplate(content)
            });
        } catch (error) {
            throw error;
        }
    }

    async sendRecurringSeriesClientConfirmation(series, bookings, host) {
        if (!this.enabled || !bookings.length) {
            return null;
        }

        const hostName = host.name || host.display_name || host.full_name || host.username;
        const frequencyLabel = this._formatFrequencyLabel(series.frequency);
        const listHtml = this._formatOccurrencesList(bookings);
        const first = bookings[0];
        const formattedStart = first.formatted_start_time || this._formatTime(first.start_time);
        const formattedEnd = first.formatted_end_time || this._formatTime(first.end_time);
        const portalUrl = series.client_confirmation_token
            ? `${process.env.APP_URL || 'https://isked.app'}/schedule/series/${series.client_confirmation_token}`
            : null;

        const content = `
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                Hello ${series.client_name},
            </p>
            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                Your recurring appointments with ${hostName} have been scheduled (${frequencyLabel}, ${bookings.length} meetings).
            </p>
            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                <p style="margin: 0 0 12px 0; font-size: 15px; color: #111827; font-weight: 500;">Each session: ${formattedStart} - ${formattedEnd}</p>
                ${host.meeting_link ? `<p style="margin: 0 0 12px 0; font-size: 15px; color: #374151;">Meeting link: <a href="${host.meeting_link}" style="color: #3b82f6;">${host.meeting_link}</a></p>` : ''}
                <ul style="margin: 12px 0 0 0; padding-left: 20px;">${listHtml}</ul>
                ${series.notes ? `<p style="margin: 16px 0 0 0; font-size: 15px; color: #374151;">Notes: ${series.notes}</p>` : ''}
            </div>
            ${portalUrl ? `<p style="margin: 0 0 24px 0; text-align: center;">
                <a href="${portalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500;">View schedule &amp; add to calendar</a>
            </p>` : ''}
            <p style="margin: 0; font-size: 16px; color: #333333; text-align: center;">Thank you for using isked!</p>`;

        const plainList = this._formatOccurrencesListPlain(bookings);

        try {
            return await this._sendEmail({
                to: [series.client_email],
                subject: `Recurring appointments confirmed with ${hostName}`,
                text: `Hello ${series.client_name},\n\nYour ${bookings.length} recurring appointments (${frequencyLabel}) with ${hostName} are confirmed.\n\nTime each session: ${formattedStart} - ${formattedEnd}\n${host.meeting_link ? `Meeting link: ${host.meeting_link}\n` : ''}\n${plainList}${portalUrl ? `\n\nView your schedule and add meetings to your calendar:\n${portalUrl}\n` : ''}\n\nThank you!`,
                html: this._generateEmailTemplate(content)
            });
        } catch (error) {
            throw error;
        }
    }

    async sendRecurringSeriesHostNotification(series, bookings, host) {
        if (!this.enabled || !bookings.length) {
            return null;
        }

        const hostName = host.name || host.display_name || host.full_name || host.username;
        const frequencyLabel = this._formatFrequencyLabel(series.frequency);
        const listHtml = this._formatOccurrencesList(bookings);
        const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/client-schedules`;

        const content = `
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; text-align: center;">Hello ${hostName},</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333333; text-align: center;">
                You scheduled ${bookings.length} recurring meetings with ${series.client_name} (${frequencyLabel}).
            </p>
            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #374151;">Client: ${series.client_name}</p>
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #374151;">Email: ${series.client_email}</p>
                ${series.client_phone ? `<p style="margin: 0 0 12px 0; font-size: 15px; color: #374151;">Phone: ${series.client_phone}</p>` : ''}
                <ul style="margin: 12px 0 0 0; padding-left: 20px;">${listHtml}</ul>
            </div>
            <p style="margin: 0; text-align: center;">
                <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500;">View Client Schedules</a>
            </p>`;

        const plainList = this._formatOccurrencesListPlain(bookings);

        try {
            return await this._sendEmail({
                to: [host.email],
                subject: `Recurring schedule created: ${series.client_name}`,
                text: `Hello ${hostName},\n\nYou created ${bookings.length} recurring meetings with ${series.client_name} (${frequencyLabel}).\n\n${plainList}\n\nView: ${dashboardUrl}`,
                html: this._generateEmailTemplate(content)
            });
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new MailService(); 