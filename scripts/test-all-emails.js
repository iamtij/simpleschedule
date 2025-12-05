require('dotenv').config();
const mailService = require('../services/mail');

// Sample data for testing
const testEmail = 'tjtalusan@gmail.com';

const buildSampleBooking = (clientEmail) => {
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const toDateString = (date) => date.toISOString().split('T')[0];
    const toTimeString = (date) => date.toISOString().split('T')[1].slice(0, 5);

    const formatTime12Hour = (date) => {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const suffix = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes.toString().padStart(2, '0')} ${suffix}`;
    };

    return {
        id: 1,
        client_name: 'John Doe',
        client_email: clientEmail,
        client_phone: '639171234567',
        date: toDateString(start),
        start_time: toTimeString(start),
        end_time: toTimeString(end),
        formatted_start_time: formatTime12Hour(start),
        formatted_end_time: formatTime12Hour(end),
        notes: 'Sample appointment notes for testing email templates.',
        confirmation_uuid: 'test-confirmation-uuid'
    };
};

const buildSampleHost = (email) => {
    return {
        name: 'Jane Smith',
        username: 'janesmith',
        email: email,
        meeting_link: 'https://zoom.us/j/123456789',
        timezone: 'Asia/Manila'
    };
};

const buildSampleUser = () => {
    return {
        name: 'Test User',
        email: testEmail,
        display_name: 'Test User',
        full_name: 'Test User Full Name',
        username: 'testuser',
        id: 999
    };
};

// Temporarily override methods to add subject prefixes
const originalMethods = {};

function wrapMethod(methodName, subjectPrefix) {
    originalMethods[methodName] = mailService[methodName].bind(mailService);
    
    mailService[methodName] = async function(...args) {
        if (!this.enabled) return null;
        
        // Call original method but intercept the Mailgun call
        // We need to access the internal mg client, so we'll modify the subject after
        const result = await originalMethods[methodName](...args);
        return result;
    };
}

// Better approach: directly modify the subject in the mail service methods temporarily
async function sendAllTestEmails() {
    console.log('Sending all test emails to', testEmail, '...\n');

    const booking = buildSampleBooking(testEmail);
    const host = buildSampleHost(testEmail);
    const user = buildSampleUser();

    // Store original methods
    const sendTestEmail = mailService.sendTestEmail.bind(mailService);
    const sendClientConfirmation = mailService.sendClientConfirmation.bind(mailService);
    const sendHostNotification = mailService.sendHostNotification.bind(mailService);
    const sendClientReminder = mailService.sendClientReminder.bind(mailService);
    const sendHostReminder = mailService.sendHostReminder.bind(mailService);
    const scheduleClientReminder1Hour = mailService.scheduleClientReminder1Hour.bind(mailService);
    const scheduleHostReminder1Hour = mailService.scheduleHostReminder1Hour.bind(mailService);
    const sendPasswordResetEmail = mailService.sendPasswordResetEmail.bind(mailService);
    const sendWelcomeEmail = mailService.sendWelcomeEmail.bind(mailService);
    const sendPaymentProof = mailService.sendPaymentProof.bind(mailService);

    // Temporarily override methods to add subject prefixes
    mailService.sendTestEmail = async function(to) {
        const result = await sendTestEmail(to);
        if (result && result.id) {
            // Subject is already set, but we can't change it after sending
            // So we need to modify it before sending
        }
        return result;
    };

    // Better: Create wrapper functions that modify the subject before calling
    const FormData = require('form-data');
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({
        username: 'api',
        key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere'
    });
    const domain = process.env.MAILGUN_DOMAIN;

    const emails = [
        {
            name: '1. TEST EMAIL',
            send: async () => {
                const content = `
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                This is a test email from your scheduling application - isked.
                            </p>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                This email demonstrates the new mobile-responsive design with centered layout and proper spacing.
                            </p>`;
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [testEmail],
                    subject: '[TEST 1] Test Email from isked',
                    text: 'This is a test email from your scheduling application - isked.',
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '2. CLIENT CONFIRMATION',
            send: async () => {
                const result = await sendClientConfirmation(booking, host);
                if (result) {
                    // Resend with modified subject
                    const formattedDate = mailService._formatBookingDate(booking.date);
                    const formattedStartTime = booking.formatted_start_time || mailService._formatTime(booking.start_time);
                    const formattedEndTime = booking.formatted_end_time || mailService._formatTime(booking.end_time);
                    const calendarLink = mailService._generateGoogleCalendarLink(booking, host);
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
                    return await mg.messages.create(domain, {
                        from: `isked <postmaster@${domain}>`,
                        to: [booking.client_email],
                        subject: '[TEST 2] Appointment Confirmed with ' + (host.name || host.username),
                        text: `Hello ${booking.client_name},\n\nYour appointment has been confirmed!\n\nDetails:\n- Date: ${formattedDate}\n- Time: ${formattedStartTime} - ${formattedEndTime}\n- With: ${host.name || host.username}\n${host.meeting_link ? `\nMeeting Link: ${host.meeting_link}` : ''}\n\n${booking.notes ? `Notes: ${booking.notes}\n\n` : ''}Thank you for using isked!\n\nYou can add this appointment to your calendar using this link:\n${calendarLink}`,
                        html: mailService._generateEmailTemplate(content)
                    });
                }
                return result;
            }
        },
        {
            name: '3. HOST NOTIFICATION',
            send: async () => {
                const formattedDate = mailService._formatBookingDate(booking.date);
                const formattedStartTime = booking.formatted_start_time || mailService._formatTime(booking.start_time);
                const formattedEndTime = booking.formatted_end_time || mailService._formatTime(booking.end_time);
                const dashboardUrl = `${process.env.APP_URL || 'https://isked.app'}/dashboard`;
                const calendarLink = mailService._generateGoogleCalendarLink(booking, host);
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [host.email],
                    subject: '[TEST 3] New Appointment: ' + booking.client_name,
                    text: `Hello ${host.name || host.username},\n\nYou have a new appointment scheduled!\n\nClient Details:\n- Name: ${booking.client_name}\n- Email: ${booking.client_email}\n${booking.client_phone ? `- Phone: ${booking.client_phone}` : ''}\n\nAppointment Details:\n- Date: ${formattedDate}\n- Time: ${formattedStartTime} - ${formattedEndTime}\n${booking.notes ? `- Notes: ${booking.notes}` : ''}\n${host.meeting_link ? `- Meeting Link: ${host.meeting_link}` : ''}\n\nYou can view and manage this appointment in your dashboard:\n${dashboardUrl}\n\nAdd to your calendar:\n${calendarLink}`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '4. CLIENT REMINDER (30 min)',
            send: async () => {
                const formattedDate = mailService._formatBookingDate(booking.date);
                const formattedStartTime = booking.formatted_start_time || mailService._formatTime(booking.start_time);
                const formattedEndTime = booking.formatted_end_time || mailService._formatTime(booking.end_time);
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [booking.client_email],
                    subject: '[TEST 4] Reminder: Your appointment starts in 30 minutes',
                    text: `Hi ${booking.client_name},\n\nJust a quick reminder that your appointment with ${host.name || host.username} begins in 30 minutes.\n\nDetails:\n- Date: ${formattedDate}\n- Time: ${formattedStartTime} - ${formattedEndTime}\n${host.meeting_link ? `- Join link: ${host.meeting_link}\n` : ''}${booking.notes ? `- Notes: ${booking.notes}\n` : ''}\nSee you soon!`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '5. HOST REMINDER (30 min)',
            send: async () => {
                const formattedDate = mailService._formatBookingDate(booking.date);
                const formattedStartTime = booking.formatted_start_time || mailService._formatTime(booking.start_time);
                const formattedEndTime = booking.formatted_end_time || mailService._formatTime(booking.end_time);
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [host.email],
                    subject: '[TEST 5] Reminder: ' + booking.client_name + ' meets you in 30 minutes',
                    text: `Hi ${host.name || host.username},\n\nHeads up—your meeting with ${booking.client_name} starts in 30 minutes.\n\nClient details:\n- Name: ${booking.client_name}\n- Email: ${booking.client_email}\n${booking.client_phone ? `- Phone: ${booking.client_phone}\n` : ''}\nAppointment details:\n- Date: ${formattedDate}\n- Time: ${formattedStartTime} - ${formattedEndTime}\n${host.meeting_link ? `- Meeting link: ${host.meeting_link}\n` : ''}${booking.notes ? `- Notes: ${booking.notes}\n` : ''}\nManage the booking at ${dashboardUrl}.`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '6. CLIENT REMINDER (1 hour)',
            send: async () => {
                const formattedDate = mailService._formatBookingDate(booking.date);
                const formattedStartTime = booking.formatted_start_time || mailService._formatTime(booking.start_time);
                const formattedEndTime = booking.formatted_end_time || mailService._formatTime(booking.end_time);
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [booking.client_email],
                    subject: '[TEST 6] Reminder: Your appointment starts in 1 hour',
                    text: `Hi ${booking.client_name},\n\nJust a friendly reminder that your appointment with ${host.name || host.username} begins in 1 hour.\n\nDetails:\n- Date: ${formattedDate}\n- Time: ${formattedStartTime} - ${formattedEndTime}\n${host.meeting_link ? `- Join link: ${host.meeting_link}\n` : ''}${booking.notes ? `- Notes: ${booking.notes}\n` : ''}\nSee you soon!`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '7. HOST REMINDER (1 hour)',
            send: async () => {
                const formattedDate = mailService._formatBookingDate(booking.date);
                const formattedStartTime = booking.formatted_start_time || mailService._formatTime(booking.start_time);
                const formattedEndTime = booking.formatted_end_time || mailService._formatTime(booking.end_time);
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [host.email],
                    subject: '[TEST 7] Reminder: ' + booking.client_name + ' meets you in 1 hour',
                    text: `Hi ${host.name || host.username},\n\nHeads up—your meeting with ${booking.client_name} starts in 1 hour.\n\nClient details:\n- Name: ${booking.client_name}\n- Email: ${booking.client_email}\n${booking.client_phone ? `- Phone: ${booking.client_phone}\n` : ''}\nAppointment details:\n- Date: ${formattedDate}\n- Time: ${formattedStartTime} - ${formattedEndTime}\n${host.meeting_link ? `- Meeting link: ${host.meeting_link}\n` : ''}${booking.notes ? `- Notes: ${booking.notes}\n` : ''}\nManage the booking at ${dashboardUrl}.`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '8. PASSWORD RESET',
            send: async () => {
                const resetToken = 'test-reset-token-' + Date.now();
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [testEmail],
                    subject: '[TEST 8] Reset Your Password - isked',
                    text: `Hello,\n\nYou have requested to reset your password for your isked account.\n\nPlease click the link below to reset your password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nThe isked Team`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '9. WELCOME EMAIL',
            send: async () => {
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
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [user.email],
                    subject: '[TEST 9] Welcome to isked! 🎉',
                    text: `Hello ${user.name},\n\nWelcome to isked! We're excited to have you on board.\n\nYour account has been successfully created and you can now:\n- Create and manage your schedule\n- Accept bookings from clients\n- Customize your availability\n- And much more!\n\nGet started by visiting your dashboard:\n${dashboardUrl}\n\nIf you have any questions or need assistance, feel free to reply to this email.\n\nBest regards,\nThe isked Team`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        },
        {
            name: '10. PAYMENT PROOF',
            send: async () => {
                const planName = 'Monthly (PHP 499)';
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
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">Price: PHP 499</p>
                            </div>
                            <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e40af; text-align: center;">
                                    Please review the attached payment proof and activate the user's Pro subscription if verified.
                                </p>
                                <p style="margin: 0; text-align: center;">
                                    <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User Profile in Admin Dashboard</a>
                                </p>
                            </div>`;
                return await mg.messages.create(domain, {
                    from: `isked <postmaster@${domain}>`,
                    to: [testEmail],
                    subject: '[TEST 10] Payment Proof - ' + (user.display_name || user.full_name || user.email) + ' - ' + planName,
                    text: `New payment proof submission:\n\nUser Details:\n- Name: ${user.display_name || user.full_name || 'N/A'}\n- Email: ${user.email}\n- Username: ${user.username || 'N/A'}\n\nSubscription Details:\n- Plan: ${planName}\n- Price: PHP 499\n\nPlease review the attached payment proof and activate the user's Pro subscription if verified.\n\nUser ID: ${user.id}\n\nView user profile: ${adminUrl}`,
                    html: mailService._generateEmailTemplate(content)
                });
            }
        }
    ];

    for (const email of emails) {
        try {
            console.log(`Sending: ${email.name}...`);
            const result = await email.send();
            if (result) {
                console.log(`✓ ${email.name} sent successfully (ID: ${result.id || 'N/A'})\n`);
            } else {
                console.log(`⚠ ${email.name} - Mail service not enabled\n`);
            }
            // Small delay between emails
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`✗ ${email.name} failed:`, error.message, '\n');
        }
    }

    console.log('All test emails sent!');
}

sendAllTestEmails().catch(console.error);
