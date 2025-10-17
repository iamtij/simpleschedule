const express = require('express');
const router = express.Router();
const db = require('../db');
const timezone = require('../utils/timezone');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
};

// Dashboard page (root level: /dashboard)
router.get('/dashboard', requireLogin, async (req, res) => {
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

// API endpoint for dashboard data
router.get('/dashboard/data', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's appointments
    const todaysBookingsResult = await db.query(
      `SELECT id, client_name, client_email, client_phone, start_time, end_time, notes, status 
       FROM bookings 
       WHERE user_id = $1 AND date::date = $2::date 
       ORDER BY start_time`,
      [userId, today]
    );

    // Get follow-ups due today and this week
    const followUpsResult = await db.query(
      `SELECT id, name, email, phone, next_follow_up, status, bni_member, bni_chapter
       FROM contacts 
       WHERE user_id = $1 AND next_follow_up IS NOT NULL 
       AND next_follow_up >= CURRENT_DATE 
       AND next_follow_up <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY next_follow_up ASC, name ASC`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        todaysAppointments: todaysBookingsResult.rows,
        followUps: followUpsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
});

// Get bookings page (root level: /bookings)
router.get('/bookings', requireLogin, async (req, res) => {
  try {
    // Get user info
    const userResult = await db.query(
      'SELECT id, username, display_name, email FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.redirect('/');
    }
    
    const user = userResult.rows[0];
    
    // Get pagination and search parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    
    // Build search conditions
    let searchConditions = 'WHERE user_id = $1';
    let queryParams = [req.session.userId];
    let paramIndex = 2;
    
    if (searchTerm.trim()) {
      searchConditions += ` AND (
        LOWER(client_name) LIKE LOWER($${paramIndex}) OR
        LOWER(client_email) LIKE LOWER($${paramIndex}) OR
        client_phone LIKE $${paramIndex} OR
        LOWER(notes) LIKE LOWER($${paramIndex})
      )`;
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }
    
    // Get total count for pagination (with search)
    console.log('🔍 Count query conditions:', searchConditions);
    console.log('🔍 Count query params:', queryParams);
    const countResult = await db.query(
      `SELECT COUNT(*) FROM bookings ${searchConditions}`,
      queryParams
    );
    const totalBookings = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalBookings / limit);
    
    // Get bookings with pagination and search
    queryParams.push(limit, offset);
    const finalQuery = `SELECT id, client_name, client_email, client_phone, date, start_time, end_time, 
              notes, status, google_calendar_link, created_at
       FROM bookings 
       ${searchConditions}
       ORDER BY date DESC, start_time DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    console.log('🔍 Final SQL query:', finalQuery);
    console.log('🔍 Final query params:', queryParams);
    
    const bookingsResult = await db.query(finalQuery, queryParams);
    
    const bookings = bookingsResult.rows;
    
    // Pagination info
    const pagination = {
      currentPage: page,
      totalPages: totalPages,
      totalBookings: totalBookings,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1,
      searchTerm: searchTerm
    };
    
    res.render('bookings', { user, bookings, pagination });
  } catch (error) {
    console.error('Bookings page error:', error);
    res.status(500).render('error', { message: 'Failed to load bookings' });
  }
});

// Contacts page (root level: /contacts)
router.get('/contacts', requireLogin, async (req, res) => {
  try {
    // Get user data
    const userResult = await db.query(
      'SELECT id, email, username, full_name, display_name FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (userResult.rows.length === 0) {
      return res.redirect('/');
    }
    const user = userResult.rows[0];

    res.render('contacts', { user });
  } catch (error) {
    console.error('Contacts page error:', error);
    res.status(500).render('error', { message: 'Failed to load contacts' });
  }
});

// Contact detail page (root level: /contacts/:id)
router.get('/contacts/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user data
    const userResult = await db.query(
      'SELECT id, email, username, full_name, display_name FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (userResult.rows.length === 0) {
      return res.redirect('/');
    }
    const user = userResult.rows[0];

    res.render('contact-detail', { user, contactId: id });
  } catch (error) {
    console.error('Contact detail page error:', error);
    return res.redirect('/contacts');
  }
});

// Settings page (root level: /settings)
router.get('/settings', requireLogin, async (req, res) => {
  try {
    // Additional check to ensure user is properly authenticated
    if (!req.session.userId) {
      return res.redirect('/auth/login');
    }

    const userResult = await db.query(
      'SELECT id, email, username, full_name, display_name, meeting_link, buffer_minutes FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (userResult.rows.length === 0) {
      // User not found, clear session and redirect to login
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    // Get availability data
    const availabilityResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = $1 ORDER BY day_of_week',
      [req.session.userId]
    );

    // Get universal breaks
    const breaksResult = await db.query(
      'SELECT enabled, start_time, end_time FROM universal_breaks WHERE user_id = $1',
      [req.session.userId]
    );

    // Format the availability data
    const workingDays = availabilityResult.rows.map(row => row.day_of_week);
    const availabilityData = {};
    
    availabilityResult.rows.forEach(row => {
      availabilityData[`day_${row.day_of_week}_start`] = row.start_time;
      availabilityData[`day_${row.day_of_week}_end`] = row.end_time;
    });

    const availabilitySettings = {
      working_days: workingDays,
      buffer_minutes: userResult.rows[0].buffer_minutes || 0,
      break_enabled: breaksResult.rows[0]?.enabled || false,
      break_start: breaksResult.rows[0]?.start_time || '12:00',
      break_end: breaksResult.rows[0]?.end_time || '13:00',
      ...availabilityData
    };

    res.render('account-settings', {
      user: userResult.rows[0],
      availabilitySettings: availabilitySettings,
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

// API routes for root level
router.get('/bookings/api', requireLogin, async (req, res) => {
  try {
    
        const bookingsResult = await db.query(
          `SELECT id, client_name, client_email, client_phone, date, start_time, end_time, notes, status
           FROM bookings 
           WHERE user_id = $1 
           ORDER BY date ASC, start_time ASC`,
          [req.session.userId]
        );
    
    
        const events = bookingsResult.rows.map(booking => {
      // Convert the date to the correct date (handle timezone properly)
      // booking.date is stored as a Date object, we need to get the actual date
      // Use direct date extraction for better performance
      const bookingDate = new Date(booking.date);
      const year = bookingDate.getFullYear();
      const month = String(bookingDate.getMonth() + 1).padStart(2, '0');
      const day = String(bookingDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      
      const event = {
        id: booking.id,
        title: `${booking.client_name}${booking.notes ? ` - ${booking.notes}` : ''}`,
        start: `${dateStr}T${booking.start_time}:00+08:00`, // Add timezone offset for Asia/Manila
        end: `${dateStr}T${booking.end_time}:00+08:00`,     // Add timezone offset for Asia/Manila
        backgroundColor: booking.status === 'confirmed' ? '#10b981' : 
                        booking.status === 'pending' ? '#f59e0b' : '#ef4444',
        borderColor: booking.status === 'confirmed' ? '#059669' : 
                     booking.status === 'pending' ? '#d97706' : '#dc2626',
        extendedProps: {
          client_name: booking.client_name,
          client_email: booking.client_email,
          client_phone: booking.client_phone,
          notes: booking.notes,
          status: booking.status,
          start_time: booking.start_time,
          end_time: booking.end_time
        }
      };
      console.log('🎯 Mapped event:', event);
      return event;
    });
    
    console.log('📋 Final events array:', events);
    res.json(events);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Availability API route
router.get('/settings/availability', requireLogin, async (req, res) => {
  try {
    
    // Get availability data
    const availabilityResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = $1 ORDER BY day_of_week',
      [req.session.userId]
    );

    // Get universal breaks
    const breaksResult = await db.query(
      'SELECT enabled, start_time, end_time FROM universal_breaks WHERE user_id = $1',
      [req.session.userId]
    );

    // Get buffer minutes from users table
    const userResult = await db.query(
      'SELECT buffer_minutes FROM users WHERE id = $1',
      [req.session.userId]
    );

    // Format the availability data
    const workingDays = availabilityResult.rows.map(row => row.day_of_week);
    const availabilityData = {};
    
    availabilityResult.rows.forEach(row => {
      availabilityData[`day_${row.day_of_week}_start`] = row.start_time;
      availabilityData[`day_${row.day_of_week}_end`] = row.end_time;
    });

    const response = {
      success: true,
      working_days: workingDays,
      buffer_minutes: userResult.rows[0]?.buffer_minutes || 0,
      break_enabled: breaksResult.rows[0]?.enabled || false,
      break_start: breaksResult.rows[0]?.start_time || '12:00',
      break_end: breaksResult.rows[0]?.end_time || '13:00',
      ...availabilityData
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching availability settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch availability settings' 
    });
  }
});

// POST availability route
router.post('/settings/availability', requireLogin, async (req, res) => {
  try {
    console.log('📊 Request body:', req.body);
    
    const userId = req.session.userId;
    
    const {
      working_days = [],
      break_enabled = false,
      break_start = '12:00',
      break_end = '13:00',
      buffer_minutes = 0
    } = req.body;

    // Start a transaction
    await db.query('BEGIN');

    try {
      // Clear existing availability settings
      await db.query('DELETE FROM availability WHERE user_id = $1', [userId]);

      // Insert new working days
      const workingDaysArray = Array.isArray(working_days) ? working_days : [];
      console.log('📅 Working days to insert:', workingDaysArray);
      
      for (const dayIndex of workingDaysArray) {
        const startTime = req.body[`day_${dayIndex}_start`] || '09:00';
        const endTime = req.body[`day_${dayIndex}_end`] || '17:00';
        
        await db.query(
          'INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [userId, dayIndex, startTime, endTime]
        );
        console.log(`✅ Inserted day ${dayIndex}: ${startTime} - ${endTime}`);
      }

      // Update or insert universal breaks
      const existingBreak = await db.query(
        'SELECT id FROM universal_breaks WHERE user_id = $1',
        [userId]
      );

      const breakEnabled = break_enabled === 'on' || break_enabled === true || break_enabled === 'true';

      if (existingBreak.rows.length > 0) {
        await db.query(
          'UPDATE universal_breaks SET enabled = $1, start_time = $2, end_time = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4',
          [breakEnabled, break_start, break_end, userId]
        );
        console.log('✅ Updated universal break:', break_start, '-', break_end, 'enabled:', breakEnabled);
      } else {
        await db.query(
          'INSERT INTO universal_breaks (user_id, enabled, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [userId, breakEnabled, break_start, break_end]
        );
        console.log('✅ Inserted universal break:', break_start, '-', break_end, 'enabled:', breakEnabled);
      }

      // Update buffer minutes in users table
      await db.query(
        'UPDATE users SET buffer_minutes = $1 WHERE id = $2',
        [parseInt(buffer_minutes) || 0, userId]
      );
      console.log('✅ Updated buffer minutes:', buffer_minutes);

      await db.query('COMMIT');
      
      console.log('🎉 Availability settings saved successfully');
      res.redirect('/settings?success=availability_saved');
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update availability' 
    });
  }
});

// PATCH booking route
router.patch('/bookings/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    // Verify the booking belongs to the user
    const bookingResult = await db.query(
      'SELECT id FROM bookings WHERE id = $1 AND user_id = $2',
      [id, req.session.userId]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const updateQuery = `
      UPDATE bookings 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount}
    `;
    
    await db.query(updateQuery, values);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
});

// DELETE booking route
router.delete('/bookings/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify the booking belongs to the user
    const bookingResult = await db.query(
      'SELECT id FROM bookings WHERE id = $1 AND user_id = $2',
      [id, req.session.userId]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    
    await db.query('DELETE FROM bookings WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ success: false, error: 'Failed to delete booking' });
  }
});

    // PATCH endpoint for updating booking notes
    router.patch('/bookings/:id/notes', requireLogin, async (req, res) => {
      try {
        const bookingId = req.params.id;
        const { notes } = req.body;
        
        // Verify the booking belongs to the user
        const bookingResult = await db.query(
          'SELECT id FROM bookings WHERE id = $1 AND user_id = $2',
          [bookingId, req.session.userId]
        );
        
        if (bookingResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Booking not found' });
        }
        
        // Update the notes
        await db.query(
          'UPDATE bookings SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [notes, bookingId]
        );
        
        res.json({ success: true, message: 'Notes updated successfully' });
      } catch (error) {
        console.error('Error updating booking notes:', error);
        res.status(500).json({ success: false, error: 'Failed to update notes' });
      }
    });

    module.exports = router;
