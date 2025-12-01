const { google } = require('googleapis');
const db = require('../db');
const googleCalendarService = require('./googleCalendar');

class GoogleSheetsService {
    constructor() {
        // Reuse the OAuth2Client from GoogleCalendarService
        // It already has the spreadsheets scope added
    }

    /**
     * Get authenticated Google Sheets service
     */
    async getSheetsService(userId) {
        try {
            // Refresh token if needed
            const refreshed = await googleCalendarService.refreshUserToken(userId);
            if (!refreshed) {
                throw new Error('Failed to refresh Google token');
            }

            const userTokens = await googleCalendarService.getUserTokens(userId);
            if (!userTokens || !userTokens.google_access_token) {
                throw new Error('No Google connection found. Please connect your Google account first.');
            }

            // Create a new OAuth2Client instance (reusing the same credentials as calendar)
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/google/callback`
            );
            
            oauth2Client.setCredentials({
                access_token: userTokens.google_access_token,
                refresh_token: userTokens.google_refresh_token
            });

            return google.sheets({ version: 'v4', auth: oauth2Client });
        } catch (error) {
            console.error('Error getting sheets service:', error);
            throw new Error('Failed to connect to Google Sheets');
        }
    }

    /**
     * Create a new Google Sheet for a user with Contacts and Interactions tabs
     */
    async createSheetForUser(userId) {
        try {
            const sheets = await this.getSheetsService(userId);
            const userResult = await db.query(
                'SELECT username, display_name, full_name FROM users WHERE id = $1',
                [userId]
            );
            const user = userResult.rows[0];
            const userName = user?.display_name || user?.full_name || user?.username || 'User';

            // Create a new spreadsheet
            const spreadsheet = await sheets.spreadsheets.create({
                resource: {
                    properties: {
                        title: `${userName}'s CRM Data - SimpleSchedule`
                    },
                    sheets: [
                        {
                            properties: {
                                title: 'Contacts',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 18
                                }
                            }
                        },
                        {
                            properties: {
                                title: 'Interactions',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 13
                                }
                            }
                        }
                    ]
                }
            });

            const spreadsheetId = spreadsheet.data.spreadsheetId;
            
            // Get sheet IDs from the response
            const sheetProperties = spreadsheet.data.sheets || [];
            let contactsSheetId = 0; // Default fallback
            let interactionsSheetId = 1; // Default fallback
            
            sheetProperties.forEach((sheet, index) => {
                if (sheet.properties.title === 'Contacts') {
                    contactsSheetId = sheet.properties.sheetId;
                } else if (sheet.properties.title === 'Interactions') {
                    interactionsSheetId = sheet.properties.sheetId;
                }
            });

            // Set up headers for Contacts tab
            await this.setupContactsHeaders(sheets, spreadsheetId, contactsSheetId);

            // Set up headers for Interactions tab
            await this.setupInteractionsHeaders(sheets, spreadsheetId, interactionsSheetId);

            // Store the sheet ID in the database
            await db.query(
                'UPDATE users SET google_sheet_id = $1, google_sheets_enabled = TRUE WHERE id = $2',
                [spreadsheetId, userId]
            );

            return {
                spreadsheetId,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
            };
        } catch (error) {
            console.error('Error creating Google Sheet:', error);
            throw new Error('Failed to create Google Sheet');
        }
    }

    /**
     * Get or create a Google Sheet for a user
     */
    async getOrCreateSheet(userId) {
        try {
            // Check if user already has a sheet ID
            const result = await db.query(
                'SELECT google_sheet_id FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows[0]?.google_sheet_id) {
                // Verify the sheet still exists and user has access
                try {
                    const sheets = await this.getSheetsService(userId);
                    await sheets.spreadsheets.get({
                        spreadsheetId: result.rows[0].google_sheet_id
                    });
                    return {
                        spreadsheetId: result.rows[0].google_sheet_id,
                        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${result.rows[0].google_sheet_id}`
                    };
                } catch (error) {
                    // Sheet doesn't exist or user lost access, create a new one
                    console.log('Existing sheet not accessible, creating new one');
                    return await this.createSheetForUser(userId);
                }
            }

            // No sheet exists, create a new one
            return await this.createSheetForUser(userId);
        } catch (error) {
            console.error('Error getting or creating sheet:', error);
            throw error;
        }
    }

    /**
     * Set up headers for Contacts tab
     */
    async setupContactsHeaders(sheets, spreadsheetId, sheetId = 0) {
        const headers = [
            'ID', 'Name', 'Email', 'Phone', 'Company', 'Position', 'Industry',
            'Source', 'Status', 'Referral Potential', 'Notes', 'Tags',
            'Last Contact Date', 'Next Follow Up', 'BNI Member', 'BNI Chapter',
            'Created At', 'Updated At'
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Contacts!A1:R1',
            valueInputOption: 'RAW',
            resource: {
                values: [headers]
            }
        });

        // Make headers bold
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [
                    {
                        repeatCell: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: headers.length
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: {
                                        bold: true
                                    },
                                    backgroundColor: {
                                        red: 0.9,
                                        green: 0.9,
                                        blue: 0.9
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(textFormat,backgroundColor)'
                        }
                    }
                ]
            }
        });
    }

    /**
     * Set up headers for Interactions tab
     */
    async setupInteractionsHeaders(sheets, spreadsheetId, sheetId = 1) {
        const headers = [
            'ID', 'Contact ID', 'Contact Name', 'Type', 'Subject', 'Notes',
            'Outcome', 'Referral Value', 'Date', 'Booking ID',
            'Follow Up Date', 'Follow Up Time', 'Status'
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Interactions!A1:M1',
            valueInputOption: 'RAW',
            resource: {
                values: [headers]
            }
        });

        // Make headers bold
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [
                    {
                        repeatCell: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: headers.length
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: {
                                        bold: true
                                    },
                                    backgroundColor: {
                                        red: 0.9,
                                        green: 0.9,
                                        blue: 0.9
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(textFormat,backgroundColor)'
                        }
                    }
                ]
            }
        });
    }

    /**
     * Format a date value for Google Sheets
     */
    formatDate(dateValue) {
        if (!dateValue) return '';
        if (typeof dateValue === 'string') {
            // If it's already a date string, return as-is
            if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateValue;
            }
            // Try to parse and format
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
            return dateValue;
        }
        if (dateValue instanceof Date) {
            return dateValue.toISOString().split('T')[0];
        }
        return '';
    }

    /**
     * Format a timestamp for Google Sheets
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        if (typeof timestamp === 'string') {
            return timestamp;
        }
        if (timestamp instanceof Date) {
            return timestamp.toISOString();
        }
        return '';
    }

    /**
     * Export all contacts to Google Sheets
     */
    async exportContacts(userId) {
        try {
            const sheetInfo = await this.getOrCreateSheet(userId);
            const sheets = await this.getSheetsService(userId);

            // Get all contacts for the user
            const contactsResult = await db.query(
                `SELECT 
                    id, name, email, phone, company, position, industry,
                    source, status, referral_potential, notes, tags,
                    last_contact_date, next_follow_up, created_at, updated_at,
                    bni_member, bni_chapter
                FROM contacts 
                WHERE user_id = $1
                ORDER BY name ASC`,
                [userId]
            );

            // Convert contacts to rows
            const rows = contactsResult.rows.map(contact => [
                contact.id,
                contact.name || '',
                contact.email || '',
                contact.phone || '',
                contact.company || '',
                contact.position || '',
                contact.industry || '',
                contact.source || '',
                contact.status || '',
                contact.referral_potential || '',
                contact.notes || '',
                Array.isArray(contact.tags) ? contact.tags.join(', ') : (contact.tags || ''),
                this.formatDate(contact.last_contact_date),
                this.formatDate(contact.next_follow_up),
                contact.bni_member ? 'Yes' : 'No',
                contact.bni_chapter || '',
                this.formatTimestamp(contact.created_at),
                this.formatTimestamp(contact.updated_at)
            ]);

            // Clear existing data (except headers)
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetInfo.spreadsheetId,
                range: 'Contacts!A2:R'
            });

            // Write data starting from row 2 (row 1 is headers)
            if (rows.length > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: sheetInfo.spreadsheetId,
                    range: 'Contacts!A2:R',
                    valueInputOption: 'RAW',
                    resource: {
                        values: rows
                    }
                });
            }

            return {
                success: true,
                rowsExported: rows.length,
                spreadsheetUrl: sheetInfo.spreadsheetUrl
            };
        } catch (error) {
            console.error('Error exporting contacts:', error);
            throw new Error('Failed to export contacts to Google Sheets');
        }
    }

    /**
     * Export all interactions to Google Sheets
     */
    async exportInteractions(userId) {
        try {
            const sheetInfo = await this.getOrCreateSheet(userId);
            const sheets = await this.getSheetsService(userId);

            // Get all interactions with contact names
            const interactionsResult = await db.query(
                `SELECT 
                    i.id, i.contact_id, c.name as contact_name, i.type, i.subject,
                    i.notes, i.outcome, i.referral_value, i.date, i.booking_id,
                    i.follow_up_date, i.follow_up_time, i.status
                FROM interactions i
                LEFT JOIN contacts c ON i.contact_id = c.id
                WHERE i.user_id = $1
                ORDER BY i.date DESC, i.id DESC`,
                [userId]
            );

            // Convert interactions to rows
            const rows = interactionsResult.rows.map(interaction => [
                interaction.id,
                interaction.contact_id,
                interaction.contact_name || '',
                interaction.type || '',
                interaction.subject || '',
                interaction.notes || '',
                interaction.outcome || '',
                interaction.referral_value || '',
                this.formatTimestamp(interaction.date),
                interaction.booking_id || '',
                this.formatDate(interaction.follow_up_date),
                interaction.follow_up_time || '',
                interaction.status || ''
            ]);

            // Clear existing data (except headers)
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetInfo.spreadsheetId,
                range: 'Interactions!A2:M'
            });

            // Write data starting from row 2 (row 1 is headers)
            if (rows.length > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: sheetInfo.spreadsheetId,
                    range: 'Interactions!A2:M',
                    valueInputOption: 'RAW',
                    resource: {
                        values: rows
                    }
                });
            }

            return {
                success: true,
                rowsExported: rows.length,
                spreadsheetUrl: sheetInfo.spreadsheetUrl
            };
        } catch (error) {
            console.error('Error exporting interactions:', error);
            throw new Error('Failed to export interactions to Google Sheets');
        }
    }

    /**
     * Export all CRM data (contacts and interactions)
     */
    async exportAll(userId) {
        try {
            const contactsResult = await this.exportContacts(userId);
            const interactionsResult = await this.exportInteractions(userId);

            return {
                success: true,
                contacts: contactsResult.rowsExported,
                interactions: interactionsResult.rowsExported,
                spreadsheetUrl: contactsResult.spreadsheetUrl
            };
        } catch (error) {
            console.error('Error exporting all CRM data:', error);
            throw error;
        }
    }

    /**
     * Get Google Sheets integration status
     */
    async getStatus(userId) {
        try {
            const result = await db.query(
                'SELECT google_sheet_id, google_sheets_enabled FROM users WHERE id = $1',
                [userId]
            );

            const user = result.rows[0];
            const hasSheetId = !!user?.google_sheet_id;
            const enabled = user?.google_sheets_enabled || false;

            // Verify Google connection exists
            const tokens = await googleCalendarService.getUserTokens(userId);
            const hasGoogleConnection = !!tokens && !!tokens.google_access_token;

            // Check if Sheets API is accessible (this verifies the scope is present)
            let hasSheetsAccess = false;
            let sheetsAccessError = null;
            
            if (hasGoogleConnection) {
                try {
                    // Try to create the Sheets service - this will fail if scope is missing
                    const sheets = await this.getSheetsService(userId);
                    
                    // Try a simple API call to verify Sheets scope is available
                    // Using a non-existent spreadsheet ID - if we get 404, scope is good
                    // If we get 403 with scope error, scope is missing
                    try {
                        await sheets.spreadsheets.get({
                            spreadsheetId: 'test_scope_check_12345'
                        });
                        hasSheetsAccess = true; // Shouldn't reach here, but if we do, scope is good
                        console.log('Sheets API test: Got unexpected success');
                    } catch (apiError) {
                        console.log('Sheets API test error:', {
                            code: apiError.code,
                            message: apiError.message,
                            errors: apiError.errors
                        });
                        
                        // Check the error type
                        if (apiError.code === 404) {
                            // 404 means API is accessible, just sheet doesn't exist - scope is good!
                            hasSheetsAccess = true;
                            console.log('Sheets API test: Got 404 - API is accessible');
                        } else if (apiError.code === 403) {
                            // Check if it's a scope error
                            const errorMessage = apiError.message || '';
                            const errorDetails = apiError.errors?.[0]?.message || '';
                            const fullError = (errorMessage + ' ' + errorDetails).toLowerCase();
                            
                            if (fullError.includes('insufficient authentication scopes') ||
                                fullError.includes('insufficient permission') ||
                                fullError.includes('insufficient authentication')) {
                                hasSheetsAccess = false;
                                sheetsAccessError = 'Sheets API scope not granted';
                                console.log('Sheets API test: Scope not granted');
                            } else if (fullError.includes('api has not been used') || 
                                      fullError.includes('api not enabled') ||
                                      fullError.includes('service is not enabled') ||
                                      fullError.includes('sheets api has not been used')) {
                                hasSheetsAccess = false;
                                sheetsAccessError = 'Google Sheets API not enabled in Google Cloud Console';
                                console.log('Sheets API test: API not enabled');
                            } else {
                                // Other 403 errors might be permission issues, but scope is there
                                hasSheetsAccess = true;
                                console.log('Sheets API test: Got 403 but assuming scope is available');
                            }
                        } else {
                            // Other errors - assume scope is available
                            hasSheetsAccess = true;
                            console.log('Sheets API test: Got other error, assuming scope available');
                        }
                    }
                } catch (serviceError) {
                    // If we can't even create the service, check the error
                    const errorMessage = serviceError.message || '';
                    console.log('Sheets service creation error:', errorMessage);
                    if (errorMessage.includes('scope') || errorMessage.includes('permission')) {
                        hasSheetsAccess = false;
                        sheetsAccessError = 'Sheets API scope not granted';
                    } else {
                        // Other errors - assume we can try
                        hasSheetsAccess = true;
                    }
                }
            }

            let spreadsheetUrl = null;
            if (hasSheetId && hasGoogleConnection && hasSheetsAccess) {
                // Verify sheet is accessible
                try {
                    const sheets = await this.getSheetsService(userId);
                    await sheets.spreadsheets.get({
                        spreadsheetId: user.google_sheet_id
                    });
                    spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${user.google_sheet_id}`;
                } catch (error) {
                    // Sheet not accessible
                    console.log('Sheet not accessible:', error);
                }
            }

            return {
                enabled,
                hasSheetId,
                hasGoogleConnection,
                hasSheetsAccess,
                spreadsheetUrl,
                sheetsAccessError
            };
        } catch (error) {
            console.error('Error getting Google Sheets status:', error);
            return {
                enabled: false,
                hasSheetId: false,
                hasGoogleConnection: false,
                hasSheetsAccess: false,
                spreadsheetUrl: null,
                sheetsAccessError: error.message || 'Unknown error'
            };
        }
    }

    /**
     * Disconnect Google Sheets integration
     */
    async disconnect(userId) {
        try {
            await db.query(
                'UPDATE users SET google_sheet_id = NULL, google_sheets_enabled = FALSE WHERE id = $1',
                [userId]
            );
            return true;
        } catch (error) {
            console.error('Error disconnecting Google Sheets:', error);
            throw new Error('Failed to disconnect Google Sheets integration');
        }
    }
}

module.exports = new GoogleSheetsService();

