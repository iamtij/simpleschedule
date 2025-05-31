const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// Helper function to convert UTC date to GMT+8
function convertToGMT8(date) {
  const utcDate = new Date(date);
  const gmtPlus8 = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  return gmtPlus8;
}

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

// Get user's public booking page
router.get('/:userId', async (req, res) => {
  db.get('SELECT id, email FROM users WHERE id = ?', [req.params.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    res.render('booking-page', { user });
  });
});

// Get available time slots for a specific date
router.get('/:userId/availability', (req, res) => {
  const { date } = req.query;
  const userId = req.params.userId;
  
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }
  
  // Convert the date to GMT+8 and get day of week
  const gmt8Date = convertToGMT8(date + 'T00:00:00');
  const dayOfWeek = gmt8Date.getDay();
  console.log('Checking availability for:', { 
    date,
    gmt8Date: gmt8Date.toISOString(),
    dayOfWeek,
    userId 
  });
  
  // Get user's availability for this day
  db.all(`
    SELECT start_time, end_time 
    FROM availability 
    WHERE user_id = ? AND day_of_week = ?
  `, [userId, dayOfWeek], (err, availability) => {
    if (err) {
      console.error('Error fetching availability:', err);
      return res.status(500).json({ error: 'Failed to fetch availability' });
    }

    console.log('Found availability:', availability);

    // If no availability set for this day
    if (!availability || availability.length === 0) {
      console.log('No availability found for day:', dayOfWeek);
      return res.json({ 
        availability: [],
        breaks: [],
        bookings: []
      });
    }

    // Get breaks for this day
    db.all(`
      SELECT start_time, end_time 
      FROM breaks 
      WHERE user_id = ? AND day_of_week = ?
    `, [userId, dayOfWeek], (err, breaks) => {
      if (err) {
        console.error('Error fetching breaks:', err);
        return res.status(500).json({ error: 'Failed to fetch breaks' });
      }

      console.log('Found breaks:', breaks);

      // Get existing bookings for this date
      db.all(`
        SELECT start_time, end_time 
        FROM bookings 
        WHERE user_id = ? AND date = ?
        ORDER BY start_time
      `, [userId, date], (err, bookings) => {
        if (err) {
          console.error('Error fetching bookings:', err);
          return res.status(500).json({ error: 'Failed to fetch bookings' });
        }

        console.log('Found bookings:', bookings);

        const response = {
          availability,
          breaks,
          bookings
        };
        console.log('Sending response:', response);
        res.json(response);
      });
    });
  });
});

// Create a new booking
router.post('/:userId', (req, res) => {
  const { date, start_time, end_time, client_name, client_email, client_phone, notes } = req.body;
  const userId = req.params.userId;
  
  // Validate required fields
  if (!date || !start_time || !end_time || !client_name || !client_email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Convert times to AM/PM format for storage
  const start_time_12h = convertTo12Hour(start_time);
  const end_time_12h = convertTo12Hour(end_time);
  
  // Check if slot is available
  db.get(`
    SELECT id FROM bookings 
    WHERE user_id = ? 
    AND date = ? 
    AND ((start_time <= ? AND end_time > ?) 
    OR (start_time < ? AND end_time >= ?))
  `, [userId, date, start_time_12h, start_time_12h, end_time_12h, end_time_12h], (err, existingBooking) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to check availability' });
    }

    if (existingBooking) {
      return res.status(400).json({ error: 'Time slot is not available' });
    }

    // Create booking with AM/PM times
    db.run(`
      INSERT INTO bookings (user_id, date, start_time, end_time, client_name, client_email, client_phone, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, date, start_time_12h, end_time_12h, client_name, client_email, client_phone || null, notes || null], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create booking' });
      }

      // Get the created booking
      db.get('SELECT * FROM bookings WHERE id = ?', [this.lastID], (err, booking) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch booking details' });
        }

        // Render the confirmation page
        res.render('booking-confirmation', { booking });
      });
    });
  });
});

module.exports = router; 