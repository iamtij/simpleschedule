const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const fs = require('fs');

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
            const result = await mg.messages.create(this.domain, {
                from: `isked <postmaster@${this.domain}>`,
                to: [to],
                subject: 'Test Email from isked',
                text: 'This is a test email from your scheduling application - isked.',
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
${this._generateGoogleCalendarLink(booking, host)}`,
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
${process.env.APP_URL || 'https://isked.app'}/dashboard

Add to your calendar:
${this._generateGoogleCalendarLink(booking, host)}`,
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
`
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
Manage the booking at ${process.env.APP_URL || 'https://isked.app'}/dashboard.
`
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

    async sendPaymentProof(user, planType, planPrice, attachmentPath, attachmentName) {
        if (!this.enabled) {
            return null;
        }

        const adminEmail = 'tjtalusan@gmail.com';
        const planName = planType === 'monthly' ? 'Monthly (PHP 499)' : 'Yearly (PHP 3,999)';

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

View user profile: ${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}
`,
                html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #3b82f6; color: white; padding: 20px; border-radius: 6px 6px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 6px 6px; }
        .info-row { margin: 10px 0; padding: 10px; background-color: white; border-radius: 4px; }
        .label { font-weight: bold; color: #4b5563; }
        .value { color: #111827; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Payment Proof Submission</h1>
        </div>
        <div class="content">
            <h2>User Details</h2>
            <div class="info-row">
                <span class="label">Name:</span> <span class="value">${user.display_name || user.full_name || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="label">Email:</span> <span class="value">${user.email}</span>
            </div>
            <div class="info-row">
                <span class="label">Username:</span> <span class="value">${user.username || 'N/A'}</span>
            </div>
            
            <h2 style="margin-top: 20px;">Subscription Details</h2>
            <div class="info-row">
                <span class="label">Plan:</span> <span class="value">${planName}</span>
            </div>
            <div class="info-row">
                <span class="label">Price:</span> <span class="value">${planPrice}</span>
            </div>
            <div class="info-row">
                <span class="label">User ID:</span> <span class="value">${user.id}</span>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 4px;">
                <p style="margin-bottom: 15px;">
                    Please review the attached payment proof and activate the user's Pro subscription if verified.
                </p>
                <p style="text-align: center; margin-top: 15px;">
                    <a href="${process.env.APP_URL || 'https://isked.app'}/admin/users?search=${encodeURIComponent(user.email)}" 
                       style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500;">
                        View User Profile in Admin Dashboard
                    </a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>`
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