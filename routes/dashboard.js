const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
};

// Dashboard home
router.get('/', requireLogin, async (req, res) => {
  try {
    console.log('Session user ID:', req.session.userId);
    
    // Get user data
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    if (userResult.rows.length === 0) {
      return res.redirect('/');
    }
    const user = userResult.rows[0];
    console.log('Found user:', { id: user.id, email: user.email });

    // Get bookings
    const bookingsResult = await db.query(
      'SELECT * FROM bookings WHERE user_id = $1 ORDER BY date, start_time',
      [req.session.userId]
    );
    console.log('Found bookings:', bookingsResult.rows.length);
    
    res.render('dashboard', { 
      user, 
      bookings: bookingsResult.rows || [] 
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.redirect('/');
  }
});

// Get availability
router.get('/availability', requireLogin, async (req, res) => {
  try {
    const availabilityResult = await db.query(
      'SELECT * FROM availability WHERE user_id = $1',
      [req.session.userId]
    );

    const breaksResult = await db.query(
      'SELECT * FROM breaks WHERE user_id = $1',
      [req.session.userId]
    );

    res.json({
      availability: availabilityResult.rows,
      breaks: breaksResult.rows
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Update availability
router.post('/availability', requireLogin, async (req, res) => {
  const { availability, breaks } = req.body;
  
  try {
    await db.query('BEGIN');

    // Delete existing records
    await db.query('DELETE FROM availability WHERE user_id = $1', [req.session.userId]);
    await db.query('DELETE FROM breaks WHERE user_id = $1', [req.session.userId]);

    // Insert new availability records
    for (const a of availability) {
      await db.query(
        'INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [req.session.userId, a.day_of_week, a.start_time, a.end_time]
      );
    }

    // Insert new break records
    for (const b of breaks) {
      await db.query(
        'INSERT INTO breaks (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [req.session.userId, b.day_of_week, b.start_time, b.end_time]
      );
    }

    await db.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error updating availability:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// Get bookings
router.get('/bookings', requireLogin, async (req, res) => {
  try {
    console.log('Fetching bookings for user:', req.session.userId);
    
    const result = await db.query(`
      SELECT * FROM bookings 
      WHERE user_id = $1 
      AND date >= CURRENT_DATE
      ORDER BY date, start_time
    `, [req.session.userId]);

    console.log('Found calendar bookings:', result.rows.length);

    // Format bookings for FullCalendar
    const events = result.rows.map(booking => {
      // Format date as YYYY-MM-DD without timezone conversion
      const date = new Date(booking.date);
      const dateStr = date.getFullYear() + '-' + 
        String(date.getMonth() + 1).padStart(2, '0') + '-' + 
        String(date.getDate()).padStart(2, '0');
      
      // Clean up time strings
      const startTime = booking.start_time.trim();
      const endTime = booking.end_time.trim();
      
      return {
        id: booking.id,
        title: `${booking.client_name}`,
        start: dateStr + 'T' + startTime,
        end: dateStr + 'T' + endTime,
        allDay: false,
        extendedProps: {
          client_name: booking.client_name,
          client_email: booking.client_email,
          client_phone: booking.client_phone,
          notes: booking.notes,
          start_time: startTime,
          end_time: endTime
        }
      };
    });

    console.log('Formatted events:', events.length);
    res.json(events);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Delete booking
router.delete('/bookings/:id', requireLogin, async (req, res) => {
  const bookingId = req.params.id;
  
  try {
    // First check if the booking belongs to the logged-in user
    const bookingResult = await db.query(
      'SELECT user_id FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (bookingResult.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this booking' });
    }

    // Delete the booking
    await db.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Update username
router.post('/username', requireLogin, async (req, res) => {
  const { username } = req.body;

  // Validate username format
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ 
      error: 'Username can only contain letters, numbers, underscores and hyphens'
    });
  }

  try {
    // Check if username is already taken
    const existingUserResult = await db.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username, req.session.userId]
    );

    if (existingUserResult.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Update username
    await db.query(
      'UPDATE users SET username = $1 WHERE id = $2',
      [username, req.session.userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating username:', error);
    res.status(500).json({ error: 'Failed to update username' });
  }
});

module.exports = router; 