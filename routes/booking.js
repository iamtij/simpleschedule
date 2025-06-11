const express = require('express');
const router = express.Router();
const db = require('../db');
const mailService = require('../services/mail');

// Helper function to convert time to AM/PM format
function convertTo12Hour(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Helper function to convert AM/PM time to 24-hour format
function convertTo24Hour(time) {
    const [timeStr, period] = time.split(' ');
    let [hours, minutes] = timeStr.split(':');
    hours = parseInt(hours);
    
    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) {
        hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Helper function to format time to 12-hour with AM/PM
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Get user's public booking page
router.get('/:username', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, full_name, display_name, email FROM users WHERE username = $1',
      [req.params.username]
    );
    
    if (!result.rows[0]) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    res.render('booking-page', { user: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Get available time slots for a specific date
router.get('/:username/availability', async (req, res) => {
    const { date } = req.query;
    const username = req.params.username;
    
    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
    }
    
    try {
        // First get the user ID from username
        const userResult = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (!userResult.rows[0]) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].id;

        // Create date object in local timezone
        const localDate = new Date(date + 'T00:00:00');
        const dayOfWeek = localDate.getDay();
        
        // Get user's availability for this day
        const availabilityResult = await db.query(
            'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2',
            [userId, dayOfWeek]
        );

        // If no availability set for this day
        if (!availabilityResult.rows || availabilityResult.rows.length === 0) {
            return res.json({ 
                availability: [],
                breaks: [],
                bookings: []
            });
        }

        // Get breaks for this day
        const breaksResult = await db.query(
            'SELECT start_time, end_time FROM breaks WHERE user_id = $1 AND day_of_week = $2',
            [userId, dayOfWeek]
        );

        // Get existing bookings for this date
        const bookingsResult = await db.query(
            'SELECT start_time, end_time FROM bookings WHERE user_id = $1 AND date = $2',
            [userId, date]
        );

        res.json({
            availability: availabilityResult.rows,
            breaks: breaksResult.rows,
            bookings: bookingsResult.rows
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a new booking
router.post('/:username', async (req, res) => {
    const { date, start_time, end_time, client_name, client_email, client_phone, notes } = req.body;
    const username = req.params.username;
    
    // Get the user ID from username
    const userResult = await db.query(
        'SELECT id, full_name, email, username, meeting_link FROM users WHERE username = $1',
        [username]
    );

    if (!userResult.rows[0]) {
        console.error('User not found:', username);
        return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const host = userResult.rows[0];

    // Validate required fields
    if (!date || !start_time || !end_time || !client_name || !client_email) {
        console.error('Missing required fields:', { date, start_time, end_time, client_name, client_email });
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if the slot is still available
    const conflictCheck = await db.query(
        `SELECT id FROM bookings 
         WHERE user_id = $1 
         AND date = $2 
         AND (
             (start_time <= $3 AND end_time > $3) OR
             (start_time < $4 AND end_time >= $4) OR
             (start_time >= $3 AND end_time <= $4)
         )`,
        [userId, date, start_time, end_time]
    );

    if (conflictCheck.rows.length > 0) {
        console.error('Time slot no longer available:', { date, start_time, end_time });
        return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    // Insert the booking
    const bookingResult = await db.query(
        `INSERT INTO bookings (user_id, date, start_time, end_time, client_name, client_email, client_phone, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, date::text, start_time::text, end_time::text, client_name, client_email, client_phone, notes`,
        [userId, date, start_time, end_time, client_name, client_email, client_phone, notes]
    );

    // Format the booking times
    const booking = bookingResult.rows[0];
    booking.formatted_start_time = formatTime(booking.start_time);
    booking.formatted_end_time = formatTime(booking.end_time);

    // Send confirmation emails
    try {
        await Promise.all([
            mailService.sendClientConfirmation(booking, host),
            mailService.sendHostNotification(booking, host)
        ]);
    } catch (emailError) {
        console.error('Failed to send confirmation emails:', emailError);
        // Don't fail the booking if emails fail
    }

    // Render the confirmation page with booking and host details
    res.render('booking-confirmation', {
        booking,
        host
    });
});

router.get('/:username/slots', async (req, res) => {
    try {
        // Get user by username
        const userResult = await db.query(
            'SELECT id, buffer_minutes FROM users WHERE username = $1',
            [req.params.username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userId = userResult.rows[0].id;
        const bufferMinutes = userResult.rows[0].buffer_minutes || 0;
        const date = req.query.date;
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        // Get current time
        const now = new Date();
        const requestedDate = new Date(date);
        
        // Get day of week (0-6, where 0 is Sunday)
        const dayOfWeek = requestedDate.getDay();

        // Get availability for the day
        const availabilityResult = await db.query(
            'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2',
            [userId, dayOfWeek]
        );

        if (availabilityResult.rows.length === 0) {
            return res.json({ slots: [] });
        }

        // Get breaks for the day
        const breaksResult = await db.query(
            'SELECT start_time, end_time FROM breaks WHERE user_id = $1 AND day_of_week = $2',
            [userId, dayOfWeek]
        );

        // Get existing bookings for the date
        const bookingsResult = await db.query(
            'SELECT start_time, end_time FROM bookings WHERE user_id = $1 AND date = $2',
            [userId, date]
        );

        // Generate available time slots
        const availability = availabilityResult.rows[0];
        const breaks = breaksResult.rows;
        const bookings = bookingsResult.rows;

        // Convert times to minutes since midnight for easier calculation
        const workStart = timeToMinutes(availability.start_time);
        const workEnd = timeToMinutes(availability.end_time);
        
        // Create array of slots with meeting length (60 min) + buffer time
        const slots = [];
        const meetingLength = 60; // 60-minute meeting
        const bufferTime = bufferMinutes || 15; // Default to 15 if not set
        const totalInterval = meetingLength + bufferTime; // 75 minutes total (60 + 15)

        // Current time in minutes since midnight
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

        // Generate slots with proper intervals
        for (let time = workStart; time <= workEnd - meetingLength; time += totalInterval) {
            const slotStart = time;
            const slotEnd = time + meetingLength;
            
            // Skip slots in the past for today
            if (requestedDate.toDateString() === now.toDateString() && slotStart <= currentTimeMinutes + 15) {
                continue;
            }
            
            // Check if slot overlaps with any breaks
            const overlapsBreak = breaks.some(b => {
                const breakStart = timeToMinutes(b.start_time);
                const breakEnd = timeToMinutes(b.end_time);
                return (slotStart < breakEnd && slotEnd > breakStart);
            });
            
            // Check if slot overlaps with any bookings
            const overlapsBooking = bookings.some(b => {
                const bookingStart = timeToMinutes(b.start_time);
                const bookingEnd = timeToMinutes(b.end_time);
                return (slotStart < bookingEnd && slotEnd > bookingStart);
            });
            
            // Only check if the actual meeting fits within working hours
            const fitsInWorkingHours = slotEnd <= workEnd;
            
            if (!overlapsBreak && !overlapsBooking && fitsInWorkingHours) {
                slots.push({
                    start_time: minutesToTime(slotStart),
                    end_time: minutesToTime(slotEnd)
                });
            }
        }

        res.json({ slots });
    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({ error: 'Failed to get available slots' });
    }
});

// Helper function to convert time string (HH:MM) to minutes since midnight
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Helper function to convert minutes since midnight to time string (HH:MM)
function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

module.exports = router; 