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
    // Get user data
    const userResult = await db.query(
      'SELECT id, email, username, full_name, display_name, has_set_availability, has_set_display_name, has_shared_link, has_dismissed_checklist FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (userResult.rows.length === 0) {
      return res.redirect('/');
    }
    const user = userResult.rows[0];

    // Get bookings
    const bookingsResult = await db.query(
      'SELECT * FROM bookings WHERE user_id = $1 ORDER BY date, start_time',
      [req.session.userId]
    );
    
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
    const userId = req.session.userId;

    // Get user's buffer minutes
    const userResult = await db.query(
      'SELECT buffer_minutes FROM users WHERE id = $1',
      [userId]
    );
    const bufferMinutes = userResult.rows[0]?.buffer_minutes || 0;

    // Get availability
    const availabilityResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = $1 ORDER BY day_of_week',
      [userId]
    );

    // Get breaks
    const breaksResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM breaks WHERE user_id = $1 ORDER BY day_of_week',
      [userId]
    );

    res.json({
      availability: availabilityResult.rows,
      breaks: breaksResult.rows,
      buffer_minutes: bufferMinutes
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Update availability
router.post('/availability', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { availability, breaks, buffer_minutes } = req.body;
  
  try {
    // Start a transaction
    await db.query('BEGIN');

    // Update buffer_minutes in users table and set has_set_availability to true
    await db.query(
      'UPDATE users SET buffer_minutes = $1, has_set_availability = TRUE WHERE id = $2',
      [buffer_minutes, userId]
    );

    // Delete existing availability
    await db.query('DELETE FROM availability WHERE user_id = $1', [userId]);
    
    // Insert new availability
    for (const a of availability) {
      await db.query(
        'INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [userId, a.day_of_week, a.start_time, a.end_time]
      );
    }

    // Delete existing breaks
    await db.query('DELETE FROM breaks WHERE user_id = $1', [userId]);
    
    // Insert new breaks
    for (const b of breaks) {
      await db.query(
        'INSERT INTO breaks (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [userId, b.day_of_week, b.start_time, b.end_time]
      );
    }

    // Commit transaction
    await db.query('COMMIT');
    
    res.json({ success: true });
  } catch (error) {
    // Rollback in case of error
    await db.query('ROLLBACK');
    console.error('Error updating availability:', error);
    res.status(500).json({ success: false, error: 'Failed to update availability' });
  }
});

// Get bookings
router.get('/bookings', requireLogin, async (req, res) => {
  try {
    // Get bookings
    const result = await db.query(`
      SELECT * FROM bookings 
      WHERE user_id = $1 
      AND date >= CURRENT_DATE
      ORDER BY date, start_time
    `, [req.session.userId]);

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
  const { username, checkOnly } = req.body;

  // Validate username format
  const usernameRegex = /^[a-z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ 
      error: 'Username can only contain lowercase letters, numbers, underscores and hyphens'
    });
  }

  try {
    // Check if username is already taken
    const existingUserResult = await db.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username, req.session.userId]
    );

    if (existingUserResult.rows.length > 0) {
      return res.json({ available: false, error: 'Username already taken' });
    }

    // If only checking availability, return here
    if (checkOnly) {
      return res.json({ available: true });
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

// Get upcoming bookings
router.get('/bookings/upcoming', requireLogin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM bookings 
      WHERE user_id = $1 
      AND date >= CURRENT_DATE
      ORDER BY date, start_time
      LIMIT 5
    `, [req.session.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching upcoming bookings:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming bookings' });
  }
});

// Update booking notes
router.patch('/bookings/:id/notes', requireLogin, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    // First verify the booking belongs to the user
    const bookingCheck = await db.query(
      'SELECT id FROM bookings WHERE id = $1 AND user_id = $2',
      [id, req.session.userId]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update the notes
    await db.query(
      'UPDATE bookings SET notes = $1 WHERE id = $2',
      [notes, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating booking notes:', error);
    res.status(500).json({ error: 'Failed to update booking notes' });
  }
});

// Get account details
router.get('/account', requireLogin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, full_name, display_name FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching account details:', error);
    res.status(500).json({ error: 'Failed to fetch account details' });
  }
});

// Update account details
router.post('/account', requireLogin, async (req, res) => {
    try {
        const { full_name, display_name } = req.body;
        
        // Validate and sanitize input
        const sanitizedFullName = full_name ? full_name.trim() : null;
        const sanitizedDisplayName = display_name ? display_name.trim() : null;

        await db.query(
            `UPDATE users 
             SET full_name = COALESCE($1::text, full_name), 
                 display_name = COALESCE($2::text, display_name),
                 has_set_display_name = CASE 
                     WHEN $2::text IS NOT NULL AND LENGTH(TRIM($2::text)) > 0 THEN TRUE 
                     ELSE has_set_display_name 
                 END
             WHERE id = $3`,
            [sanitizedFullName, sanitizedDisplayName, req.session.userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: 'Failed to update account settings' });
    }
});

// Update share status
router.post('/update-share-status', requireLogin, async (req, res) => {
    try {
        await db.query(
            'UPDATE users SET has_shared_link = TRUE WHERE id = $1',
            [req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating share status:', error);
        res.status(500).json({ error: 'Failed to update share status' });
    }
});

// Dismiss onboarding checklist
router.post('/dismiss-checklist', requireLogin, async (req, res) => {
    try {
        await db.query(
            'UPDATE users SET has_dismissed_checklist = TRUE WHERE id = $1',
            [req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error dismissing checklist:', error);
        res.status(500).json({ error: 'Failed to dismiss checklist' });
    }
});

// Get account settings
router.get('/settings', requireLogin, async (req, res) => {
    try {
        // Additional check to ensure user is properly authenticated
        if (!req.session.userId) {
            return res.redirect('/auth/login');
        }

        const userResult = await db.query(
            'SELECT id, email, username, full_name, display_name FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            // User not found, clear session and redirect to login
            req.session.destroy();
            return res.redirect('/auth/login');
        }

        res.render('account-settings', {
            user: userResult.rows[0],
            title: 'Account Settings'
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).render('error', { 
            message: 'Failed to load account settings',
            error: { status: 500 }
        });
    }
});

module.exports = router; 