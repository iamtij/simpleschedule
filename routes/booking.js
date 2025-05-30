const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

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
  
  // Get day of week (0 = Sunday, 6 = Saturday)
  const dayOfWeek = new Date(date).getDay();
  
  // Get user's availability for this day
  db.all(`
    SELECT start_time, end_time 
    FROM availability 
    WHERE user_id = ? AND day_of_week = ?
  `, [userId, dayOfWeek], (err, availability) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch availability' });
    }

    // Get breaks
    db.all(`
      SELECT start_time, end_time 
      FROM breaks 
      WHERE user_id = ? AND day_of_week = ?
    `, [userId, dayOfWeek], (err, breaks) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch breaks' });
      }

      // Get existing bookings for this date
      db.all(`
        SELECT start_time, end_time 
        FROM bookings 
        WHERE user_id = ? AND date = ?
      `, [userId, date], (err, bookings) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch bookings' });
        }

        res.json({
          availability,
          breaks,
          bookings
        });
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
  
  // Check if slot is available
  db.get(`
    SELECT id FROM bookings 
    WHERE user_id = ? 
    AND date = ? 
    AND ((start_time <= ? AND end_time > ?) 
    OR (start_time < ? AND end_time >= ?))
  `, [userId, date, start_time, start_time, end_time, end_time], (err, existingBooking) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to check availability' });
    }

    if (existingBooking) {
      return res.status(400).json({ error: 'Time slot is not available' });
    }

    // Create booking
    db.run(`
      INSERT INTO bookings (user_id, date, start_time, end_time, client_name, client_email, client_phone, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, date, start_time, end_time, client_name, client_email, client_phone || null, notes || null], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to create booking' });
      }
      res.json({ success: true });
    });
  });
});

module.exports = router; 