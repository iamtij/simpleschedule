const { google } = require('googleapis');
const db = require('../db');

class GoogleCalendarService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/google/callback`
        );
        
        // Scopes for calendar access
        this.scopes = [
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events'
        ];
    }

    /**
     * Get the Google OAuth2 authorization URL
     */
    getAuthUrl() {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
            prompt: 'consent' // Force consent screen to get refresh token
        });
    }

    /**
     * Exchange authorization code for tokens
     */
    async getTokens(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            return tokens;
        } catch (error) {
            console.error('Error getting Google tokens:', error);
            throw new Error('Failed to authenticate with Google');
        }
    }

    /**
     * Set user's Google Calendar tokens in database
     */
    async setUserTokens(userId, tokens) {
        try {
            const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
            
            await db.query(
                `UPDATE users 
                 SET google_access_token = $1, 
                     google_refresh_token = $2, 
                     google_token_expires_at = $3,
                     google_calendar_enabled = TRUE
                 WHERE id = $4`,
                [tokens.access_token, tokens.refresh_token, expiresAt, userId]
            );
            
            return true;
        } catch (error) {
            console.error('Error setting user tokens:', error);
            throw new Error('Failed to save Google Calendar connection');
        }
    }

    /**
     * Get user's Google Calendar tokens from database
     */
    async getUserTokens(userId) {
        try {
            const result = await db.query(
                `SELECT google_access_token, google_refresh_token, google_token_expires_at, google_calendar_enabled
                 FROM users WHERE id = $1`,
                [userId]
            );
            
            if (result.rows.length === 0 || !result.rows[0].google_calendar_enabled) {
                return null;
            }
            
            return result.rows[0];
        } catch (error) {
            console.error('Error getting user tokens:', error);
            return null;
        }
    }

    /**
     * Refresh user's access token if needed
     */
    async refreshUserToken(userId) {
        try {
            const userTokens = await this.getUserTokens(userId);
            if (!userTokens || !userTokens.google_refresh_token) {
                return false;
            }

            // Check if token needs refresh
            const now = new Date();
            const expiresAt = userTokens.google_token_expires_at;
            
            if (expiresAt && now < new Date(expiresAt.getTime() - 5 * 60 * 1000)) {
                // Token is still valid (with 5 minute buffer)
                return true;
            }

            // Refresh the token
            this.oauth2Client.setCredentials({
                refresh_token: userTokens.google_refresh_token
            });

            const { credentials } = await this.oauth2Client.refreshAccessToken();
            
            // Update tokens in database
            await this.setUserTokens(userId, credentials);
            
            return true;
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }

    /**
     * Get authenticated Google Calendar service
     */
    async getCalendarService(userId) {
        try {
            const refreshed = await this.refreshUserToken(userId);
            if (!refreshed) {
                throw new Error('Failed to refresh Google Calendar token');
            }

            const userTokens = await this.getUserTokens(userId);
            if (!userTokens) {
                throw new Error('No Google Calendar connection found');
            }

            this.oauth2Client.setCredentials({
                access_token: userTokens.google_access_token,
                refresh_token: userTokens.google_refresh_token
            });

            return google.calendar({ version: 'v3', auth: this.oauth2Client });
        } catch (error) {
            console.error('Error getting calendar service:', error);
            throw new Error('Failed to connect to Google Calendar');
        }
    }

    /**
     * Get user's calendar events for a specific time range
     */
    async getCalendarEvents(userId, timeMin, timeMax, calendarId = 'primary') {
        try {
            const calendar = await this.getCalendarService(userId);
            
            const response = await calendar.events.list({
                calendarId: calendarId,
                timeMin: timeMin,
                timeMax: timeMax,
                maxResults: 250,
                singleEvents: true,
                orderBy: 'startTime'
            });

            return response.data.items || [];
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            throw new Error('Failed to fetch calendar events');
        }
    }

    /**
     * Check if a specific time slot is available (no conflicting events)
     */
    async isTimeSlotAvailable(userId, startTime, endTime, calendarId = 'primary') {
        try {
            const events = await this.getCalendarEvents(userId, startTime, endTime, calendarId);
            
            // Filter out events that don't conflict with the requested time slot
            const conflictingEvents = events.filter(event => {
                const eventStart = new Date(event.start.dateTime || event.start.date);
                const eventEnd = new Date(event.end.dateTime || event.end.date);
                
                // Check for overlap
                return (eventStart < new Date(endTime) && eventEnd > new Date(startTime));
            });
            
            return conflictingEvents.length === 0;
        } catch (error) {
            console.error('Error checking time slot availability:', error);
            // If we can't check, assume it's available to not block legitimate bookings
            return true;
        }
    }

    /**
     * Create an event in user's Google Calendar
     */
    async createCalendarEvent(userId, eventDetails, calendarId = 'primary') {
        try {
            const calendar = await this.getCalendarService(userId);
            
            const event = {
                summary: eventDetails.title,
                description: eventDetails.description || '',
                start: {
                    dateTime: eventDetails.startTime,
                    timeZone: eventDetails.timeZone || 'UTC'
                },
                end: {
                    dateTime: eventDetails.endTime,
                    timeZone: eventDetails.timeZone || 'UTC'
                },
                attendees: eventDetails.attendees || [],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 10 }
                    ]
                }
            };

            const response = await calendar.events.insert({
                calendarId: calendarId,
                resource: event
            });

            return response.data;
        } catch (error) {
            console.error('Error creating calendar event:', error);
            throw new Error('Failed to create calendar event');
        }
    }

    /**
     * Disconnect user's Google Calendar
     */
    async disconnectUser(userId) {
        try {
            await db.query(
                `UPDATE users 
                 SET google_calendar_enabled = FALSE,
                     google_access_token = NULL,
                     google_refresh_token = NULL,
                     google_token_expires_at = NULL
                 WHERE id = $1`,
                [userId]
            );
            
            return true;
        } catch (error) {
            console.error('Error disconnecting user:', error);
            throw new Error('Failed to disconnect Google Calendar');
        }
    }
}

module.exports = new GoogleCalendarService();
