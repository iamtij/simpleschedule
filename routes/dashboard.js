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

// Contact detail page
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
    return res.redirect('/dashboard/contacts');
  }
});

// Contacts page
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
    return res.redirect('/');
  }
});

// Get onboarding checklist status
router.get('/checklist-status', requireLogin, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT has_set_availability, has_set_display_name, has_shared_link, has_dismissed_checklist FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    res.json({
      has_set_availability: user.has_set_availability || false,
      has_set_display_name: user.has_set_display_name || false,
      has_shared_link: user.has_shared_link || false,
      has_dismissed_checklist: user.has_dismissed_checklist || false
    });
  } catch (error) {
    console.error('Error fetching checklist status:', error);
    res.status(500).json({ error: 'Failed to fetch checklist status' });
  }
});

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
// Get bookings for calendar (API endpoint)
router.get('/bookings/api', requireLogin, async (req, res) => {
  try {
    // Get bookings
    const result = await db.query(`
      SELECT 
        id,
        client_name,
        client_email,
        client_phone,
        notes,
        google_event_id,
        google_calendar_link,
        date::text as date_str,
        TRIM(start_time::text) as start_time,
        TRIM(end_time::text) as end_time
      FROM bookings 
      WHERE user_id = $1 
      ORDER BY date, start_time
    `, [req.session.userId]);

    // Format bookings for FullCalendar
    const events = result.rows.map(booking => {
      // Keep the date in UTC
      const [year, month, day] = booking.date_str.split('-').map(Number);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      const dateStr = utcDate.toISOString().split('T')[0];
      
      const event = {
        id: booking.id,
        title: `${booking.client_name}`,
        start: dateStr + 'T' + booking.start_time,
        end: dateStr + 'T' + booking.end_time,
        allDay: false,
        extendedProps: {
          client_name: booking.client_name,
          client_email: booking.client_email,
          client_phone: booking.client_phone,
          notes: booking.notes,
          google_event_id: booking.google_event_id,
          google_calendar_link: booking.google_calendar_link,
          start_time: booking.start_time,
          end_time: booking.end_time
        }
      };

      return event;
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get bookings page
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
    
    // Get bookings with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM bookings WHERE user_id = $1',
      [req.session.userId]
    );
    const totalBookings = parseInt(countResult.rows[0].count);
    
    // Get bookings
    const result = await db.query(`
      SELECT 
        id,
        client_name,
        client_email,
        client_phone,
        date,
        start_time,
        end_time,
        notes,
        status,
        google_event_id,
        google_calendar_link,
        created_at
      FROM bookings 
      WHERE user_id = $1 
      ORDER BY date DESC, start_time DESC
      LIMIT $2 OFFSET $3
    `, [req.session.userId, limit, offset]);
    
    const totalPages = Math.ceil(totalBookings / limit);
    
    res.render('bookings', { 
      user,
      bookings: result.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalBookings,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      }
    });
  } catch (error) {
    console.error('Bookings page error:', error);
    return res.redirect('/dashboard');
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

// Update booking details (status, notes, etc.)
router.patch('/bookings/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  try {
    // First verify the booking belongs to the user
    const bookingCheck = await db.query(
      'SELECT id FROM bookings WHERE id = $1 AND user_id = $2',
      [id, req.session.userId]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add the booking ID as the last parameter
    values.push(id);

    const query = `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    
    await db.query(query, values);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
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
        const { full_name, display_name, meeting_link } = req.body;

        const updates = [];
        const values = [];
        let paramIndex = 1;

        const hasFullName = Object.prototype.hasOwnProperty.call(req.body, 'full_name');
        const hasDisplayName = Object.prototype.hasOwnProperty.call(req.body, 'display_name');
        const hasMeetingLink = Object.prototype.hasOwnProperty.call(req.body, 'meeting_link');

        if (hasFullName) {
            const sanitizedFullName = typeof full_name === 'string' ? full_name.trim() : null;
            updates.push(`full_name = $${paramIndex}`);
            values.push(sanitizedFullName && sanitizedFullName.length > 0 ? sanitizedFullName : null);
            paramIndex++;
        }

        if (hasDisplayName) {
            const sanitizedDisplayName = typeof display_name === 'string' ? display_name.trim() : null;
            const normalizedDisplayName = sanitizedDisplayName && sanitizedDisplayName.length > 0 ? sanitizedDisplayName : null;
            updates.push(`display_name = $${paramIndex}`);
            values.push(normalizedDisplayName);
            paramIndex++;

            updates.push(`has_set_display_name = $${paramIndex}`);
            values.push(Boolean(normalizedDisplayName));
            paramIndex++;
        }

        if (hasMeetingLink) {
            const sanitizedMeetingLink = typeof meeting_link === 'string' ? meeting_link.trim() : null;
            const normalizedMeetingLink = sanitizedMeetingLink && sanitizedMeetingLink.length > 0 ? sanitizedMeetingLink : null;
            updates.push(`meeting_link = $${paramIndex}`);
            values.push(normalizedMeetingLink);
            paramIndex++;

            updates.push(`has_shared_link = $${paramIndex}`);
            values.push(Boolean(normalizedMeetingLink));
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.session.userId);

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;

        await db.query(query, values);

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

// GET /dashboard/availability - Load availability settings
router.get('/availability', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;

    // Get working days from availability table (all blocks)
    const availabilityResult = await db.query(
      'SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = $1 ORDER BY day_of_week, start_time',
      [userId]
    );

    // Get universal breaks
    const breaksResult = await db.query(
      'SELECT enabled, start_time, end_time FROM universal_breaks WHERE user_id = $1',
      [userId]
    );

    // Get buffer minutes from users table
    const userResult = await db.query(
      'SELECT buffer_minutes FROM users WHERE id = $1',
      [userId]
    );

    // Format the response - group by day
    const workingDays = [...new Set(availabilityResult.rows.map(row => row.day_of_week))];
    const availability = {};
    const availabilityBlocks = availabilityResult.rows.map(row => ({
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time
    }));
    
    // Keep backward compatibility with old format (for first block of each day)
    availabilityResult.rows.forEach(row => {
      if (!availability[`day_${row.day_of_week}_start`]) {
        availability[`day_${row.day_of_week}_start`] = row.start_time;
        availability[`day_${row.day_of_week}_end`] = row.end_time;
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
      ...availability
    };

    res.json(response);
  } catch (error) {
    console.error('Error loading availability settings:', error);
    res.status(500).json({ success: false, error: 'Failed to load availability settings' });
  }
});

// POST /dashboard/availability - Save availability settings
router.post('/availability', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Log the entire request body for debugging
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    
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

      // Parse multiple time blocks per day (same logic as root.js)
      const blocksToInsert = [];
      
      // Try new format first (multiple blocks per day)
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayBlocks = req.body[`day_${dayIndex}_blocks`];
        
        if (dayBlocks) {
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
        
        // Check for flat format
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
        
        // Fallback to old format - only if explicitly provided
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
        
        return res.status(400).json({
          success: false,
          error: errorMessage,
          conflicts: conflicts
        });
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

      if (existingBreak.rows.length > 0) {
        await db.query(
          'UPDATE universal_breaks SET enabled = $1, start_time = $2, end_time = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4',
          [break_enabled, break_start, break_end, userId]
        );
      } else {
        await db.query(
          'INSERT INTO universal_breaks (user_id, enabled, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [userId, break_enabled, break_start, break_end]
        );
      }

      // Update buffer minutes and has_set_availability in users table
      // Only set has_set_availability to TRUE if at least one working day was added
      await db.query(
        'UPDATE users SET buffer_minutes = $1, has_set_availability = $3 WHERE id = $2',
        [parseInt(buffer_minutes) || 0, userId, hasWorkingDays]
      );

      // Commit transaction
      await db.query('COMMIT');

      // Redirect back to dashboard to show updated checklist
      res.redirect('/dashboard?checklist_updated=true');
    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error saving availability settings:', error);
    res.status(500).json({ success: false, error: 'Failed to save availability settings' });
  }
});

module.exports = router; 