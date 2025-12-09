#!/usr/bin/env node

require('dotenv').config();
const db = require('../db');
const timezone = require('../utils/timezone');

async function testActualBooking() {
    try {
        console.log('=== Testing Actual Booking ===\n');
        
        // Get the most recent booking for ttalusan@gmail.com
        const bookingResult = await db.query(`
            SELECT 
                b.id,
                b.date,
                b.start_time,
                b.end_time,
                b.client_name,
                b.client_email,
                b.created_at,
                u.timezone as user_timezone,
                u.username,
                u.email as host_email
            FROM bookings b
            JOIN users u ON u.id = b.user_id
            WHERE b.client_email = $1
            ORDER BY b.created_at DESC
            LIMIT 1
        `, ['ttalusan@gmail.com']);

        if (bookingResult.rows.length === 0) {
            console.log('❌ No booking found for ttalusan@gmail.com');
            console.log('   Trying to find any recent booking...\n');
            
            // Try to find any recent booking
            const anyBooking = await db.query(`
                SELECT 
                    b.id,
                    b.date,
                    b.start_time,
                    b.end_time,
                    b.client_name,
                    b.client_email,
                    b.created_at,
                    u.timezone as user_timezone,
                    u.username
                FROM bookings b
                JOIN users u ON u.id = b.user_id
                ORDER BY b.created_at DESC
                LIMIT 1
            `);
            
            if (anyBooking.rows.length === 0) {
                console.log('❌ No bookings found in database');
                await db.end();
                return;
            }
            
            const booking = anyBooking.rows[0];
            console.log('Found booking:', booking.client_name, booking.client_email);
            await testBooking(booking);
        } else {
            await testBooking(bookingResult.rows[0]);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await db.end();
    }
}

async function testBooking(booking) {
    const userTz = timezone.getUserTimezone(booking.user_timezone);
    
    // Convert date to YYYY-MM-DD format if it's a Date object
    let dateStr = booking.date;
    if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
    } else if (typeof dateStr === 'string' && dateStr.includes(' ')) {
        // Handle date strings like "Tue Dec 09 2025 00:00:00 GMT+0800"
        const dateObj = new Date(dateStr);
        dateStr = dateObj.toISOString().split('T')[0];
    }
    
    console.log('\n=== BOOKING DETAILS ===');
    console.log(`ID: ${booking.id}`);
    console.log(`Date: ${dateStr}`);
    console.log(`Time: ${booking.start_time} - ${booking.end_time}`);
    console.log(`Client: ${booking.client_name} (${booking.client_email})`);
    console.log(`Host: ${booking.username}`);
    console.log(`User Timezone: ${userTz}`);
    console.log(`Created At: ${booking.created_at}`);
    
    // Test timezone conversion
    console.log('\n=== TIMEZONE CONVERSION TEST ===');
    const appointmentStartUtc = timezone.localToUtc(dateStr, booking.start_time, userTz);
    
    if (!appointmentStartUtc) {
        console.log('❌ ERROR: Could not convert local time to UTC');
        return;
    }
    
    console.log(`✓ Local time converted successfully`);
    console.log(`  Local: ${dateStr} ${booking.start_time} (${userTz})`);
    console.log(`  UTC: ${appointmentStartUtc.toISOString()}`);
    console.log(`  UTC formatted: ${appointmentStartUtc.toUTCString()}`);
    
    // Verify the conversion is correct by converting back
    const backToLocal = appointmentStartUtc.toLocaleString('en-US', {
        timeZone: userTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    console.log(`  Back to local: ${backToLocal} (${userTz})`);
    
    const [localDate, localTime] = backToLocal.split(', ');
    const [expectedDate, expectedTime] = [dateStr, booking.start_time];
    
    if (localDate === expectedDate && localTime.startsWith(expectedTime)) {
        console.log('  ✓ Conversion verified: UTC → Local matches original');
    } else {
        console.log('  ⚠️  WARNING: Conversion may be incorrect');
        console.log(`     Expected: ${expectedDate} ${expectedTime}`);
        console.log(`     Got: ${localDate} ${localTime}`);
    }
    
    // Calculate reminder times
    console.log('\n=== REMINDER TIME CALCULATIONS ===');
    const now = new Date();
    const reminder1HourUtc = new Date(appointmentStartUtc.getTime() - 60 * 60 * 1000);
    const reminder30MinUtc = new Date(appointmentStartUtc.getTime() - 30 * 60 * 1000);
    
    console.log('\n1-Hour Reminder:');
    console.log(`  UTC: ${reminder1HourUtc.toISOString()}`);
    console.log(`  Local (${userTz}): ${reminder1HourUtc.toLocaleString('en-US', { 
        timeZone: userTz, 
        dateStyle: 'full', 
        timeStyle: 'long' 
    })}`);
    
    const timeUntil1h = Math.round((reminder1HourUtc - now) / (1000 * 60));
    if (reminder1HourUtc < now) {
        console.log(`  ⚠️  Status: IN THE PAST (${Math.abs(timeUntil1h)} minutes ago)`);
    } else {
        console.log(`  ✓ Status: Will be sent in ${timeUntil1h} minutes (${Math.round(timeUntil1h/60)} hours)`);
    }
    
    console.log('\n30-Minute Reminder:');
    console.log(`  UTC: ${reminder30MinUtc.toISOString()}`);
    console.log(`  Local (${userTz}): ${reminder30MinUtc.toLocaleString('en-US', { 
        timeZone: userTz, 
        dateStyle: 'full', 
        timeStyle: 'long' 
    })}`);
    
    const timeUntil30m = Math.round((reminder30MinUtc - now) / (1000 * 60));
    if (reminder30MinUtc < now) {
        console.log(`  ⚠️  Status: IN THE PAST (${Math.abs(timeUntil30m)} minutes ago)`);
    } else {
        console.log(`  ✓ Status: Will be sent in ${timeUntil30m} minutes`);
    }
    
    // Expected reminder times in local timezone
    console.log('\n=== EXPECTED REMINDER TIMES (Local) ===');
    const [hours, minutes] = booking.start_time.split(':');
    const hour1h = (parseInt(hours) - 1 + 24) % 24;
    const min30m = parseInt(minutes) - 30;
    const hour30m = min30m < 0 ? (parseInt(hours) - 1 + 24) % 24 : parseInt(hours);
    const finalMin30m = min30m < 0 ? min30m + 60 : min30m;
    
    console.log(`1-hour reminder should be: ${String(hour1h).padStart(2, '0')}:${minutes} on ${dateStr}`);
    console.log(`30-min reminder should be: ${String(hour30m).padStart(2, '0')}:${String(finalMin30m).padStart(2, '0')} on ${dateStr}`);
    
    // Summary
    console.log('\n=== SUMMARY ===');
    if (reminder1HourUtc >= now && reminder30MinUtc >= now) {
        console.log('✓ Both reminders are scheduled for the future');
        console.log('✓ Timezone conversion appears correct');
    } else {
        console.log('⚠️  Some reminders are in the past - this may indicate an issue');
    }
}

testActualBooking();

