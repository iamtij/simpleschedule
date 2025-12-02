const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mailService = require('../services/mail');
const { checkUserAccess } = require('../utils/subscription');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    // Check if this is an API request (expects JSON)
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
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

    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    user.subscriptionStatus = subscriptionStatus;

    res.render('contact-detail', { user, contactId: id });
  } catch (error) {
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

    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    user.subscriptionStatus = subscriptionStatus;

    res.render('contacts', { user });
  } catch (error) {
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
    
    // Get subscription status
    const subscriptionStatus = await checkUserAccess(req.session.userId);
    user.subscriptionStatus = subscriptionStatus;
    
    // Get filter parameter (upcoming, past, or all) - default to upcoming
    const filter = req.query.filter || 'upcoming';
    const searchTerm = req.query.search || '';
    
    // Get pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Calculate today's date using Manila timezone
    const now = new Date();
    const manilaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const today = manilaTime.toISOString().split('T')[0];
    
    // Build WHERE clause based on filter
    let whereConditions = ['user_id = $1'];
    let queryParams = [req.session.userId];
    let paramIndex = 2;
    
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
    
    // Get bookings with pagination
    queryParams.push(limit, offset);
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
      WHERE ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, queryParams);
    
    res.render('bookings', { 
      user,
      bookings: result.rows,
      filter: filter,
      searchTerm: searchTerm,
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
        res.status(500).json({ error: 'Failed to update account settings' });
    }
});

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/payment-proofs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'payment-proof-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept images and PDFs
        const allowedTypes = /jpeg|jpg|png|gif|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (jpeg, jpg, png, gif) and PDF files are allowed'));
        }
    }
});

// Payment proof submission
router.post('/payment-proof', requireLogin, upload.single('proof'), async (req, res) => {
    try {
        const { planType } = req.body;
        
        if (!planType || (planType !== 'monthly' && planType !== 'yearly')) {
            // Delete uploaded file if validation fails
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid plan type. Must be "monthly" or "yearly"' 
            });
        }

        // Check if monthly subscription is enabled when monthly plan is selected
        if (planType === 'monthly') {
            let monthlySubscriptionEnabled = true; // Default to enabled
            try {
                const settingResult = await db.query(
                    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
                    ['monthly_subscription_enabled']
                );
                if (settingResult.rows.length > 0) {
                    monthlySubscriptionEnabled = settingResult.rows[0].setting_value === 'true';
                }
            } catch (error) {
                console.error('Error fetching monthly subscription setting:', error);
                // Use default value if table doesn't exist yet
            }

            if (!monthlySubscriptionEnabled) {
                // Delete uploaded file if validation fails
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(400).json({ 
                    success: false, 
                    error: 'Monthly subscription is currently disabled' 
                });
            }
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment proof file is required' 
            });
        }

        // Get user data
        const userResult = await db.query(
            'SELECT id, email, username, full_name, display_name FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            // Delete uploaded file if user not found
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const user = userResult.rows[0];
        const planPrice = planType === 'monthly' ? 'PHP 499' : 'PHP 3,999';

        // Save payment proof to database
        try {
            const proofResult = await db.query(
                `INSERT INTO payment_proofs (user_id, plan_type, file_path, original_filename, file_size, status)
                 VALUES ($1, $2, $3, $4, $5, 'pending')
                 RETURNING id`,
                [
                    user.id,
                    planType,
                    req.file.path,
                    req.file.originalname,
                    req.file.size
                ]
            );
            console.log('Payment proof saved to database with ID:', proofResult.rows[0].id);
        } catch (dbError) {
            console.error('Error saving payment proof to database:', dbError);
            // Continue even if database save fails - email will still be sent
        }

        // Send email with payment proof
        try {
            await mailService.sendPaymentProof(
                user,
                planType,
                planPrice,
                req.file.path,
                req.file.originalname
            );
        } catch (emailError) {
            console.error('Error sending payment proof email:', emailError);
            // Don't fail the request if email fails, but log it
        }

        res.json({ 
            success: true, 
            message: 'Payment proof submitted successfully. We will review it and activate your Pro subscription shortly.' 
        });
    } catch (error) {
        // Delete uploaded file on error
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting uploaded file:', unlinkError);
            }
        }
        
        console.error('Payment proof submission error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to submit payment proof' 
        });
    }
});

// Get payment proofs for current user
router.get('/payment-proofs', requireLogin, async (req, res) => {
    try {
        const proofs = await db.query(
            `SELECT 
                id,
                plan_type,
                original_filename,
                file_size,
                status,
                submitted_at,
                notes
             FROM payment_proofs
             WHERE user_id = $1
             ORDER BY submitted_at DESC`,
            [req.session.userId]
        );
        
        res.json({ success: true, proofs: proofs.rows || [] });
    } catch (error) {
        console.error('Error fetching payment proofs:', error);
        // If table doesn't exist or any error, return empty array
        res.json({ success: true, proofs: [] });
    }
});

// Serve payment proof file for current user
router.get('/payment-proofs/:id/file', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const proofResult = await db.query(
            'SELECT file_path, original_filename, user_id FROM payment_proofs WHERE id = $1',
            [id]
        );
        
        if (proofResult.rows.length === 0) {
            return res.status(404).json({ error: 'Payment proof not found' });
        }
        
        const proof = proofResult.rows[0];
        
        // Verify the payment proof belongs to the current user
        if (proof.user_id !== req.session.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Handle both absolute and relative paths
        let filePath;
        if (path.isAbsolute(proof.file_path)) {
            filePath = proof.file_path;
        } else {
            filePath = path.join(__dirname, '..', proof.file_path);
        }
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.error('File not found at path:', filePath);
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Determine content type based on file extension
        const ext = path.extname(proof.original_filename).toLowerCase();
        const contentTypeMap = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';
        
        // Send file with proper content type
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${proof.original_filename}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving payment proof file:', error);
        res.status(500).json({ error: 'Failed to serve payment proof file' });
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

        // Format the availability data
        const workingDays = availabilityResult.rows.map(row => row.day_of_week);
        const availabilityData = {};
        
        availabilityResult.rows.forEach(row => {
            availabilityData[`day_${row.day_of_week}_start`] = row.start_time;
            availabilityData[`day_${row.day_of_week}_end`] = row.end_time;
        });

        // Format date availability data
        // Format dates without timezone conversion to avoid day shift
        const formatDate = (dateValue) => {
            const dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        
        const dateAvailabilityBlocks = dateAvailabilityResult.rows.map(row => ({
            id: row.id,
            date: formatDate(row.date),
            start_time: row.start_time,
            end_time: row.end_time
        }));

        const availabilitySettings = {
            working_days: workingDays,
            buffer_minutes: userResult.rows[0].buffer_minutes || 0,
            break_enabled: breaksResult.rows[0]?.enabled || false,
            break_start: breaksResult.rows[0]?.start_time || '12:00',
            break_end: breaksResult.rows[0]?.end_time || '13:00',
            meeting_durations: durationsResult.rows,
            date_availability_blocks: dateAvailabilityBlocks,
            ...availabilityData
        };

        // Get monthly subscription setting
        let monthlySubscriptionEnabled = true; // Default to enabled
        try {
            const settingResult = await db.query(
                'SELECT setting_value FROM system_settings WHERE setting_key = $1',
                ['monthly_subscription_enabled']
            );
            if (settingResult.rows.length > 0) {
                monthlySubscriptionEnabled = settingResult.rows[0].setting_value === 'true';
            }
        } catch (error) {
            console.error('Error fetching monthly subscription setting:', error);
            // Use default value if table doesn't exist yet
        }

        res.render('account-settings', {
            user: userResult.rows[0],
            availabilitySettings: availabilitySettings,
            monthlySubscriptionEnabled: monthlySubscriptionEnabled,
            title: 'Account Settings'
        });
    } catch (error) {
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
    res.status(500).json({ success: false, error: 'Failed to load availability settings' });
  }
});

// POST /dashboard/availability - Save availability settings
router.post('/availability', requireLogin, async (req, res) => {
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

      // Handle meeting durations (up to 3)
      const meetingDurations = req.body.meeting_durations || [];
      
      // Validate: max 3 durations
      if (meetingDurations.length > 3) {
        await db.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: 'Maximum of 3 meeting durations allowed' 
        });
      }
      
      // Validate: unique duration values
      const durationValues = meetingDurations.map(d => parseInt(d.duration_minutes)).filter(d => !isNaN(d) && d > 0);
      const uniqueDurations = [...new Set(durationValues)];
      if (durationValues.length !== uniqueDurations.length) {
        await db.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: 'Meeting durations must be unique' 
        });
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
    res.status(500).json({ success: false, error: 'Failed to save availability settings' });
  }
});

// GET /dashboard/date-availability - Load date-specific availability settings
router.get('/date-availability', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;

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

// POST /dashboard/date-availability - Save date-specific availability settings
router.post('/date-availability', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    
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
      if (req.body.replace_all === true || req.body.replace_all === 'true') {
        await db.query('DELETE FROM date_availability WHERE user_id = $1', [userId]);
      }

      // Insert new blocks
      for (const block of blocksToInsert) {
        await db.query(
          'INSERT INTO date_availability (user_id, date, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [userId, block.date, block.start, block.end]
        );
      }

      await db.query('COMMIT');

      res.json({ success: true, message: 'Date availability saved successfully' });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save date availability settings' });
  }
});

// DELETE /dashboard/date-availability/:id - Delete specific date availability entry
router.delete('/date-availability/:id', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM date_availability WHERE user_id = $1 AND id = $2 RETURNING id',
      [userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Date availability entry not found' });
    }

    res.json({ success: true, message: 'Date availability entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete date availability entry' });
  }
});

module.exports = router; 