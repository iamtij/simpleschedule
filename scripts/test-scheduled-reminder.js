#!/usr/bin/env node

/**
 * Test script for scheduled 1-hour reminder emails
 * 
 * Usage: node scripts/test-scheduled-reminder.js <username> <date> <start_time>
 * Example: node scripts/test-scheduled-reminder.js john 2024-12-25 14:30
 * 
 * This script tests the scheduled reminder functionality without creating actual bookings.
 */

require('dotenv').config();
const db = require('../db');
const mailService = require('../services/mail');
const timezone = require('../utils/timezone');

async function testScheduledReminder() {
    // Parse command-line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error('Usage: node scripts/test-scheduled-reminder.js <username> <date> <start_time>');
        console.error('Example: node scripts/test-scheduled-reminder.js john 2024-12-25 14:30');
        process.exit(1);
    }

    const [username, dateStr, startTimeStr] = args;

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        console.error('Error: Date must be in YYYY-MM-DD format');
        process.exit(1);
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(startTimeStr)) {
        console.error('Error: Time must be in HH:MM format (24-hour)');
        process.exit(1);
    }

    try {
        console.log('Testing scheduled 1-hour reminder emails...\n');
        console.log(`Username: ${username}`);
        console.log(`Date: ${dateStr}`);
        console.log(`Start Time: ${startTimeStr}\n`);

        // Fetch user data from database
        const userResult = await db.query(
            'SELECT id, full_name, display_name, email, username, meeting_link, timezone FROM users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            console.error(`Error: User with username "${username}" not found`);
            process.exit(1);
        }

        const user = userResult.rows[0];
        const userTimezone = timezone.getUserTimezone(user.timezone);

        console.log(`Found user: ${user.full_name || user.display_name || user.username}`);
        console.log(`User email: ${user.email}`);
        console.log(`User timezone: ${userTimezone}\n`);

        // Create mock booking object
        const [hours, minutes] = startTimeStr.split(':');
        const endHour = (parseInt(hours) + 1) % 24;
        const endTimeStr = `${String(endHour).padStart(2, '0')}:${minutes}`;
        
        // Format times (using private method - accessible in JavaScript)
        const formattedStartTime = mailService._formatTime(startTimeStr);
        const formattedEndTime = mailService._formatTime(endTimeStr);
        
        const booking = {
            id: 999999, // Mock ID
            client_name: 'Test Client',
            client_email: 'test@example.com',
            client_phone: null,
            date: dateStr,
            start_time: startTimeStr,
            end_time: endTimeStr,
            formatted_start_time: formattedStartTime,
            formatted_end_time: formattedEndTime,
            notes: 'This is a test booking',
            confirmation_uuid: 'test-uuid-12345'
        };

        // Create mock host object
        const host = {
            id: user.id,
            name: user.display_name || user.full_name || user.username,
            username: user.username,
            email: user.email,
            meeting_link: user.meeting_link
        };

        // Calculate delivery time (using private methods - accessible in JavaScript)
        const deliveryTime = mailService._calculateDeliveryTime(dateStr, startTimeStr, userTimezone);
        
        if (!deliveryTime) {
            console.error('Error: Could not calculate delivery time. Appointment may be less than 1 hour away or invalid.');
            process.exit(1);
        }

        const rfc2822Time = mailService._formatRFC2822(deliveryTime);

        console.log('=== Delivery Time Calculation ===');
        console.log(`Appointment start: ${dateStr} ${startTimeStr} (${userTimezone})`);
        console.log(`Delivery time (1 hour before): ${deliveryTime.toISOString()} (UTC)`);
        console.log(`RFC-2822 format: ${rfc2822Time}`);
        console.log(`Local time: ${deliveryTime.toLocaleString()}\n`);

        // Check if delivery time is in the past
        if (deliveryTime < new Date()) {
            console.warn('Warning: Delivery time is in the past. Mailgun will not schedule this email.\n');
        }

        console.log('=== Scheduling Reminder Emails ===\n');

        // Schedule client reminder
        console.log('Scheduling client reminder...');
        try {
            const clientResult = await mailService.scheduleClientReminder1Hour(booking, host, userTimezone);
            if (clientResult) {
                console.log('✓ Client reminder scheduled successfully');
                console.log(`  Message ID: ${clientResult.id || 'N/A'}`);
            } else {
                console.log('⚠ Client reminder not scheduled (may be disabled or invalid)');
            }
        } catch (error) {
            console.error('✗ Error scheduling client reminder:', error.message);
        }

        console.log('');

        // Schedule host reminder
        console.log('Scheduling host reminder...');
        try {
            const hostResult = await mailService.scheduleHostReminder1Hour(booking, host, userTimezone);
            if (hostResult) {
                console.log('✓ Host reminder scheduled successfully');
                console.log(`  Message ID: ${hostResult.id || 'N/A'}`);
            } else {
                console.log('⚠ Host reminder not scheduled (may be disabled or invalid)');
            }
        } catch (error) {
            console.error('✗ Error scheduling host reminder:', error.message);
        }

        console.log('\n=== Test Complete ===');
        console.log('Note: Emails will be delivered by Mailgun at the scheduled time.');
        console.log('Check your Mailgun dashboard to verify the scheduled messages.');

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Close database connection
        await db.end();
    }
}

// Run the test
testScheduledReminder().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

