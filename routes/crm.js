const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }
    next();
};

// Get all contacts for the user
router.get('/', requireLogin, async (req, res) => {
    try {
        const { status, search, sort = 'name' } = req.query;
        
        let query = `
            SELECT 
                id, name, email, phone, company, position, industry,
                source, status, referral_potential, notes, tags,
                last_contact_date, next_follow_up, created_at, updated_at,
                bni_member, bni_chapter
            FROM contacts 
            WHERE user_id = $1
        `;
        
        const params = [req.session.userId];
        let paramCount = 1;
        
        // Add status filter if provided
        if (status && status !== 'all') {
            paramCount++;
            query += ` AND status = $${paramCount}`;
            params.push(status);
        }
        
        // Add search filter if provided
        if (search) {
            paramCount++;
            query += ` AND (
                name ILIKE $${paramCount} OR 
                email ILIKE $${paramCount} OR 
                company ILIKE $${paramCount} OR
                phone ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
        }
        
        // Add sorting
        const validSortFields = ['name', 'company', 'status', 'referral_potential', 'created_at', 'last_contact_date'];
        const sortField = validSortFields.includes(sort) ? sort : 'name';
        query += ` ORDER BY ${sortField} ASC`;
        
        const result = await db.query(query, params);
        
        // Format date fields to avoid timezone conversion issues
        const formattedContacts = result.rows.map(contact => {
            if (contact.next_follow_up) {
                // If it's a Date object, format it properly to avoid timezone conversion
                if (contact.next_follow_up instanceof Date) {
                    // Use local date formatting to avoid UTC conversion issues
                    const year = contact.next_follow_up.getFullYear();
                    const month = String(contact.next_follow_up.getMonth() + 1).padStart(2, '0');
                    const day = String(contact.next_follow_up.getDate()).padStart(2, '0');
                    contact.next_follow_up = `${year}-${month}-${day}`;
                }
                // If it's already a string but has timezone info, extract just the date part
                else if (typeof contact.next_follow_up === 'string' && contact.next_follow_up.includes('T')) {
                    contact.next_follow_up = contact.next_follow_up.split('T')[0];
                }
            }
            return contact;
        });
        
        res.json({
            success: true,
            contacts: formattedContacts,
            total: formattedContacts.length
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contacts'
        });
    }
});

// Add a referral
router.post('/referrals', requireLogin, async (req, res) => {
    try {
        const {
            giver_contact_id, receiver_contact_id, value, notes
        } = req.body;
        
        if (!giver_contact_id || !receiver_contact_id) {
            return res.status(400).json({
                success: false,
                error: 'Both giver and receiver contact IDs are required'
            });
        }
        
        // Verify both contacts exist and belong to user
        const contactCheck = await db.query(
            'SELECT id FROM contacts WHERE id IN ($1, $2) AND user_id = $3',
            [giver_contact_id, receiver_contact_id, req.session.userId]
        );
        
        if (contactCheck.rows.length !== 2) {
            return res.status(400).json({
                success: false,
                error: 'One or both contacts not found'
            });
        }
        
        const result = await db.query(
            `INSERT INTO referrals 
             (giver_contact_id, receiver_contact_id, user_id, value, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [giver_contact_id, receiver_contact_id, req.session.userId, value && value.trim() !== '' ? parseFloat(value) : null, notes]
        );
        
        res.json({
            success: true,
            referral: result.rows[0]
        });
    } catch (error) {
        console.error('Error adding referral:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add referral'
        });
    }
});

// Get CRM dashboard stats
router.get('/stats/dashboard', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Get total contacts
        const totalContactsResult = await db.query(
            'SELECT COUNT(*) as total FROM contacts WHERE user_id = $1',
            [userId]
        );
        
        // Get contacts by status
        const statusStatsResult = await db.query(
            `SELECT status, COUNT(*) as count 
             FROM contacts 
             WHERE user_id = $1 
             GROUP BY status`,
            [userId]
        );
        
        // Get hot leads (status = 'hot_prospect')
        const hotLeadsResult = await db.query(
            "SELECT COUNT(*) as count FROM contacts WHERE user_id = $1 AND status = 'hot_prospect'",
            [userId]
        );
        
        // Get follow-ups due (include recent past dates and future dates)
        const followUpsResult = await db.query(
            'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1 AND next_follow_up IS NOT NULL AND next_follow_up >= CURRENT_DATE - INTERVAL \'3 days\'',
            [userId]
        );
        
        
        // Get recent interactions (last 7 days)
        const recentInteractionsResult = await db.query(
            `SELECT COUNT(*) as count 
             FROM interactions 
             WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'`,
            [userId]
        );
        
        res.json({
            success: true,
            stats: {
                totalContacts: parseInt(totalContactsResult.rows[0].total),
                statusBreakdown: statusStatsResult.rows,
                hotLeads: parseInt(hotLeadsResult.rows[0].count),
                followUpsDue: parseInt(followUpsResult.rows[0].count),
                recentInteractions: parseInt(recentInteractionsResult.rows[0].count)
            }
        });
    } catch (error) {
        console.error('Error fetching CRM stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch CRM stats'
        });
    }
});

// Get a specific contact
router.get('/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get contact details
        const contactResult = await db.query(
            'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
            [id, req.session.userId]
        );
        
        if (contactResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        const contact = contactResult.rows[0];
        
        // Get interactions for this contact
        const interactionsResult = await db.query(
            `SELECT 
                id, type, subject, notes, outcome, referral_value, date, booking_id
             FROM interactions 
             WHERE contact_id = $1 AND user_id = $2
             ORDER BY date DESC
             LIMIT 20`,
            [id, req.session.userId]
        );
        
        // Get referrals given by this contact
        const referralsGivenResult = await db.query(
            `SELECT r.*, c.name as receiver_name, c.company as receiver_company
             FROM referrals r
             JOIN contacts c ON r.receiver_contact_id = c.id
             WHERE r.giver_contact_id = $1 AND r.user_id = $2
             ORDER BY r.created_at DESC`,
            [id, req.session.userId]
        );
        
        // Get referrals received by this contact
        const referralsReceivedResult = await db.query(
            `SELECT r.*, c.name as giver_name, c.company as giver_company
             FROM referrals r
             JOIN contacts c ON r.giver_contact_id = c.id
             WHERE r.receiver_contact_id = $1 AND r.user_id = $2
             ORDER BY r.created_at DESC`,
            [id, req.session.userId]
        );
        
        res.json({
            success: true,
            contact: contact,
            interactions: interactionsResult.rows,
            referralsGiven: referralsGivenResult.rows,
            referralsReceived: referralsReceivedResult.rows
        });
    } catch (error) {
        console.error('Error fetching contact:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contact'
        });
    }
});

// Create a new contact
router.post('/', requireLogin, async (req, res) => {
    try {
        const {
            name, email, phone, company, position, industry,
            source, status, referral_potential, notes, tags,
            next_follow_up, booking_id, bni_member, bni_chapter
        } = req.body;
        
        // Parse next_follow_up date properly (handle date-only strings)
        let parsedFollowUp = null;
        if (next_follow_up) {
            // If it's a date-only string (YYYY-MM-DD), store it directly without timezone conversion
            if (typeof next_follow_up === 'string' && next_follow_up.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // Store the date string directly to avoid timezone conversion issues
                parsedFollowUp = next_follow_up;
            } else {
                parsedFollowUp = next_follow_up;
            }
        }
        
        console.log('Creating contact with data:', { name, email, booking_id, userId: req.session.userId });
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Name is required'
            });
        }
        
        // Check for duplicate email if email is provided
        if (email && email.trim() !== '') {
            console.log('Checking for duplicate email:', email.trim());
            const existingContact = await db.query(
                'SELECT id, name FROM contacts WHERE email = $1 AND user_id = $2',
                [email.trim(), req.session.userId]
            );
            
            console.log('Existing contacts found:', existingContact.rows.length);
            
            if (existingContact.rows.length > 0) {
                console.log('Duplicate email found, rejecting:', existingContact.rows[0]);
                return res.status(400).json({
                    success: false,
                    error: `Contact with email "${email}" already exists: ${existingContact.rows[0].name}`
                });
            }
        }
        
        // If this contact is created from a booking, set last_contact_date to the booking date
        let lastContactDate = null;
        if (booking_id) {
            try {
                const bookingResult = await db.query(
                    'SELECT date FROM bookings WHERE id = $1 AND user_id = $2',
                    [booking_id, req.session.userId]
                );
                if (bookingResult.rows.length > 0) {
                    lastContactDate = bookingResult.rows[0].date;
                }
            } catch (error) {
                console.error('Error fetching booking date:', error);
                // Continue without setting last_contact_date if there's an error
            }
        }

        const result = await db.query(
            `INSERT INTO contacts 
             (user_id, name, email, phone, company, position, industry,
              source, status, referral_potential, notes, tags, next_follow_up,
              bni_member, bni_chapter, last_contact_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [
                req.session.userId, name, email, phone, company, position, industry,
                source || 'manual', status || 'new_lead', referral_potential || 1,
                notes, tags || [], parsedFollowUp, bni_member || false, bni_chapter, lastContactDate
            ]
        );
        
        const newContact = result.rows[0];
        
        // If this contact was created from a booking, automatically create an interaction
        if (booking_id) {
            console.log('Creating interaction for booking_id:', booking_id, 'contact_id:', newContact.id);
            try {
                await db.query(
                    `INSERT INTO interactions 
                     (contact_id, user_id, type, subject, notes, date, booking_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        newContact.id,
                        req.session.userId,
                        'meeting',
                        'Initial Meeting',
                        `Meeting scheduled from booking system`,
                        new Date(),
                        booking_id
                    ]
                );
                console.log('Interaction created successfully');
            } catch (interactionError) {
                console.error('Error creating interaction:', interactionError);
                // Don't fail the contact creation if interaction fails
            }
        } else {
            console.log('No booking_id provided, skipping interaction creation');
        }
        
        res.json({
            success: true,
            contact: newContact
        });
    } catch (error) {
        console.error('Error creating contact:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create contact'
        });
    }
});

// Update a contact
router.put('/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, email, phone, company, position, industry,
            source, status, referral_potential, notes, tags,
            last_contact_date, next_follow_up, bni_member, bni_chapter
        } = req.body;
        
        // Parse next_follow_up date properly (handle date-only strings)
        let parsedFollowUp = null;
        if (next_follow_up) {
            // If it's a date-only string (YYYY-MM-DD), store it directly without timezone conversion
            if (typeof next_follow_up === 'string' && next_follow_up.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // Store the date string directly to avoid timezone conversion issues
                parsedFollowUp = next_follow_up;
            } else {
                parsedFollowUp = next_follow_up;
            }
        }
        
        const result = await db.query(
            `UPDATE contacts SET
             name = $1, email = $2, phone = $3, company = $4, position = $5,
             industry = $6, source = $7, status = $8, referral_potential = $9,
             notes = $10, tags = $11, last_contact_date = $12, next_follow_up = $13,
             bni_member = $14, bni_chapter = $15, updated_at = CURRENT_TIMESTAMP
             WHERE id = $16 AND user_id = $17
             RETURNING *`,
            [
                name, email, phone, company, position, industry,
                source, status, referral_potential, notes, tags,
                last_contact_date, parsedFollowUp, bni_member || false, bni_chapter,
                id, req.session.userId
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        res.json({
            success: true,
            contact: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating contact:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update contact'
        });
    }
});

// Delete a contact
router.delete('/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.session.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Contact deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting contact:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete contact'
        });
    }
});

// Add an interaction to a contact
router.post('/:id/interactions', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            type, subject, notes, outcome, referral_value, booking_id,
            follow_up_date, follow_up_time
        } = req.body;
        
        if (!type) {
            return res.status(400).json({
                success: false,
                error: 'Interaction type is required'
            });
        }
        
        // Verify contact exists and belongs to user
        const contactCheck = await db.query(
            'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
            [id, req.session.userId]
        );
        
        if (contactCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        const result = await db.query(
            `INSERT INTO interactions 
             (contact_id, user_id, type, subject, notes, outcome, referral_value, booking_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [id, req.session.userId, type, subject, notes, outcome, referral_value, booking_id]
        );
        
        // Update contact's last_contact_date
        await db.query(
            'UPDATE contacts SET last_contact_date = CURRENT_DATE WHERE id = $1',
            [id]
        );
        
        // If this is a follow-up interaction with date/time, update the contact's next_follow_up
        if (type === 'follow_up' && follow_up_date) {
            // Parse follow_up_date properly (handle date-only strings)
            let parsedFollowUpDate = follow_up_date;
            if (typeof follow_up_date === 'string' && follow_up_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // Store the date string directly to avoid timezone conversion issues
                parsedFollowUpDate = follow_up_date;
            }
            
            await db.query(
                'UPDATE contacts SET next_follow_up = $1 WHERE id = $2',
                [parsedFollowUpDate, id]
            );
        }
        
        res.json({
            success: true,
            interaction: result.rows[0]
        });
    } catch (error) {
        console.error('Error adding interaction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add interaction'
        });
    }
});

module.exports = router;