const { google } = require('googleapis');
const db = require('../db');
const timezone = require('../utils/timezone');

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
        
        // Add caching for calendar list and events
        this.calendarListCache = new Map();
        this.eventsCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get calendar list with caching
     */
    async getCalendarList(userId) {
        const cacheKey = `calendarList_${userId}`;
        const cached = this.calendarListCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const calendar = await this.getCalendarService(userId);
            const calendarList = await calendar.calendarList.list();
            
            const data = calendarList.data.items || [];
            this.calendarListCache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            console.error('Error fetching calendar list:', error);
            throw error;
        }
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
     * Get user's calendar events for a specific time range with caching
     */
    async getCalendarEvents(userId, timeMin, timeMax, calendarId = 'primary') {
        const cacheKey = `events_${userId}_${calendarId}_${timeMin}_${timeMax}`;
        const cached = this.eventsCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const calendar = await this.getCalendarService(userId);
            
            // Ensure timezone is included in the time strings
            const formatTimeWithTimezone = (timeStr) => {
                return timezone.formatTimeWithTimezone(timeStr);
            };
            
            const response = await calendar.events.list({
                calendarId: calendarId,
                timeMin: formatTimeWithTimezone(timeMin),
                timeMax: formatTimeWithTimezone(timeMax),
                maxResults: 250,
                singleEvents: true,
                orderBy: 'startTime'
            });

            const data = response.data.items || [];
            this.eventsCache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            
            // If there's an error with the selected calendar, try with primary calendar
            if (calendarId !== 'primary') {
                try {
                    const calendar = await this.getCalendarService(userId);
                    
                    // Ensure timezone is included in the time strings
                    const formatTimeWithTimezone = (timeStr) => {
                        return timezone.formatTimeWithTimezone(timeStr);
                    };
                    
                    const response = await calendar.events.list({
                        calendarId: 'primary',
                        timeMin: formatTimeWithTimezone(timeMin),
                        timeMax: formatTimeWithTimezone(timeMax),
                        maxResults: 250,
                        singleEvents: true,
                        orderBy: 'startTime'
                    });
                    
                    const data = response.data.items || [];
                    this.eventsCache.set(cacheKey, {
                        data: data,
                        timestamp: Date.now()
                    });
                    
                    return data;
                } catch (retryError) {
                    console.error('Error fetching calendar events from primary calendar:', retryError);
                    throw new Error('Failed to fetch calendar events from both selected and primary calendars');
                }
            }
            
            throw new Error('Failed to fetch calendar events');
        }
    }

    /**
     * Check if a specific time slot is available (no conflicting events)
     */
    async isTimeSlotAvailable(userId, startTime, endTime, calendarId = null) {
        try {
            // If no calendarId provided, get user's selected calendar
            if (!calendarId) {
                const result = await db.query(
                    'SELECT google_calendar_id FROM users WHERE id = $1',
                    [userId]
                );
                calendarId = result.rows[0]?.google_calendar_id || 'primary';
            }

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
     * Get detailed conflict information for a time slot
     * Optimized to check calendars in parallel instead of sequential
     */
    async getTimeSlotConflicts(userId, startTime, endTime, calendarId = null) {
        try {
            const calendar = await this.getCalendarService(userId);
            
            // Get all calendars where user is owner (with caching)
            const calendarList = await this.getCalendarList(userId);
            const ownedCalendars = calendarList.filter(cal => 
                cal.accessRole === 'owner'
            );
            
            
            // Batch check calendars in parallel instead of sequential
            const conflictPromises = ownedCalendars.map(async (cal) => {
                try {
                    
                    const events = await this.getCalendarEvents(userId, startTime, endTime, cal.id);
                    
                    // Find events that conflict with the requested time slot
                    const conflictingEvents = events.filter(event => {
                        // Skip all-day events as they shouldn't block specific time slots
                        if (event.start.date && !event.start.dateTime) {
                            return false;
                        }
                        
                        // Only check events with specific times
                        if (!event.start.dateTime || !event.end.dateTime) {
                            return false;
                        }
                        
                        const eventStart = new Date(event.start.dateTime);
                        const eventEnd = new Date(event.end.dateTime);
                        
                        // Check for overlap
                        return (eventStart < new Date(endTime) && eventEnd > new Date(startTime));
                    }).map(event => ({
                        id: event.id,
                        title: event.summary || 'Untitled Event',
                        start: event.start.dateTime || event.start.date,
                        end: event.end.dateTime || event.end.date,
                        description: event.description || '',
                        calendar: cal.summary,
                        calendarId: cal.id
                    }));
                    
                    
                    return conflictingEvents;
                    
                } catch (calError) {
                    // Continue checking other calendars even if one fails
                    return [];
                }
            });
            
            // Wait for all calendar checks to complete
            const conflictResults = await Promise.all(conflictPromises);
            
            // Flatten the results
            const allConflictingEvents = conflictResults.flat();
            
            return {
                hasConflicts: allConflictingEvents.length > 0,
                conflicts: allConflictingEvents,
                calendarsChecked: ownedCalendars.length,
                calendarId: calendarId
            };
        } catch (error) {
            console.error('Error getting time slot conflicts:', error);
            // If we can't check, return no conflicts to not block legitimate bookings
            return {
                hasConflicts: false,
                conflicts: [],
                calendarsChecked: 0,
                calendarId: calendarId,
                error: error.message
            };
        }
    }

    /**
     * Create an event in user's Google Calendar
     */
    async createCalendarEvent(userId, eventDetails, calendarId = null) {
        try {
            const calendar = await this.getCalendarService(userId);
            
            // If no calendarId provided, get user's selected calendar
            if (!calendarId) {
                const result = await db.query(
                    'SELECT google_calendar_id FROM users WHERE id = $1',
                    [userId]
                );
                calendarId = result.rows[0]?.google_calendar_id || 'primary';
            }
            
            // Get owner's name from database for the event title
            const ownerResult = await db.query(
                'SELECT full_name, display_name FROM users WHERE id = $1',
                [userId]
            );
            const ownerName = ownerResult.rows[0]?.display_name || ownerResult.rows[0]?.full_name || 'Meeting';
            
            // Create event title based on perspective
            // For the owner: show client's name
            // For the client: show owner's name
            const eventTitle = eventDetails.title || ownerName;
            
            const event = {
                summary: eventTitle,
                description: eventDetails.description || '',
                start: {
                    dateTime: eventDetails.startTime,
                    timeZone: eventDetails.timeZone || timezone.getDefaultTimezone()
                },
                end: {
                    dateTime: eventDetails.endTime,
                    timeZone: eventDetails.timeZone || timezone.getDefaultTimezone()
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
     * Clear cache for a specific user (useful when calendar changes)
     */
    clearUserCache(userId) {
        const keysToDelete = [];
        for (const key of this.calendarListCache.keys()) {
            if (key.startsWith(`calendarList_${userId}`) || key.startsWith(`events_${userId}`)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => {
            this.calendarListCache.delete(key);
            this.eventsCache.delete(key);
        });
        
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
