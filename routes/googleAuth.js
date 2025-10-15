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
        req.flash('error', 'Failed to initiate Google Calendar connection');
        res.redirect('/dashboard/settings');
    }
});

/**
 * GET /auth/google/callback
 * Handle Google OAuth2 callback
 */
router.get('/auth/google/callback', requireLogin, async (req, res) => {
    try {
        const { code, state } = req.query;
        
        // Verify state parameter
        if (!state || state !== req.session.googleOAuthState) {
            req.flash('error', 'Invalid authentication state');
            return res.redirect('/dashboard/settings');
        }
        
        // Clear the state from session
        delete req.session.googleOAuthState;
        
        if (!code) {
            req.flash('error', 'Authorization was denied or failed');
            return res.redirect('/dashboard/settings');
        }
        
        // Exchange code for tokens
        const tokens = await googleCalendarService.getTokens(code);
        
        // Save tokens for user
        await googleCalendarService.setUserTokens(req.session.userId, tokens);
        
        req.flash('success', 'Google Calendar connected successfully!');
        res.redirect('/dashboard/settings');
        
    } catch (error) {
        console.error('Error in Google callback:', error);
        req.flash('error', 'Failed to connect Google Calendar');
        res.redirect('/dashboard/settings');
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

module.exports = router;
