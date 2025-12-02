const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendar');
const googleSheetsService = require('../services/googleSheets');

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
router.get('/auth/google', requireLogin, async (req, res) => {
    try {
        // Force consent to ensure all scopes (including Sheets) are requested
        const authUrl = googleCalendarService.getAuthUrl(true);
        
        // Generate a unique state token
        const stateToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        
        // Store state in database instead of session
        const db = require('../db');
        await db.query(
            'INSERT INTO oauth_states (state_token, user_id, provider) VALUES ($1, $2, $3)',
            [stateToken, req.session.userId, 'google']
        );
        
        
        // Add state to auth URL
        const stateParam = `&state=${stateToken}`;
        const finalAuthUrl = authUrl + stateParam;
        
        res.redirect(finalAuthUrl);
    } catch (error) {
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
        const db = require('../db');
        
        if (!code) {
            return res.redirect('/dashboard/settings?error=auth_denied');
        }
        
        if (!state) {
            return res.redirect('/dashboard/settings?error=invalid_state');
        }
        
        // Verify state token from database
        const stateResult = await db.query(
            'SELECT user_id, expires_at, used FROM oauth_states WHERE state_token = $1 AND provider = $2',
            [state, 'google']
        );
        
        if (stateResult.rows.length === 0) {
            return res.redirect('/dashboard/settings?error=invalid_state');
        }
        
        const stateData = stateResult.rows[0];
        
        // Check if state is expired
        if (new Date() > new Date(stateData.expires_at)) {
            return res.redirect('/dashboard/settings?error=state_expired');
        }
        
        // Check if state was already used
        if (stateData.used) {
            return res.redirect('/dashboard/settings?error=state_used');
        }
        
        const userId = stateData.user_id;
        
        // Mark state as used
        await db.query(
            'UPDATE oauth_states SET used = TRUE WHERE state_token = $1',
            [state]
        );
        
        
        // Exchange code for tokens
        const tokens = await googleCalendarService.getTokens(code);
        
        // Save tokens for user
        await googleCalendarService.setUserTokens(userId, tokens);
        
        res.redirect('/dashboard/settings?success=google_connected');
        
    } catch (error) {
        res.redirect('/dashboard/settings?error=connection_failed');
    }
});

/**
 * POST /dashboard/google-calendar/connect
 * API endpoint to initiate Google Calendar connection
 */
router.post('/dashboard/google-calendar/connect', requireLogin, async (req, res) => {
    try {
        // Force consent to ensure all scopes (including Sheets) are requested
        const authUrl = googleCalendarService.getAuthUrl(true);
        
        // Generate a unique state token
        const stateToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        
        // Store state in database instead of session
        const db = require('../db');
        await db.query(
            'INSERT INTO oauth_states (state_token, user_id, provider) VALUES ($1, $2, $3)',
            [stateToken, req.session.userId, 'google']
        );
        
        res.json({
            success: true,
            authUrl: authUrl + `&state=${stateToken}`
        });
    } catch (error) {
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
            'SELECT id, google_calendar_enabled FROM users WHERE username = $1',
            [username]
        );
        
        if (!userResult.rows[0]) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userId = userResult.rows[0].id;
        const googleSyncEnabled = userResult.rows[0].google_calendar_enabled;
        
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
            
            // Filter to show calendars where user has write access (owner, writer, or freeBusyReader)
            const availableCalendars = calendarList.filter(cal => 
                cal.accessRole === 'owner' || 
                cal.accessRole === 'writer' || 
                cal.accessRole === 'freeBusyReader'
            ).map(cal => ({
                id: cal.id,
                summary: cal.summary,
                primary: cal.primary || false,
                accessRole: cal.accessRole
            }));

            res.json({ success: true, calendars: availableCalendars });
        } catch (error) {
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
        res.status(500).json({ success: false, error: 'Failed to update blocking setting' });
    }
});

/**
 * POST /dashboard/google-sheets/create
 * Create/initialize Google Sheet for CRM export
 */
router.post('/dashboard/google-sheets/create', requireLogin, async (req, res) => {
    try {
        // Verify Google connection exists
        const tokens = await googleCalendarService.getUserTokens(req.session.userId);
        if (!tokens || !tokens.google_access_token) {
            return res.status(400).json({
                success: false,
                error: 'Google account not connected. Please connect your Google account first.'
            });
        }

        const result = await googleSheetsService.createSheetForUser(req.session.userId);
        
        res.json({
            success: true,
            spreadsheetId: result.spreadsheetId,
            spreadsheetUrl: result.spreadsheetUrl,
            message: 'Google Sheet created successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create Google Sheet'
        });
    }
});

/**
 * POST /dashboard/google-sheets/export
 * Export all CRM data to Google Sheets
 */
router.post('/dashboard/google-sheets/export', requireLogin, async (req, res) => {
    try {
        // Verify Google connection exists
        const tokens = await googleCalendarService.getUserTokens(req.session.userId);
        if (!tokens || !tokens.google_access_token) {
            return res.status(400).json({
                success: false,
                error: 'Google account not connected. Please connect your Google account first.'
            });
        }

        const result = await googleSheetsService.exportAll(req.session.userId);
        
        res.json({
            success: true,
            contactsExported: result.contacts,
            interactionsExported: result.interactions,
            spreadsheetUrl: result.spreadsheetUrl,
            message: `Exported ${result.contacts} contacts and ${result.interactions} interactions to Google Sheets`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to export CRM data to Google Sheets'
        });
    }
});

/**
 * GET /dashboard/google-sheets/status
 * Get Google Sheets integration status
 */
router.get('/dashboard/google-sheets/status', requireLogin, async (req, res) => {
    try {
        const status = await googleSheetsService.getStatus(req.session.userId);
        
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get Google Sheets status',
            details: error.message
        });
    }
});

/**
 * POST /dashboard/google-sheets/disconnect
 * Disconnect Google Sheets integration
 */
router.post('/dashboard/google-sheets/disconnect', requireLogin, async (req, res) => {
    try {
        await googleSheetsService.disconnect(req.session.userId);
        
        res.json({
            success: true,
            message: 'Google Sheets integration disconnected successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to disconnect Google Sheets integration'
        });
    }
});

/**
 * GET /dashboard/google-sheets/test
 * Test Google Sheets API access (for debugging)
 */
router.get('/dashboard/google-sheets/test', requireLogin, async (req, res) => {
    try {
        const tokens = await googleCalendarService.getUserTokens(req.session.userId);
        
        if (!tokens || !tokens.google_access_token) {
            return res.json({
                success: false,
                error: 'No Google connection found',
                hasTokens: false
            });
        }

        // Try to access Sheets API
        try {
            const sheets = await googleSheetsService.getSheetsService(req.session.userId);
            
            // Try a test API call
            try {
                await sheets.spreadsheets.get({
                    spreadsheetId: 'test_12345'
                });
            } catch (apiError) {
                return res.json({
                    success: true,
                    hasTokens: true,
                    sheetsServiceCreated: true,
                    apiTest: {
                        code: apiError.code,
                        message: apiError.message,
                        errors: apiError.errors,
                        is404: apiError.code === 404,
                        is403: apiError.code === 403,
                        isScopeError: (apiError.message || '').includes('insufficient') || 
                                    (apiError.message || '').includes('scope'),
                        isApiNotEnabled: (apiError.message || '').includes('API has not been used') ||
                                       (apiError.message || '').includes('API not enabled') ||
                                       (apiError.errors?.[0]?.message || '').includes('API has not been used')
                    },
                    interpretation: apiError.code === 404 
                        ? 'Sheets API is accessible (404 = sheet not found, but API works)'
                        : apiError.code === 403 && ((apiError.message || '').includes('insufficient') || (apiError.message || '').includes('scope'))
                        ? 'Sheets scope not granted - need to reconnect'
                        : apiError.code === 403 && ((apiError.message || '').includes('API has not been used') || (apiError.message || '').includes('API not enabled'))
                        ? 'Sheets API not enabled in Google Cloud Console'
                        : 'Unknown error - check details'
                });
            }
            
            return res.json({
                success: true,
                hasTokens: true,
                sheetsServiceCreated: true,
                apiTest: 'Unexpected success'
            });
        } catch (serviceError) {
            return res.json({
                success: false,
                hasTokens: true,
                sheetsServiceCreated: false,
                error: serviceError.message,
                stack: serviceError.stack
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to test Google Sheets',
            stack: error.stack
        });
    }
});

module.exports = router;
