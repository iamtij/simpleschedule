const express = require('express');
const router = express.Router();
const db = require('../db');
const mailService = require('../services/mail');
const smsService = require('../services/sms');
const telegramService = require('../services/telegram');
const googleCalendarService = require('../services/googleCalendar');
const timezone = require('../utils/timezone');
const { checkUserAccess } = require('../utils/subscription');

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

// Get user's public booking page with specific duration
router.get('/:username/:duration', async (req, res) => {
  try {
    const username = req.params.username;
    const duration = parseInt(req.params.duration);
    
    if (isNaN(duration) || duration <= 0) {
      return res.status(400).render('error', { message: 'Invalid duration' });
    }
    
    // Get user and validate duration exists
    const userResult = await db.query(
      'SELECT id, username, full_name, display_name, email FROM users WHERE username = $1',
      [username]
    );
    
    if (!userResult.rows[0]) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    // Check subscription/trial access
    const accessCheck = await checkUserAccess(userId);
    
    if (!accessCheck.hasAccess) {
      return res.render('booking-expired', { 
        user: userResult.rows[0],
        reason: accessCheck.reason || 'Subscription expired'
      });
    }
    
    // Check if this duration is configured for the user
    const durationResult = await db.query(
      'SELECT duration_minutes, meeting_link FROM meeting_durations WHERE user_id = $1 AND duration_minutes = $2 AND is_active = true',
      [userId, duration]
    );
    
    if (durationResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'This meeting duration is not available' });
    }
    
    const durationInfo = durationResult.rows[0];
    const user = {
      ...userResult.rows[0],
      duration_minutes: duration,
      meeting_link: durationInfo.meeting_link
    };
    
    res.render('booking-page', { user });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Get available time slots for a specific date and duration
router.get('/:username/:duration/slots', async (req, res) => {
    try {
        const username = req.params.username;
        const duration = parseInt(req.params.duration);
        
        if (isNaN(duration) || duration <= 0) {
            return res.status(400).json({ error: 'Invalid duration' });
        }
        
        // Get user by username
        const userResult = await db.query(
            'SELECT id, buffer_minutes, timezone FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userId = userResult.rows[0].id;
        
        // Validate duration exists for user
        const durationResult = await db.query(
            'SELECT duration_minutes FROM meeting_durations WHERE user_id = $1 AND duration_minutes = $2 AND is_active = true',
            [userId, duration]
        );
        
        if (durationResult.rows.length === 0) {
            return res.status(404).json({ error: 'This meeting duration is not available' });
        }
        
        const bufferMinutes = userResult.rows[0].buffer_minutes || 0;
        const userTimezone = timezone.getUserTimezone(userResult.rows[0].timezone);
        const date = req.query.date;
        const clientTimezone = req.query.timezone || userTimezone;
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        // Create date object preserving the date
        const [year, month, day] = date.split('-').map(Number);
        const requestedDate = new Date(Date.UTC(year, month - 1, day));
        
        // Get current time in client's timezone properly
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: clientTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const nowInClientTimezone = {
            year: parseInt(parts.find(p => p.type === 'year').value),
            month: parseInt(parts.find(p => p.type === 'month').value),
            day: parseInt(parts.find(p => p.type === 'day').value),
            hour: parseInt(parts.find(p => p.type === 'hour').value),
            minute: parseInt(parts.find(p => p.type === 'minute').value)
        };
        
        // Check if the requested date is in the past (in client's timezone)
        const todayDate = `${nowInClientTimezone.year}-${String(nowInClientTimezone.month).padStart(2, '0')}-${String(nowInClientTimezone.day).padStart(2, '0')}`;
        if (date < todayDate) {
            return res.json({ slots: [] });
        }
        
        
        // Get day of week in UTC (0-6, where 0 is Sunday)
        const dayOfWeek = requestedDate.getUTCDay();

        // Get availability for the day - check date-specific first, then fall back to day-of-week
        let availabilityResult = await db.query(
            'SELECT start_time, end_time FROM date_availability WHERE user_id = $1 AND date = $2 ORDER BY start_time',
            [userId, date]
        );

        // If no date-specific availability, fall back to day-of-week
        if (availabilityResult.rows.length === 0) {
            availabilityResult = await db.query(
                'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2 ORDER BY start_time',
                [userId, dayOfWeek]
            );
        }

        if (availabilityResult.rows.length === 0) {
            return res.json({ slots: [] });
        }

        // Get breaks for the day (both day-specific and universal breaks)
        const dayBreaksResult = await db.query(
            'SELECT start_time, end_time FROM breaks WHERE user_id = $1 AND day_of_week = $2',
            [userId, dayOfWeek]
        );
        
        // Get universal breaks
        const universalBreaksResult = await db.query(
            'SELECT start_time, end_time FROM universal_breaks WHERE user_id = $1 AND enabled = true',
            [userId]
        );
        
        // Combine both types of breaks
        const breaksResult = {
            rows: [...dayBreaksResult.rows, ...universalBreaksResult.rows]
        };

        // Get existing bookings for the date
        const bookingsResult = await db.query(
            'SELECT start_time, end_time FROM bookings WHERE user_id = $1 AND date = $2',
            [userId, date]
        );

        // Get Google Calendar conflicts if enabled
        let googleCalendarConflicts = [];
        try {
            const googleCalendarService = require('../services/googleCalendar');
            const tokens = await googleCalendarService.getUserTokens(userId);
            const userResult = await db.query(
                'SELECT google_calendar_blocking_enabled FROM users WHERE id = $1',
                [userId]
            );
            const googleCalendarBlockingEnabled = userResult.rows[0]?.google_calendar_blocking_enabled ?? true;
            
            if (tokens && tokens.google_access_token && googleCalendarBlockingEnabled) {
                
                // Get conflicts for the entire day
                const dayStart = `${date}T00:00:00`;
                const dayEnd = `${date}T23:59:59`;
                
                const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
                    userId,
                    dayStart,
                    dayEnd
                );
                
                if (conflictInfo.hasConflicts) {
                    googleCalendarConflicts = conflictInfo.conflicts.map(conflict => {
                        const startDate = new Date(conflict.start);
                        const endDate = new Date(conflict.end);
                        
                        
                        // Parse the conflict times directly as they come from Google Calendar
                        // Google Calendar returns times in the user's timezone
                        
                        let startTimeStr, endTimeStr;
                        
                        if (typeof conflict.start === 'string' && conflict.start.includes('T')) {
                            // Standard ISO format: 2025-10-21T09:00:00+08:00
                            startTimeStr = conflict.start.split('T')[1].split('+')[0].split('Z')[0].slice(0, 5);
                            endTimeStr = conflict.end.split('T')[1].split('+')[0].split('Z')[0].slice(0, 5);
                        } else if (typeof conflict.start === 'string') {
                            // Date-only format: 2025-10-21 (all-day event)
                            // Skip all-day events as they shouldn't block specific time slots
                            return null;
                        } else {
                            return null;
                        }
                        
                        
                        const conflictInMinutes = {
                            start: timeToMinutes(startTimeStr),
                            end: timeToMinutes(endTimeStr)
                        };
                        
                        return conflictInMinutes;
                    }).filter(conflict => conflict !== null);
                }
            }
        } catch (error) {
            // Continue without Google Calendar conflicts if there's an error
            googleCalendarConflicts = [];
        }

        // Generate available time slots from all availability blocks
        const availabilityBlocks = availabilityResult.rows;
        const breaks = breaksResult.rows;
        const bookings = bookingsResult.rows;
        
        // Create array of slots with dynamic meeting length + buffer time
        const slots = [];
        const meetingLength = duration; // Use duration from URL parameter
        const bufferTime = bufferMinutes || 15; // Default to 15 if not set
        const totalInterval = meetingLength + bufferTime;
        

        // Current time in minutes since midnight in client's timezone
        const currentTimeMinutes = nowInClientTimezone.hour * 60 + nowInClientTimezone.minute;
        
        // Check if requested date is today in client's timezone (normalize both dates for comparison)
        const normalizedRequestedDate = date.trim();
        const normalizedTodayDate = todayDate.trim();
        const isToday = normalizedRequestedDate === normalizedTodayDate;
        
        // Also check if dates are the same by parsing them (handles edge cases)
        let isTodayByParsing = false;
        try {
            const reqDateParts = normalizedRequestedDate.split('-');
            const todayDateParts = normalizedTodayDate.split('-');
            if (reqDateParts.length === 3 && todayDateParts.length === 3) {
                isTodayByParsing = (
                    parseInt(reqDateParts[0]) === parseInt(todayDateParts[0]) &&
                    parseInt(reqDateParts[1]) === parseInt(todayDateParts[1]) &&
                    parseInt(reqDateParts[2]) === parseInt(todayDateParts[2])
                );
            }
        } catch (e) {
            // Ignore parsing errors
        }
        
        const isTodayFinal = isToday || isTodayByParsing;

        // Generate slots for each availability block
        availabilityBlocks.forEach(availability => {
            // Convert times to minutes since midnight for easier calculation
            const workStart = timeToMinutes(availability.start_time);
            const workEnd = timeToMinutes(availability.end_time);

            // Generate slots with proper intervals for this block
            for (let time = workStart; time <= workEnd - meetingLength; time += totalInterval) {
                const slotStart = time;
                const slotEnd = time + meetingLength;
                
                // Skip slots that have already started or don't have enough buffer time
                // For today, ensure the slot starts at least bufferTime minutes from now
                if (isTodayFinal) {
                    // Slot must start AFTER current time + buffer time (strict greater than)
                    // This ensures users can't book slots that have already passed or don't have enough prep time
                    const minAllowedStartTime = currentTimeMinutes + bufferTime;
                    if (slotStart < minAllowedStartTime) {
                        continue;
                    }
                }
                
                // Check if slot overlaps with any breaks (no buffer time applied to breaks)
                const overlapsBreak = breaks.some(b => {
                    const breakStart = timeToMinutes(b.start_time);
                    const breakEnd = timeToMinutes(b.end_time);
                    
                    // Check if slot overlaps with the break zone (no buffer applied to breaks)
                    return (slotStart < breakEnd && slotEnd > breakStart);
                });
                
                // Check if slot overlaps with any bookings
                const overlapsBooking = bookings.some(b => {
                    const bookingStart = timeToMinutes(b.start_time);
                    const bookingEnd = timeToMinutes(b.end_time);
                    return (slotStart < bookingEnd && slotEnd > bookingStart);
                });
                
                // Check if slot overlaps with any Google Calendar events (including buffer time)
                const overlapsGoogleCalendar = googleCalendarConflicts.some(conflict => {
                    // Apply buffer time to the conflict boundaries
                    const conflictStartWithBuffer = conflict.start - bufferTime;
                const conflictEndWithBuffer = conflict.end + bufferTime;
                
                // Debug logging for buffer time logic
                const slotStartTime = minutesToTime(slotStart);
                const slotEndTime = minutesToTime(slotEnd);
                const conflictStartTime = minutesToTime(conflict.start);
                const conflictEndTime = minutesToTime(conflict.end);
                const conflictStartWithBufferTime = minutesToTime(conflictStartWithBuffer);
                const conflictEndWithBufferTime = minutesToTime(conflictEndWithBuffer);
                
                const overlaps = (slotStart < conflictEndWithBuffer && slotEnd > conflictStartWithBuffer);
                
                
                
                // Check if slot overlaps with the expanded conflict zone (including buffer)
                return overlaps;
            });
            
            // Only check if the actual meeting fits within working hours
            const fitsInWorkingHours = slotEnd <= workEnd;
            
            const slotStartTime = minutesToTime(slotStart);
            const slotEndTime = minutesToTime(slotEnd);
            
            // Verify slot duration matches requested duration
            const calculatedDuration = timeToMinutes(slotEndTime) - timeToMinutes(slotStartTime);
            
            if (!overlapsBreak && !overlapsBooking && !overlapsGoogleCalendar && fitsInWorkingHours) {
                slots.push({
                    start_time: slotStartTime,
                    end_time: slotEndTime
                });
            }
            }
        });

        res.json({ slots });
    } catch (error) {
        // Return empty slots array instead of error to allow frontend to show "no available times"
        // This ensures the booking page still works even if there's an error (e.g., when no durations are configured)
        res.json({ slots: [] });
    }
});

// Create a new booking with specific duration
router.post('/:username/:duration', async (req, res) => {
    const { date, start_time, end_time, client_name, client_email, client_phone, notes } = req.body;
    const username = req.params.username;
    const duration = parseInt(req.params.duration);
    
    if (isNaN(duration) || duration <= 0) {
        return res.status(400).json({ error: 'Invalid duration' });
    }
    
    // Get the user ID from username
    const userResult = await db.query(
        'SELECT id, full_name, email, username, meeting_link, is_pro, pro_expires_at, google_calendar_blocking_enabled FROM users WHERE username = $1',
        [username]
    );

    if (!userResult.rows[0]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const host = userResult.rows[0];
    
    // Check subscription/trial access
    const accessCheck = await checkUserAccess(userId);
    
    if (!accessCheck.hasAccess) {
        return res.status(403).json({
            error: 'Subscription required. Your trial has expired. Please subscribe to continue accepting bookings.',
            code: 'SUBSCRIPTION_REQUIRED'
        });
    }
    
    // Get duration-specific meeting link
    const durationResult = await db.query(
        'SELECT meeting_link FROM meeting_durations WHERE user_id = $1 AND duration_minutes = $2 AND is_active = true',
        [userId, duration]
    );
    
    if (durationResult.rows.length === 0) {
        return res.status(404).json({ error: 'This meeting duration is not available' });
    }
    
    // Use duration-specific meeting link if available, otherwise fall back to user's default
    const meetingLink = durationResult.rows[0].meeting_link || host.meeting_link;

    // Validate required fields
    if (!date || !start_time || !end_time || !client_name || !client_email) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate that the booking duration matches the requested duration
    const bookingStartMinutes = timeToMinutes(start_time);
    const bookingEndMinutes = timeToMinutes(end_time);
    const actualDuration = bookingEndMinutes - bookingStartMinutes;
    
    if (actualDuration !== duration) {
        return res.status(400).json({ error: `Booking duration must be ${duration} minutes` });
    }

    // Parse and validate the date
    const [year, month, day] = date.split('-').map(Number);
    const bookingDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = bookingDate.getUTCDay();


    // Verify this time slot is actually available (check all blocks for the day)
    const availabilityResult = await db.query(
        'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2 ORDER BY start_time',
        [userId, dayOfWeek]
    );

    if (availabilityResult.rows.length === 0) {
        return res.status(400).json({ error: 'This time slot is not available' });
    }

    // Check if the requested time falls within any of the availability blocks
    let isValidSlot = false;
    for (const block of availabilityResult.rows) {
        const blockStartMinutes = timeToMinutes(block.start_time);
        const blockEndMinutes = timeToMinutes(block.end_time);
        
        // Check if booking is completely within this block
        if (bookingStartMinutes >= blockStartMinutes && bookingEndMinutes <= blockEndMinutes) {
            isValidSlot = true;
            break;
        }
    }
    
    if (!isValidSlot) {
        return res.status(400).json({ error: 'This time slot is not within your available hours' });
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
        return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    // Check for Google Calendar conflicts if sync is enabled and blocking is enabled
    try {
        const googleCalendarService = require('../services/googleCalendar');
        const tokens = await googleCalendarService.getUserTokens(userId);
        const googleCalendarBlockingEnabled = host.google_calendar_blocking_enabled;
        
        if (tokens && tokens.google_access_token && googleCalendarBlockingEnabled) {
            
            // Get user's timezone for proper time formatting
            const userResult = await db.query('SELECT timezone FROM users WHERE id = $1', [userId]);
            const userTimezone = timezone.getUserTimezone(userResult.rows[0]?.timezone);
            
            // Format the booking time for Google Calendar API with proper timezone
            const bookingStartTime = `${bookingDate.toISOString().split('T')[0]}T${start_time}:00${timezone.getDefaultUtcOffset()}`;
            const bookingEndTime = `${bookingDate.toISOString().split('T')[0]}T${end_time}:00${timezone.getDefaultUtcOffset()}`;
            
            
            const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
                userId,
                bookingStartTime,
                bookingEndTime
            );
            
            if (conflictInfo.hasConflicts) {
                return res.status(409).json({ 
                    error: 'This time slot conflicts with existing Google Calendar events',
                    conflicts: conflictInfo.conflicts,
                    conflictType: 'google_calendar'
                });
            } else {
            }
        } else {
            if (!tokens || !tokens.google_access_token) {
            } else if (!googleCalendarBlockingEnabled) {
            }
        }
    } catch (googleError) {
        // Don't fail the booking if Google Calendar check fails
    }

    // Insert the booking
    const bookingResult = await db.query(
        `INSERT INTO bookings (user_id, date, start_time, end_time, client_name, client_email, client_phone, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, confirmation_uuid, date::text, start_time::text, end_time::text, client_name, client_email, client_phone, notes`,
        [userId, date, start_time, end_time, client_name, client_email, client_phone, notes]
    );

    // Format the booking times
    const booking = bookingResult.rows[0];
    booking.formatted_start_time = formatTime(booking.start_time);
    booking.formatted_end_time = formatTime(booking.end_time);

    // Update host object with duration-specific meeting link
    host.meeting_link = meetingLink;

    // Sync to Google Calendar if connected
    try {
        const tokens = await googleCalendarService.getUserTokens(userId);
        
        if (tokens && tokens.google_access_token) {
            
            // Get user's timezone for Google Calendar event
            const userResult = await db.query('SELECT timezone FROM users WHERE id = $1', [userId]);
            const userTimezone = timezone.getUserTimezone(userResult.rows[0]?.timezone);
            
            // Create Google Calendar event
            let description = `Booking from isked\nClient: ${booking.client_name}\nEmail: ${booking.client_email}`;
            
            if (booking.client_phone) {
                description += `\nPhone: ${booking.client_phone}`;
            }
            
            if (booking.notes) {
                description += `\nNotes: ${booking.notes}`;
            }
            
            if (host.meeting_link) {
                description += `\n\nMeeting Link: ${host.meeting_link}`;
            }
            
            const hostNameForTitle = host.name || host.display_name || host.full_name || host.username || 'Host';
            const clientNameForTitle = booking.client_name || 'Client';
            const eventDetails = {
                title: `${clientNameForTitle} with ${hostNameForTitle}`,
                description: description,
                startTime: `${booking.date}T${booking.start_time}:00${timezone.getDefaultUtcOffset()}`,
                endTime: `${booking.date}T${booking.end_time}:00${timezone.getDefaultUtcOffset()}`,
                timeZone: userTimezone,
                attendees: [{ email: booking.client_email }],
            };
            
            
            const googleEvent = await googleCalendarService.createCalendarEvent(userId, eventDetails);
            
            // Update booking with Google Event ID and link (separate from notes)
            await db.query(
                'UPDATE bookings SET google_event_id = $1, google_calendar_link = $2 WHERE id = $3',
                [googleEvent.id, googleEvent.htmlLink, booking.id]
            );
            
            // Add Google Calendar link to booking object for display
            booking.google_calendar_link = googleEvent.htmlLink;
            booking.google_event_id = googleEvent.id;
            
        } else {
        }
    } catch (googleError) {
        // Don't fail the booking if Google Calendar sync fails
    }

    // Send confirmation emails and SMS (if pro)
    try {
        const notifications = [
            mailService.sendClientConfirmation(booking, host),
            mailService.sendHostNotification(booking, host)
        ];

        // Only attempt SMS if phone number is provided
        if (booking.client_phone) {
            if (host.is_pro && (!host.pro_expires_at || new Date(host.pro_expires_at) > new Date())) {
                notifications.push(smsService.sendBookingConfirmationSMS(booking, host));
            } else {
            }
        }

        await Promise.all(notifications);
    } catch (notificationError) {
        // Don't fail the booking if notifications fail
    }

    // Send Telegram notification if enabled
    if (host.telegram_notifications_enabled && host.telegram_chat_id) {
        try {
            await telegramService.sendBookingNotification(booking, host, host.telegram_chat_id);
        } catch (telegramError) {
            // Telegram notification failed, continue without it
        }
    }

    // Return JSON response for AJAX handling
    res.json({
        success: true,
        id: booking.id,
        confirmation_uuid: booking.confirmation_uuid,
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        formatted_date: booking.date, // You can format this if needed
        formatted_start_time: booking.formatted_start_time,
        formatted_end_time: booking.formatted_end_time,
        client_name: booking.client_name,
        client_email: booking.client_email,
        google_calendar_link: booking.google_calendar_link
    });
});

// Get user's public booking page (backward compatibility - defaults to first active duration or 60 minutes)
router.get('/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const result = await db.query(
      'SELECT id, username, full_name, display_name, email, meeting_link FROM users WHERE username = $1',
      [username]
    );
    
    if (!result.rows[0]) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    
    const userId = result.rows[0].id;
    
    // Check subscription/trial access
    const accessCheck = await checkUserAccess(userId);
    
    if (!accessCheck.hasAccess) {
      return res.render('booking-expired', { 
        user: result.rows[0],
        reason: accessCheck.reason || 'Subscription expired'
      });
    }
    
    // Find first active duration for the user, or default to 60 minutes
    let duration = null; // null means use default route without duration (defaults to 60 minutes)
    let meetingLink = result.rows[0].meeting_link;
    
    try {
      const durationResult = await db.query(
        'SELECT duration_minutes, meeting_link FROM meeting_durations WHERE user_id = $1 AND is_active = true ORDER BY COALESCE(display_order, 0) ASC, duration_minutes ASC LIMIT 1',
        [userId]
      );
      
      // If user has an active duration configured, use it
      if (durationResult.rows.length > 0) {
        duration = durationResult.rows[0].duration_minutes;
        meetingLink = durationResult.rows[0].meeting_link || meetingLink;
      }
    } catch (error) {
      // If query fails, continue with null duration (will use default route)
    }
    // If no active durations, duration stays null - frontend will use /booking/:username/slots which defaults to 60 minutes
    
    const user = {
      ...result.rows[0],
      duration_minutes: duration,
      meeting_link: meetingLink
    };
    
    res.render('booking-page', { user });
  } catch (error) {
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
        // First get the user ID and timezone from username
        const userResult = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (!userResult.rows[0]) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].id;

        // Create date object and get day of week in UTC
        const utcDate = new Date(date);
        const dayOfWeek = utcDate.getUTCDay();
        
        
        // Get user's availability for this day - check date-specific first, then fall back to day-of-week
        let availabilityResult = await db.query(
            'SELECT start_time, end_time FROM date_availability WHERE user_id = $1 AND date = $2 ORDER BY start_time',
            [userId, date]
        );

        // If no date-specific availability, fall back to day-of-week
        if (availabilityResult.rows.length === 0) {
            availabilityResult = await db.query(
                'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2 ORDER BY start_time',
                [userId, dayOfWeek]
            );
        }

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
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a new booking
router.post('/:username', async (req, res) => {
    const { date, start_time, end_time, client_name, client_email, client_phone, notes } = req.body;
    const username = req.params.username;
    
    
    // Get the user ID from username
    const userResult = await db.query(
        'SELECT id, full_name, email, username, meeting_link, is_pro, pro_expires_at, google_calendar_blocking_enabled FROM users WHERE username = $1',
        [username]
    );

    if (!userResult.rows[0]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;
    const host = userResult.rows[0];

    // Check subscription/trial access
    const accessCheck = await checkUserAccess(userId);
    
    if (!accessCheck.hasAccess) {
        return res.status(403).json({
            error: 'Subscription required. Your trial has expired. Please subscribe to continue accepting bookings.',
            code: 'SUBSCRIPTION_REQUIRED'
        });
    }

    // Validate required fields
    if (!date || !start_time || !end_time || !client_name || !client_email) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Parse and validate the date
    const [year, month, day] = date.split('-').map(Number);
    const bookingDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = bookingDate.getUTCDay();


    // Verify this time slot is actually available (check all blocks for the day)
    // Check date-specific first, then fall back to day-of-week
    let availabilityResult = await db.query(
        'SELECT start_time, end_time FROM date_availability WHERE user_id = $1 AND date = $2 ORDER BY start_time',
        [userId, date]
    );

    // If no date-specific availability, fall back to day-of-week
    if (availabilityResult.rows.length === 0) {
        availabilityResult = await db.query(
            'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2 ORDER BY start_time',
            [userId, dayOfWeek]
        );
    }

    if (availabilityResult.rows.length === 0) {
        return res.status(400).json({ error: 'This time slot is not available' });
    }

    // Check if the requested time falls within any of the availability blocks
    const bookingStartMinutes = timeToMinutes(start_time);
    const bookingEndMinutes = timeToMinutes(end_time);
    
    let isValidSlot = false;
    for (const block of availabilityResult.rows) {
        const blockStartMinutes = timeToMinutes(block.start_time);
        const blockEndMinutes = timeToMinutes(block.end_time);
        
        // Check if booking is completely within this block
        if (bookingStartMinutes >= blockStartMinutes && bookingEndMinutes <= blockEndMinutes) {
            isValidSlot = true;
            break;
        }
    }
    
    if (!isValidSlot) {
        return res.status(400).json({ error: 'This time slot is not within your available hours' });
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
        return res.status(409).json({ error: 'This time slot is no longer available' });
    }

    // Check for Google Calendar conflicts if sync is enabled and blocking is enabled
    try {
        const googleCalendarService = require('../services/googleCalendar');
        const tokens = await googleCalendarService.getUserTokens(userId);
        const googleCalendarBlockingEnabled = host.google_calendar_blocking_enabled;
        
        if (tokens && tokens.google_access_token && googleCalendarBlockingEnabled) {
            
            // Get user's timezone for proper time formatting
            const userResult = await db.query('SELECT timezone FROM users WHERE id = $1', [userId]);
            const userTimezone = timezone.getUserTimezone(userResult.rows[0]?.timezone);
            
            // Format the booking time for Google Calendar API with proper timezone
            const bookingStartTime = `${bookingDate.toISOString().split('T')[0]}T${start_time}:00${timezone.getDefaultUtcOffset()}`;
            const bookingEndTime = `${bookingDate.toISOString().split('T')[0]}T${end_time}:00${timezone.getDefaultUtcOffset()}`;
            
            
            const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
                userId,
                bookingStartTime,
                bookingEndTime
            );
            
            if (conflictInfo.hasConflicts) {
                return res.status(409).json({ 
                    error: 'This time slot conflicts with existing Google Calendar events',
                    conflicts: conflictInfo.conflicts,
                    conflictType: 'google_calendar'
                });
            } else {
            }
        } else {
            if (!tokens || !tokens.google_access_token) {
            } else if (!googleCalendarBlockingEnabled) {
            }
        }
    } catch (googleError) {
        // Don't fail the booking if Google Calendar check fails
    }

    // Insert the booking
    const bookingResult = await db.query(
        `INSERT INTO bookings (user_id, date, start_time, end_time, client_name, client_email, client_phone, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, confirmation_uuid, date::text, start_time::text, end_time::text, client_name, client_email, client_phone, notes`,
        [userId, date, start_time, end_time, client_name, client_email, client_phone, notes]
    );

    // Format the booking times
    const booking = bookingResult.rows[0];
    booking.formatted_start_time = formatTime(booking.start_time);
    booking.formatted_end_time = formatTime(booking.end_time);


    // Sync to Google Calendar if connected
    try {
        const tokens = await googleCalendarService.getUserTokens(userId);
        
        if (tokens && tokens.google_access_token) {
            
            // Get user's timezone for Google Calendar event
            const userResult = await db.query('SELECT timezone FROM users WHERE id = $1', [userId]);
            const userTimezone = timezone.getUserTimezone(userResult.rows[0]?.timezone);
            
            // Create Google Calendar event
            let description = `Booking from isked\nClient: ${booking.client_name}\nEmail: ${booking.client_email}`;
            
            if (booking.client_phone) {
                description += `\nPhone: ${booking.client_phone}`;
            }
            
            if (booking.notes) {
                description += `\nNotes: ${booking.notes}`;
            }
            
            if (host.meeting_link) {
                description += `\n\nMeeting Link: ${host.meeting_link}`;
            }
            
            const hostNameForTitle = host.name || host.display_name || host.full_name || host.username || 'Host';
            const clientNameForTitle = booking.client_name || 'Client';
            const eventDetails = {
                title: `${clientNameForTitle} with ${hostNameForTitle}`,
                description: description,
                startTime: `${booking.date}T${booking.start_time}:00${timezone.getDefaultUtcOffset()}`,
                endTime: `${booking.date}T${booking.end_time}:00${timezone.getDefaultUtcOffset()}`,
                timeZone: userTimezone,
                attendees: [{ email: booking.client_email }],
            };
            
            
            const googleEvent = await googleCalendarService.createCalendarEvent(userId, eventDetails);
            
            // Update booking with Google Event ID and link (separate from notes)
            await db.query(
                'UPDATE bookings SET google_event_id = $1, google_calendar_link = $2 WHERE id = $3',
                [googleEvent.id, googleEvent.htmlLink, booking.id]
            );
            
            // Add Google Calendar link to booking object for display
            booking.google_calendar_link = googleEvent.htmlLink;
            booking.google_event_id = googleEvent.id;
            
        } else {
        }
    } catch (googleError) {
        // Don't fail the booking if Google Calendar sync fails
    }

    // Send confirmation emails and SMS (if pro)
    try {
        const notifications = [
            mailService.sendClientConfirmation(booking, host),
            mailService.sendHostNotification(booking, host)
        ];

        // Only attempt SMS if phone number is provided
        if (booking.client_phone) {
            if (host.is_pro && (!host.pro_expires_at || new Date(host.pro_expires_at) > new Date())) {
                notifications.push(smsService.sendBookingConfirmationSMS(booking, host));
            } else {
            }
        }

        await Promise.all(notifications);
    } catch (notificationError) {
        // Don't fail the booking if notifications fail
    }

    // Send Telegram notification if enabled
    if (host.telegram_notifications_enabled && host.telegram_chat_id) {
        try {
            await telegramService.sendBookingNotification(booking, host, host.telegram_chat_id);
        } catch (telegramError) {
            // Telegram notification failed, continue without it
        }
    }

    // Return JSON response for AJAX handling
    res.json({
        success: true,
        id: booking.id,
        confirmation_uuid: booking.confirmation_uuid,
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        formatted_date: booking.date, // You can format this if needed
        formatted_start_time: booking.formatted_start_time,
        formatted_end_time: booking.formatted_end_time,
        client_name: booking.client_name,
        client_email: booking.client_email,
        google_calendar_link: booking.google_calendar_link
    });
});

router.get('/:username/slots', async (req, res) => {
    try {
        // Get user by username
        const userResult = await db.query(
            'SELECT id, buffer_minutes, timezone FROM users WHERE username = $1',
            [req.params.username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userId = userResult.rows[0].id;
        
        // Find first active duration for the user, or default to 60 minutes
        let meetingLength = 60; // Default to 60 minutes
        try {
            const durationResult = await db.query(
                'SELECT duration_minutes FROM meeting_durations WHERE user_id = $1 AND is_active = true ORDER BY COALESCE(display_order, 0) ASC, duration_minutes ASC LIMIT 1',
                [userId]
            );
            
            // Use first active duration if available
            if (durationResult.rows.length > 0 && durationResult.rows[0].duration_minutes) {
                meetingLength = parseInt(durationResult.rows[0].duration_minutes);
            }
        } catch (error) {
            // If query fails, continue with default 60 minutes
        }
        
        // Ensure meetingLength is valid
        if (isNaN(meetingLength) || meetingLength <= 0) {
            meetingLength = 60;
        }
        
        const bufferMinutes = userResult.rows[0].buffer_minutes || 0;
        const userTimezone = timezone.getUserTimezone(userResult.rows[0].timezone);
        const date = req.query.date;
        const clientTimezone = req.query.timezone || userTimezone;
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        // Create date object preserving the date
        const [year, month, day] = date.split('-').map(Number);
        
        // Validate date components
        if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
            return res.status(400).json({ error: 'Invalid date format' });
        }
        
        const requestedDate = new Date(Date.UTC(year, month - 1, day));
        
        // Validate the date is valid
        if (isNaN(requestedDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date' });
        }
        
        // Get current time in client's timezone properly
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: clientTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const nowInClientTimezone = {
            year: parseInt(parts.find(p => p.type === 'year').value),
            month: parseInt(parts.find(p => p.type === 'month').value),
            day: parseInt(parts.find(p => p.type === 'day').value),
            hour: parseInt(parts.find(p => p.type === 'hour').value),
            minute: parseInt(parts.find(p => p.type === 'minute').value)
        };
        
        // Check if the requested date is in the past (in client's timezone)
        const todayDate = `${nowInClientTimezone.year}-${String(nowInClientTimezone.month).padStart(2, '0')}-${String(nowInClientTimezone.day).padStart(2, '0')}`;
        if (date < todayDate) {
            return res.json({ slots: [] });
        }
        
        
        // Get day of week in UTC (0-6, where 0 is Sunday)
        const dayOfWeek = requestedDate.getUTCDay();

        // Get availability for the day - check date-specific first, then fall back to day-of-week
        let availabilityResult = await db.query(
            'SELECT start_time, end_time FROM date_availability WHERE user_id = $1 AND date = $2 ORDER BY start_time',
            [userId, date]
        );

        // If no date-specific availability, fall back to day-of-week
        if (availabilityResult.rows.length === 0) {
            availabilityResult = await db.query(
                'SELECT start_time, end_time FROM availability WHERE user_id = $1 AND day_of_week = $2 ORDER BY start_time',
                [userId, dayOfWeek]
            );
        }

        if (availabilityResult.rows.length === 0) {
            return res.json({ slots: [] });
        }

        // Get breaks for the day (both day-specific and universal breaks)
        const dayBreaksResult = await db.query(
            'SELECT start_time, end_time FROM breaks WHERE user_id = $1 AND day_of_week = $2',
            [userId, dayOfWeek]
        );
        
        // Get universal breaks
        const universalBreaksResult = await db.query(
            'SELECT start_time, end_time FROM universal_breaks WHERE user_id = $1 AND enabled = true',
            [userId]
        );
        
        // Combine both types of breaks
        const breaksResult = {
            rows: [...dayBreaksResult.rows, ...universalBreaksResult.rows]
        };

        // Get existing bookings for the date
        const bookingsResult = await db.query(
            'SELECT start_time, end_time FROM bookings WHERE user_id = $1 AND date = $2',
            [userId, date]
        );

        // Get Google Calendar conflicts if enabled
        let googleCalendarConflicts = [];
        try {
            const googleCalendarService = require('../services/googleCalendar');
            const tokens = await googleCalendarService.getUserTokens(userId);
            const userResult = await db.query(
                'SELECT google_calendar_blocking_enabled FROM users WHERE id = $1',
                [userId]
            );
            const googleCalendarBlockingEnabled = userResult.rows[0]?.google_calendar_blocking_enabled ?? true;
            
            if (tokens && tokens.google_access_token && googleCalendarBlockingEnabled) {
                
                // Get conflicts for the entire day
                const dayStart = `${date}T00:00:00`;
                const dayEnd = `${date}T23:59:59`;
                
                const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
                    userId,
                    dayStart,
                    dayEnd
                );
                
                if (conflictInfo.hasConflicts) {
                    googleCalendarConflicts = conflictInfo.conflicts.map(conflict => {
                        const startDate = new Date(conflict.start);
                        const endDate = new Date(conflict.end);
                        
                        
                        // Parse the conflict times directly as they come from Google Calendar
                        // Google Calendar returns times in the user's timezone
                        
                        let startTimeStr, endTimeStr;
                        
                        if (typeof conflict.start === 'string' && conflict.start.includes('T')) {
                            // Standard ISO format: 2025-10-21T09:00:00+08:00
                            startTimeStr = conflict.start.split('T')[1].split('+')[0].split('Z')[0].slice(0, 5);
                            endTimeStr = conflict.end.split('T')[1].split('+')[0].split('Z')[0].slice(0, 5);
                        } else if (typeof conflict.start === 'string') {
                            // Date-only format: 2025-10-21 (all-day event)
                            // Skip all-day events as they shouldn't block specific time slots
                            return null;
                        } else {
                            return null;
                        }
                        
                        
                        const conflictInMinutes = {
                            start: timeToMinutes(startTimeStr),
                            end: timeToMinutes(endTimeStr)
                        };
                        
                        return conflictInMinutes;
                    }).filter(conflict => conflict !== null);
                }
            }
        } catch (error) {
            // Continue without Google Calendar conflicts if there's an error
            googleCalendarConflicts = [];
        }

        // Generate available time slots from all availability blocks
        const availabilityBlocks = availabilityResult.rows;
        const breaks = breaksResult.rows;
        const bookings = bookingsResult.rows;
        
        // Create array of slots with dynamic meeting length + buffer time
        const slots = [];
        const bufferTime = bufferMinutes || 15; // Default to 15 if not set
        const totalInterval = meetingLength + bufferTime;

        // Current time in minutes since midnight in client's timezone
        const currentTimeMinutes = nowInClientTimezone.hour * 60 + nowInClientTimezone.minute;
        
        // Check if requested date is today in client's timezone (normalize both dates for comparison)
        const normalizedRequestedDate = date.trim();
        const normalizedTodayDate = todayDate.trim();
        const isToday = normalizedRequestedDate === normalizedTodayDate;
        
        // Also check if dates are the same by parsing them (handles edge cases)
        let isTodayByParsing = false;
        try {
            const reqDateParts = normalizedRequestedDate.split('-');
            const todayDateParts = normalizedTodayDate.split('-');
            if (reqDateParts.length === 3 && todayDateParts.length === 3) {
                isTodayByParsing = (
                    parseInt(reqDateParts[0]) === parseInt(todayDateParts[0]) &&
                    parseInt(reqDateParts[1]) === parseInt(todayDateParts[1]) &&
                    parseInt(reqDateParts[2]) === parseInt(todayDateParts[2])
                );
            }
        } catch (e) {
            // Ignore parsing errors
        }
        
        const isTodayFinal = isToday || isTodayByParsing;

        // Generate slots for each availability block
        availabilityBlocks.forEach(availability => {
            // Convert times to minutes since midnight for easier calculation
            const workStart = timeToMinutes(availability.start_time);
            const workEnd = timeToMinutes(availability.end_time);

            // Generate slots with proper intervals for this block
            for (let time = workStart; time <= workEnd - meetingLength; time += totalInterval) {
                const slotStart = time;
                const slotEnd = time + meetingLength;
                
                // Skip slots that have already started or don't have enough buffer time
                // For today, ensure the slot starts at least bufferTime minutes from now
                if (isTodayFinal) {
                    // Slot must start AFTER current time + buffer time (strict greater than)
                    // This ensures users can't book slots that have already passed or don't have enough prep time
                    const minAllowedStartTime = currentTimeMinutes + bufferTime;
                    if (slotStart < minAllowedStartTime) {
                        continue;
                    }
                }
                
                // Check if slot overlaps with any breaks (no buffer time applied to breaks)
                const overlapsBreak = breaks.some(b => {
                    const breakStart = timeToMinutes(b.start_time);
                    const breakEnd = timeToMinutes(b.end_time);
                    
                    // Check if slot overlaps with the break zone (no buffer applied to breaks)
                    return (slotStart < breakEnd && slotEnd > breakStart);
                });
                
                // Check if slot overlaps with any bookings
                const overlapsBooking = bookings.some(b => {
                    const bookingStart = timeToMinutes(b.start_time);
                    const bookingEnd = timeToMinutes(b.end_time);
                    return (slotStart < bookingEnd && slotEnd > bookingStart);
                });
                
                // Check if slot overlaps with any Google Calendar events (including buffer time)
                const overlapsGoogleCalendar = googleCalendarConflicts.some(conflict => {
                    // Apply buffer time to the conflict boundaries
                    const conflictStartWithBuffer = conflict.start - bufferTime;
                const conflictEndWithBuffer = conflict.end + bufferTime;
                
                // Debug logging for buffer time logic
                const slotStartTime = minutesToTime(slotStart);
                const slotEndTime = minutesToTime(slotEnd);
                const conflictStartTime = minutesToTime(conflict.start);
                const conflictEndTime = minutesToTime(conflict.end);
                const conflictStartWithBufferTime = minutesToTime(conflictStartWithBuffer);
                const conflictEndWithBufferTime = minutesToTime(conflictEndWithBuffer);
                
                const overlaps = (slotStart < conflictEndWithBuffer && slotEnd > conflictStartWithBuffer);
                
                
                
                // Check if slot overlaps with the expanded conflict zone (including buffer)
                return overlaps;
            });
            
            // Only check if the actual meeting fits within working hours
            const fitsInWorkingHours = slotEnd <= workEnd;
            
            const slotStartTime = minutesToTime(slotStart);
            const slotEndTime = minutesToTime(slotEnd);
            
            if (!overlapsBreak && !overlapsBooking && !overlapsGoogleCalendar && fitsInWorkingHours) {
                slots.push({
                    start_time: slotStartTime,
                    end_time: slotEndTime
                });
            }
            }
        });

        res.json({ slots });
    } catch (error) {
        // Return empty slots array instead of error to allow frontend to show "no available times"
        // This ensures the booking page still works even if there's an error (e.g., when no durations are configured)
        res.json({ slots: [] });
    }
});

// Get user's booking playground page for testing new implementations
router.get('/playground/:username', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, full_name, display_name, email FROM users WHERE username = $1',
      [req.params.username]
    );
    
    if (!result.rows[0]) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    res.render('booking-playground', { user: result.rows[0] });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Get booking confirmation page
router.get('/:username/confirmation/:confirmationUuid', async (req, res) => {
  try {
    const { username, confirmationUuid } = req.params;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(confirmationUuid)) {
      return res.status(404).render('error', { 
        message: 'Invalid confirmation link',
        title: 'Link Not Found',
        showHomeLink: true
      });
    }
    
    // Get user information
    const userResult = await db.query(
      'SELECT id, username, full_name, display_name, email, meeting_link FROM users WHERE username = $1',
      [username]
    );
    
    if (!userResult.rows[0]) {
      return res.status(404).render('error', { message: 'User not found' });
    }
    
    const host = userResult.rows[0];
    
    // Get booking information using UUID
    const bookingResult = await db.query(
      `SELECT id, date, start_time, end_time, client_name, client_email, client_phone, notes, google_event_id, google_calendar_link
       FROM bookings 
       WHERE confirmation_uuid = $1 AND user_id = $2`,
      [confirmationUuid, host.id]
    );
    
    if (!bookingResult.rows[0]) {
      return res.status(404).render('error', { message: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Format the booking times
    booking.formatted_start_time = formatTime(booking.start_time);
    booking.formatted_end_time = formatTime(booking.end_time);
    
    res.render('booking-confirmation', { booking, host });
  } catch (error) {
    res.status(500).render('error', { message: 'Server error' });
  }
});

module.exports = router; 