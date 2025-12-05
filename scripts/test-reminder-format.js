#!/usr/bin/env node

/**
 * Test script to send 1-hour reminder emails with short delay to see the format
 * Sends to tjtalusan@gmail.com for both client and host reminders
 */

require('dotenv').config();
const FormData = require('form-data');
const Mailgun = require('mailgun.js');

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere'
});

const domain = process.env.MAILGUN_DOMAIN;

function formatRFC2822(date) {
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

    return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

function formatTime(time) {
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

function formatBookingDate(date) {
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

async function testReminderFormat() {
    try {
        if (!domain || !process.env.MAILGUN_API_KEY) {
            console.error('Error: MAILGUN_DOMAIN and MAILGUN_API_KEY must be set in .env');
            process.exit(1);
        }

        console.log('Sending test 1-hour reminder emails to tjtalusan@gmail.com...\n');

        // Create mock booking object
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];
        const startTime = '14:30';
        const endTime = '15:30';

        const booking = {
            client_name: 'Test Client',
            client_email: 'tjtalusan@gmail.com',
            date: dateStr,
            start_time: startTime,
            end_time: endTime,
            notes: 'This is a test appointment to view the email format'
        };

        const host = {
            name: 'Test Host',
            username: 'testhost',
            email: 'tjtalusan@gmail.com',
            meeting_link: 'https://meet.google.com/test-link'
        };

        // Set delivery time to 2 minutes from now for quick testing
        const deliveryTime = new Date(Date.now() + 2 * 60 * 1000);
        const rfc2822Time = formatRFC2822(deliveryTime);

        const formattedDate = formatBookingDate(booking.date);
        const formattedStartTime = formatTime(booking.start_time);
        const formattedEndTime = formatTime(booking.end_time);

        console.log('=== Sending Client Reminder ===');
        console.log(`Appointment: ${dateStr} at ${startTime}`);
        console.log(`Delivery time: ${deliveryTime.toLocaleString()} (2 minutes from now for testing)\n`);

        // Send client reminder
        try {
            const clientResult = await mg.messages.create(domain, {
                from: `isked <postmaster@${domain}>`,
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
                'o:deliverytime': rfc2822Time
            });
            console.log('✓ Client reminder scheduled successfully');
            console.log(`  Message ID: ${clientResult.id || 'N/A'}\n`);
        } catch (error) {
            console.error('✗ Error sending client reminder:', error.message);
        }

        console.log('=== Sending Host Reminder ===\n');

        // Send host reminder
        try {
            const hostResult = await mg.messages.create(domain, {
                from: `isked <postmaster@${domain}>`,
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
Manage the booking at ${process.env.APP_URL || 'https://isked.app'}/dashboard.
`,
                'o:deliverytime': rfc2822Time
            });
            console.log('✓ Host reminder scheduled successfully');
            console.log(`  Message ID: ${hostResult.id || 'N/A'}\n`);
        } catch (error) {
            console.error('✗ Error sending host reminder:', error.message);
        }

        console.log('=== Test Complete ===');
        console.log('Check tjtalusan@gmail.com in about 2 minutes to see both email formats.');
        console.log('You will receive:');
        console.log('  1. Client reminder email (subject: "Reminder: Your appointment starts in 1 hour")');
        console.log('  2. Host reminder email (subject: "Reminder: Test Client meets you in 1 hour")');

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testReminderFormat().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

