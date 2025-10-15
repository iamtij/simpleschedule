const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendar');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }
    next();
};

/**
 * GET /auth/google
 * Initiate Google OAuth2 flow
 */
router.get('/auth/google', requireLogin, (req, res) => {
    try {
        const authUrl = googleCalendarService.getAuthUrl();
        
        // Store state parameter to verify callback
        req.session.googleOAuthState = Math.random().toString(36).substring(7);
        
        // Add state to auth URL
        const stateParam = `&state=${req.session.googleOAuthState}`;
        const finalAuthUrl = authUrl + stateParam;
        
        res.redirect(finalAuthUrl);
    } catch (error) {
        console.error('Error initiating Google auth:', error);
        res.redirect('/dashboard/settings?error=auth_init_failed');
    }
});

/**
 * GET /auth/google/callback
 * Handle Google OAuth2 callback
 */
router.get('/auth/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        console.log('Google OAuth callback received:', { 
            hasCode: !!code, 
            hasState: !!state, 
            hasSession: !!req.session,
            userId: req.session?.userId 
        });
        
        // Check if user is logged in
        if (!req.session || !req.session.userId) {
            console.error('No session or userId found in OAuth callback');
            return res.redirect('/auth/login?error=session_expired&redirect=/dashboard/settings');
        }
        
        // Verify state parameter
        if (!state || state !== req.session.googleOAuthState) {
            console.error('Invalid authentication state:', { 
                received: state, 
                expected: req.session.googleOAuthState 
            });
            return res.redirect('/dashboard/settings?error=invalid_state');
        }
        
        // Clear the state from session
        delete req.session.googleOAuthState;
        
        if (!code) {
            console.error('Authorization was denied or failed');
            return res.redirect('/dashboard/settings?error=auth_denied');
        }
        
        // Exchange code for tokens
        const tokens = await googleCalendarService.getTokens(code);
        
        // Save tokens for user
        await googleCalendarService.setUserTokens(req.session.userId, tokens);
        
        console.log('Google Calendar connected successfully for user:', req.session.userId);
        res.redirect('/dashboard/settings?success=google_connected');
        
    } catch (error) {
        console.error('Error in Google callback:', error);
        res.redirect('/dashboard/settings?error=connection_failed');
    }
});

/**
 * POST /dashboard/google-calendar/connect
 * API endpoint to initiate Google Calendar connection
 */
router.post('/dashboard/google-calendar/connect', requireLogin, (req, res) => {
    try {
        const authUrl = googleCalendarService.getAuthUrl();
        
        // Store state parameter
        req.session.googleOAuthState = Math.random().toString(36).substring(7);
        
        res.json({
            success: true,
            authUrl: authUrl + `&state=${req.session.googleOAuthState}`
        });
    } catch (error) {
        console.error('Error getting auth URL:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate Google Calendar connection'
        });
    }
});

/**
 * POST /dashboard/google-calendar/disconnect
 * Disconnect Google Calendar
 */
router.post('/dashboard/google-calendar/disconnect', requireLogin, async (req, res) => {
    try {
        await googleCalendarService.disconnectUser(req.session.userId);
        
        res.json({
            success: true,
            message: 'Google Calendar disconnected successfully'
        });
    } catch (error) {
        console.error('Error disconnecting Google Calendar:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect Google Calendar'
        });
    }
});

/**
 * GET /dashboard/google-calendar/status
 * Get Google Calendar connection status
 */
router.get('/dashboard/google-calendar/status', requireLogin, async (req, res) => {
    try {
        const tokens = await googleCalendarService.getUserTokens(req.session.userId);
        
        res.json({
            connected: !!tokens && tokens.google_calendar_enabled,
            hasValidToken: !!tokens && !!tokens.google_access_token
        });
    } catch (error) {
        console.error('Error getting Google Calendar status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Google Calendar status'
        });
    }
});

/**
 * GET /dashboard/google-calendar/events
 * Get upcoming calendar events (for testing/sync purposes)
 */
router.get('/dashboard/google-calendar/events', requireLogin, async (req, res) => {
    try {
        const { start, end } = req.query;
        
        if (!start || !end) {
            return res.status(400).json({
                success: false,
                error: 'Start and end time parameters are required'
            });
        }
        
        const events = await googleCalendarService.getCalendarEvents(
            req.session.userId,
            start,
            end
        );
        
        res.json({
            success: true,
            events: events.map(event => ({
                id: event.id,
                title: event.summary,
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                description: event.description
            }))
        });
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch calendar events'
        });
    }
});

/**
 * POST /dashboard/google-calendar/check-availability
 * Check if a time slot is available in Google Calendar
 */
router.post('/dashboard/google-calendar/check-availability', requireLogin, async (req, res) => {
    try {
        const { startTime, endTime } = req.body;
        
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Start and end time are required'
            });
        }
        
        const isAvailable = await googleCalendarService.isTimeSlotAvailable(
            req.session.userId,
            startTime,
            endTime
        );
        
        res.json({
            success: true,
            available: isAvailable
        });
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check calendar availability'
        });
    }
});

/**
 * POST /booking/:username/check-conflicts
 * Public endpoint to check Google Calendar conflicts for a booking
 */
router.post('/booking/:username/check-conflicts', async (req, res) => {
    try {
        const { startTime, endTime } = req.body;
        const username = req.params.username;
        
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Start and end time are required'
            });
        }
        
        // Get user ID from username
        const db = require('../db');
        const userResult = await db.query(
            'SELECT id, google_sync_enabled FROM users WHERE username = $1',
            [username]
        );
        
        if (!userResult.rows[0]) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userId = userResult.rows[0].id;
        const googleSyncEnabled = userResult.rows[0].google_sync_enabled;
        
        // If Google Calendar sync is not enabled, return no conflicts
        if (!googleSyncEnabled) {
            return res.json({
                success: true,
                hasConflicts: false,
                conflicts: [],
                googleSyncEnabled: false
            });
        }
        
        // Check for conflicts
        const conflictInfo = await googleCalendarService.getTimeSlotConflicts(
            userId,
            startTime,
            endTime
        );
        
        res.json({
            success: true,
            ...conflictInfo,
            googleSyncEnabled: true
        });
    } catch (error) {
        console.error('Error checking booking conflicts:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check calendar conflicts'
        });
    }
});

    /**
     * GET /dashboard/google-calendar/list
     * API endpoint to fetch available Google Calendars (only "My Calendars")
     */
    router.get('/dashboard/google-calendar/list', requireLogin, async (req, res) => {
        try {
            const tokens = await googleCalendarService.getUserTokens(req.session.userId);
            if (!tokens || !tokens.google_access_token) {
                return res.status(400).json({ success: false, error: 'Google Calendar not connected' });
            }

            // Use the optimized calendar list method with caching
            const calendarList = await googleCalendarService.getCalendarList(req.session.userId);
            
            // Filter to only show "My Calendars" (owner calendars)
            const myCalendars = calendarList.filter(cal => 
                cal.accessRole === 'owner'
            ).map(cal => ({
                id: cal.id,
                summary: cal.summary,
                primary: cal.primary || false
            }));

            res.json({ success: true, calendars: myCalendars });
        } catch (error) {
            console.error('Error fetching Google Calendar list:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

/**
 * POST /dashboard/google-calendar/select
 * API endpoint to update selected Google Calendar
 */
router.post('/dashboard/google-calendar/select', requireLogin, async (req, res) => {
    try {
        const { calendarId } = req.body;
        if (!calendarId) {
            return res.status(400).json({ success: false, error: 'Calendar ID is required' });
        }

        const db = require('../db');
        await db.query(
            'UPDATE users SET google_calendar_id = $1 WHERE id = $2',
            [calendarId, req.session.userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating Google Calendar selection:', error);
        res.status(500).json({ success: false, error: 'Failed to update calendar selection' });
    }
});

/**
 * GET /dashboard/google-calendar/selected
 * API endpoint to get currently selected Google Calendar
 */
router.get('/dashboard/google-calendar/selected', requireLogin, async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(
            'SELECT google_calendar_id FROM users WHERE id = $1',
            [req.session.userId]
        );
        
        const selectedCalendarId = result.rows[0]?.google_calendar_id || 'primary';
        res.json({ success: true, calendarId: selectedCalendarId });
    } catch (error) {
        console.error('Error fetching selected Google Calendar:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch selected calendar' });
    }
});

/**
 * GET /dashboard/google-calendar/blocking-setting
 * API endpoint to get Google Calendar blocking setting
 */
router.get('/dashboard/google-calendar/blocking-setting', requireLogin, async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(
            'SELECT google_calendar_blocking_enabled FROM users WHERE id = $1',
            [req.session.userId]
        );
        
        const blockingEnabled = result.rows[0]?.google_calendar_blocking_enabled ?? true;
        res.json({ success: true, blockingEnabled });
    } catch (error) {
        console.error('Error fetching Google Calendar blocking setting:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch blocking setting' });
    }
});

/**
 * POST /dashboard/google-calendar/update-blocking
 * API endpoint to update Google Calendar blocking setting
 */
router.post('/dashboard/google-calendar/update-blocking', requireLogin, async (req, res) => {
    try {
        const { blockingEnabled } = req.body;
        if (typeof blockingEnabled !== 'boolean') {
            return res.status(400).json({ success: false, error: 'Blocking enabled value is required' });
        }

        const db = require('../db');
        await db.query(
            'UPDATE users SET google_calendar_blocking_enabled = $1 WHERE id = $2',
            [blockingEnabled, req.session.userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating Google Calendar blocking setting:', error);
        res.status(500).json({ success: false, error: 'Failed to update blocking setting' });
    }
});

module.exports = router;
