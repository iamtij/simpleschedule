const express = require('express');
const router = express.Router();
const db = require('../db');
const timezone = require('../utils/timezone');
const { checkUserAccess } = require('../utils/subscription');

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

    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    user.subscriptionStatus = subscriptionStatus;

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
    return res.redirect('/');
  }
});

// API endpoint for dashboard data
router.get('/dashboard/data', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Use Manila timezone for date calculation (UTC+8)
    const now = new Date();
    const manilaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const today = manilaTime.toISOString().split('T')[0]; // Get YYYY-MM-DD format

    // Get today's appointments using Manila timezone
    const todaysBookingsResult = await db.query(
      `SELECT b.id, b.client_name, b.client_email, b.client_phone, b.start_time, b.end_time, b.notes, b.status, u.meeting_link
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.user_id = $1 AND b.date::date = $2::date 
       ORDER BY b.start_time`,
      [userId, today]
    );

    // Get follow-ups due today and this week using Manila timezone
    const followUpsResult = await db.query(
      `SELECT c.id, c.name, c.email, c.phone, c.next_follow_up, c.status, c.bni_member, c.bni_chapter,
              i.notes as interaction_notes, i.type as interaction_type, i.date as interaction_date
       FROM contacts c
       LEFT JOIN LATERAL (
           SELECT notes, type, date
           FROM interactions 
           WHERE contact_id = c.id 
           ORDER BY date DESC 
           LIMIT 1
       ) i ON true
       WHERE c.user_id = $1 AND c.next_follow_up IS NOT NULL 
       AND c.next_follow_up >= $2::date 
       AND c.next_follow_up <= $2::date + INTERVAL '7 days'
       ORDER BY c.next_follow_up ASC, c.name ASC`,
      [userId, today]
    );

    res.json({
      success: true,
      data: {
        todaysAppointments: todaysBookingsResult.rows,
        followUps: followUpsResult.rows
      }
    });
  } catch (error) {
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
    
    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    user.subscriptionStatus = subscriptionStatus;
    
    // Get filter parameter (upcoming, past, or all) - default to upcoming
    const filter = req.query.filter || 'upcoming';
    const searchTerm = req.query.search || '';
    
    // Get pagination
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    // Calculate today's date using Manila timezone
    const now = new Date();
    const manilaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const today = manilaTime.toISOString().split('T')[0];
    
    // Build WHERE conditions
    let whereConditions = ['user_id = $1'];
    let queryParams = [req.session.userId];
    let paramIndex = 2;
    
    // Add date filter based on selected filter
    if (filter === 'upcoming') {
      whereConditions.push(`date >= $${paramIndex}::date`);
      queryParams.push(today);
      paramIndex++;
    } else if (filter === 'past') {
      whereConditions.push(`date < $${paramIndex}::date`);
      queryParams.push(today);
      paramIndex++;
    }
    // 'all' doesn't add any date filter
    
    // Add search conditions if provided
    if (searchTerm.trim()) {
      whereConditions.push(`(
        LOWER(client_name) LIKE LOWER($${paramIndex}) OR
        LOWER(client_email) LIKE LOWER($${paramIndex}) OR
        client_phone LIKE $${paramIndex} OR
        LOWER(notes) LIKE LOWER($${paramIndex})
      )`);
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count for pagination
    const countResult = await db.query(
      `SELECT COUNT(*) FROM bookings WHERE ${whereClause}`,
      queryParams
    );
    const totalBookings = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalBookings / limit);
    
    // Determine sort order based on filter
    let orderBy = '';
    if (filter === 'past') {
      orderBy = 'ORDER BY date DESC, start_time DESC'; // Most recent past first
    } else {
      orderBy = 'ORDER BY date ASC, start_time ASC'; // Upcoming first
    }
    
    // Get bookings with pagination and search
    queryParams.push(limit, offset);
    const finalQuery = `SELECT id, client_name, client_email, client_phone, date, start_time, end_time, 
              notes, status, google_calendar_link, created_at
       FROM bookings 
       WHERE ${whereClause}
       ${orderBy}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
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
    
    res.render('bookings', { user, bookings, pagination, filter, searchTerm });
  } catch (error) {
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

    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    user.subscriptionStatus = subscriptionStatus;

    res.render('contacts', { user });
  } catch (error) {
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

    // Get availability data (all blocks)
    const availabilityResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = $1 ORDER BY day_of_week, start_time',
      [req.session.userId]
    );

    // Get universal breaks
    const breaksResult = await db.query(
      'SELECT enabled, start_time, end_time FROM universal_breaks WHERE user_id = $1',
      [req.session.userId]
    );

    // Get meeting durations
    const durationsResult = await db.query(
      'SELECT id, duration_minutes, meeting_link, is_active, display_order FROM meeting_durations WHERE user_id = $1 ORDER BY display_order, duration_minutes',
      [req.session.userId]
    );

    // Get date-specific availability
    const dateAvailabilityResult = await db.query(
      'SELECT id, date, start_time, end_time FROM date_availability WHERE user_id = $1 ORDER BY date, start_time',
      [req.session.userId]
    );

    // Format the availability data - group by day
    const workingDays = [...new Set(availabilityResult.rows.map(row => row.day_of_week))];
    const availabilityData = {};
    const availabilityBlocks = availabilityResult.rows.map(row => ({
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time
    }));
    
    // Keep backward compatibility with old format (for first block of each day)
    availabilityResult.rows.forEach(row => {
      if (!availabilityData[`day_${row.day_of_week}_start`]) {
        availabilityData[`day_${row.day_of_week}_start`] = row.start_time;
        availabilityData[`day_${row.day_of_week}_end`] = row.end_time;
      }
    });

    // Format date availability data
    // Use string formatting to avoid timezone conversion issues
    const dateAvailabilityBlocks = dateAvailabilityResult.rows.map(row => {
      // Format date as YYYY-MM-DD without timezone conversion
      const dateObj = row.date instanceof Date ? row.date : new Date(row.date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      return {
        id: row.id,
        date: dateStr,
        start_time: row.start_time,
        end_time: row.end_time
      };
    });

    const availabilitySettings = {
      working_days: workingDays,
      availability_blocks: availabilityBlocks,
      buffer_minutes: userResult.rows[0].buffer_minutes || 0,
      break_enabled: breaksResult.rows[0]?.enabled || false,
      break_start: breaksResult.rows[0]?.start_time || '12:00',
      break_end: breaksResult.rows[0]?.end_time || '13:00',
      meeting_durations: durationsResult.rows,
      date_availability_blocks: dateAvailabilityBlocks,
      ...availabilityData
    };

    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    const user = userResult.rows[0];
    user.subscriptionStatus = subscriptionStatus;

    res.render('account-settings', {
      user: user,
      availabilitySettings: availabilitySettings,
      title: 'Account Settings'
    });
  } catch (error) {
    res.status(500).render('error', { 
      message: 'Failed to load account settings',
      error: { status: 500 }
    });
  }
});

// API routes for root level
router.get('/bookings/api', requireLogin, async (req, res) => {
  try {
        // Get all bookings (including past) for the calendar
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
      return event;
    });
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Availability API route
router.get('/settings/availability', requireLogin, async (req, res) => {
  try {
    
    // Get availability data (all blocks)
    const availabilityResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = $1 ORDER BY day_of_week, start_time',
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

    // Format the availability data - group by day
    const workingDays = [...new Set(availabilityResult.rows.map(row => row.day_of_week))];
    const availabilityData = {};
    const availabilityBlocks = availabilityResult.rows.map(row => ({
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time
    }));
    
    // Keep backward compatibility with old format (for first block of each day)
    availabilityResult.rows.forEach(row => {
      if (!availabilityData[`day_${row.day_of_week}_start`]) {
        availabilityData[`day_${row.day_of_week}_start`] = row.start_time;
        availabilityData[`day_${row.day_of_week}_end`] = row.end_time;
      }
    });

    const response = {
      success: true,
      working_days: workingDays,
      availability_blocks: availabilityBlocks,
      buffer_minutes: userResult.rows[0]?.buffer_minutes || 0,
      break_enabled: breaksResult.rows[0]?.enabled || false,
      break_start: breaksResult.rows[0]?.start_time || '12:00',
      break_end: breaksResult.rows[0]?.end_time || '13:00',
      ...availabilityData
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch availability settings' 
    });
  }
});

// POST availability route
router.post('/settings/availability', requireLogin, async (req, res) => {
  try {
    
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

      // Parse multiple time blocks per day
      // New format: day_0_blocks[0][start], day_0_blocks[0][end], etc.
      // Old format (backward compatibility): day_0_start, day_0_end
      
      const blocksToInsert = [];
      
      // Try new format first (multiple blocks per day)
      // Express body-parser may parse nested brackets as nested objects or flat keys
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        // Check for nested object format: day_0_blocks = { 0: { start: ..., end: ... }, 1: { ... } }
        const dayBlocks = req.body[`day_${dayIndex}_blocks`];
        
        if (dayBlocks) {
          // Handle array format from form submission
          if (Array.isArray(dayBlocks)) {
            dayBlocks.forEach(block => {
              if (block && block.start && block.end) {
                blocksToInsert.push({
                  day: parseInt(dayIndex, 10),
                  start: block.start,
                  end: block.end
                });
              }
            });
          } else if (typeof dayBlocks === 'object') {
            // Handle object format (when parsed from form)
            Object.keys(dayBlocks).forEach(blockIndex => {
              const block = dayBlocks[blockIndex];
              if (block && block.start && block.end) {
                blocksToInsert.push({
                  day: parseInt(dayIndex, 10),
                  start: block.start,
                  end: block.end
                });
              }
            });
          }
        }
        
        // Check for flat format: day_0_blocks[0][start], day_0_blocks[0][end], etc.
        // Express might parse this as flat keys in req.body
        let blockIndex = 0;
        while (true) {
          const flatStartKey = `day_${dayIndex}_blocks[${blockIndex}][start]`;
          const flatEndKey = `day_${dayIndex}_blocks[${blockIndex}][end]`;
          
          if (req.body[flatStartKey] && req.body[flatEndKey]) {
            blocksToInsert.push({
              day: parseInt(dayIndex, 10),
              start: req.body[flatStartKey],
              end: req.body[flatEndKey]
            });
            blockIndex++;
          } else {
            break;
          }
        }
        
        // Fallback to old format (single block per day) if no blocks found yet
        // Only use this if explicitly provided (not default values)
        if (blocksToInsert.filter(b => b.day === parseInt(dayIndex, 10)).length === 0) {
          const startTime = req.body[`day_${dayIndex}_start`];
          const endTime = req.body[`day_${dayIndex}_end`];
          
          // Only add if both times are provided and not empty
          if (startTime && endTime && startTime.trim() !== '' && endTime.trim() !== '') {
            blocksToInsert.push({
              day: parseInt(dayIndex, 10),
              start: startTime,
              end: endTime
            });
          }
        }
      }
      
      // Also check working_days array for backward compatibility
      if (blocksToInsert.length === 0) {
        let workingDaysArray = [];
        if (Array.isArray(working_days)) {
          workingDaysArray = working_days.filter(d => d !== null && d !== undefined && d !== '');
        } else if (working_days !== null && working_days !== undefined && working_days !== '') {
          workingDaysArray = [working_days];
        }
        
        for (const dayIndex of workingDaysArray) {
          const dayNum = parseInt(dayIndex, 10);
          const startTime = req.body[`day_${dayIndex}_start`];
          const endTime = req.body[`day_${dayIndex}_end`];
          
          // Only add if both times are explicitly provided
          if (startTime && endTime && startTime.trim() !== '' && endTime.trim() !== '') {
            blocksToInsert.push({
              day: dayNum,
              start: startTime,
              end: endTime
            });
          }
        }
      }
      
      // Validate for overlapping blocks per day
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const conflicts = [];
      
      // Helper function to convert time to minutes
      function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      }
      
      // Helper function to check if two blocks overlap
      function blocksOverlap(block1, block2) {
        const start1 = timeToMinutes(block1.start);
        const end1 = timeToMinutes(block1.end);
        const start2 = timeToMinutes(block2.start);
        const end2 = timeToMinutes(block2.end);
        
        // Blocks overlap if one starts before the other ends
        return (start1 < end2 && start2 < end1);
      }
      
      // Group blocks by day
      const blocksByDay = {};
      blocksToInsert.forEach(block => {
        if (!blocksByDay[block.day]) {
          blocksByDay[block.day] = [];
        }
        blocksByDay[block.day].push(block);
      });
      
      // Check for overlaps within each day
      Object.keys(blocksByDay).forEach(dayIndex => {
        const dayBlocks = blocksByDay[dayIndex];
        if (dayBlocks.length > 1) {
          for (let i = 0; i < dayBlocks.length; i++) {
            for (let j = i + 1; j < dayBlocks.length; j++) {
              const block1 = dayBlocks[i];
              const block2 = dayBlocks[j];
              
              if (blocksOverlap(block1, block2)) {
                conflicts.push({
                  day: parseInt(dayIndex),
                  dayName: dayNames[parseInt(dayIndex)],
                  block1: block1,
                  block2: block2
                });
              }
            }
          }
        }
      });
      
      // If conflicts found, return error
      if (conflicts.length > 0) {
        await db.query('ROLLBACK');
        
        let errorMessage = 'Time block conflicts detected:\n\n';
        const conflictsByDay = {};
        conflicts.forEach(conflict => {
          if (!conflictsByDay[conflict.day]) {
            conflictsByDay[conflict.day] = [];
          }
          conflictsByDay[conflict.day].push(conflict);
        });
        
        Object.keys(conflictsByDay).forEach(dayIndex => {
          const dayConflicts = conflictsByDay[dayIndex];
          const dayName = dayNames[parseInt(dayIndex)];
          errorMessage += `${dayName}:\n`;
          dayConflicts.forEach(conflict => {
            errorMessage += `  • Blocks "${conflict.block1.start} - ${conflict.block1.end}" and "${conflict.block2.start} - ${conflict.block2.end}" overlap\n`;
          });
          errorMessage += '\n';
        });
        errorMessage += 'Please adjust the overlapping time blocks and try again.';
        
        // Redirect back with error message
        return res.redirect(`/settings?error=${encodeURIComponent(errorMessage)}`);
      }
      
      // Insert all blocks
      for (const block of blocksToInsert) {
        await db.query(
          'INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [userId, block.day, block.start, block.end]
        );
      }
      
      const hasWorkingDays = blocksToInsert.length > 0;

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
      } else {
        await db.query(
          'INSERT INTO universal_breaks (user_id, enabled, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [userId, breakEnabled, break_start, break_end]
        );
      }

      // Update buffer minutes and has_set_availability in users table
      // Only set has_set_availability to TRUE if at least one working day was added
      await db.query(
        'UPDATE users SET buffer_minutes = $1, has_set_availability = $3 WHERE id = $2',
        [parseInt(buffer_minutes) || 0, userId, hasWorkingDays]
      );

      // Handle meeting durations (up to 3)
      const meetingDurations = req.body.meeting_durations || [];
      
      // Validate: max 3 durations
      if (meetingDurations.length > 3) {
        await db.query('ROLLBACK');
        return res.redirect(`/settings?error=${encodeURIComponent('Maximum of 3 meeting durations allowed')}`);
      }
      
      // Validate: unique duration values
      const durationValues = meetingDurations.map(d => parseInt(d.duration_minutes)).filter(d => !isNaN(d) && d > 0);
      const uniqueDurations = [...new Set(durationValues)];
      if (durationValues.length !== uniqueDurations.length) {
        await db.query('ROLLBACK');
        return res.redirect(`/settings?error=${encodeURIComponent('Meeting durations must be unique')}`);
      }
      
      // Delete existing meeting durations
      await db.query('DELETE FROM meeting_durations WHERE user_id = $1', [userId]);
      
      // Insert new meeting durations
      for (let i = 0; i < meetingDurations.length; i++) {
        const duration = meetingDurations[i];
        const durationMinutes = parseInt(duration.duration_minutes);
        const meetingLink = duration.meeting_link || null;
        
        if (!isNaN(durationMinutes) && durationMinutes > 0) {
          await db.query(
            'INSERT INTO meeting_durations (user_id, duration_minutes, meeting_link, is_active, display_order) VALUES ($1, $2, $3, true, $4)',
            [userId, durationMinutes, meetingLink, i]
          );
        }
      }

      await db.query('COMMIT');
      
      // Redirect back to settings page with success message and hash to keep availability section open
      res.redirect('/settings?success=availability_saved#availability');
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update availability' 
    });
  }
});

// GET /settings/date-availability - Load date-specific availability settings
// IMPORTANT: This route must be defined BEFORE any catch-all /settings routes
router.get('/settings/date-availability', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Get all date-specific availability
    const dateAvailabilityResult = await db.query(
      'SELECT id, date, start_time, end_time FROM date_availability WHERE user_id = $1 ORDER BY date, start_time',
      [userId]
    );

    // Group by date for easier frontend consumption
    // Format dates without timezone conversion to avoid day shift
    const formatDate = (dateValue) => {
      const dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const dateAvailability = {};
    dateAvailabilityResult.rows.forEach(row => {
      const dateStr = formatDate(row.date);
      if (!dateAvailability[dateStr]) {
        dateAvailability[dateStr] = [];
      }
      dateAvailability[dateStr].push({
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time
      });
    });

    const response = {
      success: true,
      date_availability: dateAvailability,
      date_availability_blocks: dateAvailabilityResult.rows.map(row => ({
        id: row.id,
        date: formatDate(row.date),
        start_time: row.start_time,
        end_time: row.end_time
      }))
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load date availability settings' });
  }
});

// POST /settings/date-availability - Save date-specific availability settings
// IMPORTANT: This route must be defined BEFORE any catch-all /settings routes
router.post('/settings/date-availability', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    // Start a transaction
    await db.query('BEGIN');

    try {
      // Parse date availability blocks
      // Expected format: date_blocks = { "2024-01-15": [{ start: "09:00", end: "12:00" }, ...], ... }
      // Or flat format: date_blocks[2024-01-15][0][start], date_blocks[2024-01-15][0][end], etc.
      
      const blocksToInsert = [];
      const dateBlocks = req.body.date_blocks || {};
      
      // Handle object format (grouped by date)
      if (typeof dateBlocks === 'object' && !Array.isArray(dateBlocks)) {
        Object.keys(dateBlocks).forEach(dateStr => {
          const blocks = dateBlocks[dateStr];
          if (Array.isArray(blocks)) {
            blocks.forEach(block => {
              if (block && block.start && block.end) {
                blocksToInsert.push({
                  date: dateStr,
                  start: block.start,
                  end: block.end
                });
              }
            });
          } else if (typeof blocks === 'object') {
            Object.keys(blocks).forEach(blockIndex => {
              const block = blocks[blockIndex];
              if (block && block.start && block.end) {
                blocksToInsert.push({
                  date: dateStr,
                  start: block.start,
                  end: block.end
                });
              }
            });
          }
        });
      }
      
      // Handle flat format: date_blocks[2024-01-15][0][start], etc.
      Object.keys(req.body).forEach(key => {
        if (key.startsWith('date_blocks[') && key.includes('][') && key.includes('][start]')) {
          // Extract date and block index from key like "date_blocks[2024-01-15][0][start]"
          const match = key.match(/date_blocks\[([^\]]+)\]\[(\d+)\]\[start\]/);
          if (match) {
            const dateStr = match[1];
            const blockIndex = match[2];
            const endKey = `date_blocks[${dateStr}][${blockIndex}][end]`;
            
            if (req.body[endKey]) {
              blocksToInsert.push({
                date: dateStr,
                start: req.body[key],
                end: req.body[endKey]
              });
            }
          }
        }
      });

      // If specific dates to delete are provided, delete them first
      if (req.body.delete_dates && Array.isArray(req.body.delete_dates)) {
        for (const dateStr of req.body.delete_dates) {
          await db.query(
            'DELETE FROM date_availability WHERE user_id = $1 AND date = $2',
            [userId, dateStr]
          );
        }
      }

      // If specific IDs to delete are provided, delete them first
      if (req.body.delete_ids && Array.isArray(req.body.delete_ids)) {
        for (const id of req.body.delete_ids) {
          await db.query(
            'DELETE FROM date_availability WHERE user_id = $1 AND id = $2',
            [userId, id]
          );
        }
      }

      // If replace_all is true, clear all existing date availability for this user
      // Check for both boolean true and string 'true'
      const replaceAll = req.body.replace_all === true || req.body.replace_all === 'true';
      
      if (replaceAll) {
        await db.query('DELETE FROM date_availability WHERE user_id = $1', [userId]);
      }

      // Insert new blocks
      for (const block of blocksToInsert) {
        await db.query(
          'INSERT INTO date_availability (user_id, date, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING id, date, start_time, end_time',
          [userId, block.date, block.start, block.end]
        );
      }

      await db.query('COMMIT');

      res.json({ 
        success: true, 
        message: 'Date availability saved successfully',
        blocks_inserted: blocksToInsert.length,
        entries_deleted: replaceAll ? 'all' : 0
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save date availability settings' });
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
        res.status(500).json({ success: false, error: 'Failed to update notes' });
      }
    });

    module.exports = router;
