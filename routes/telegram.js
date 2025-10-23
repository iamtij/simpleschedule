const express = require('express');
const router = express.Router();
const db = require('../db');
const telegramService = require('../services/telegram');

// Middleware to verify requests from n8n
const verifyN8nWebhook = (req, res, next) => {
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-n8n-webhook-secret'];
    
    if (webhookSecret && providedSecret !== webhookSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Link Telegram account
router.post('/link', async (req, res) => {
    try {
        const { userId, chatId, username } = req.body;
        
        const result = await db.query(
            `UPDATE users 
             SET telegram_chat_id = $1, 
                 telegram_username = $2,
                 telegram_notifications_enabled = true
             WHERE id = $3
             RETURNING id, telegram_chat_id`,
            [chatId, username, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, linked: true });
    } catch (error) {
        console.error('Telegram link error:', error);
        res.status(500).json({ error: 'Failed to link Telegram account' });
    }
});

// Unlink Telegram account
router.post('/unlink', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        await db.query(
            `UPDATE users 
             SET telegram_chat_id = NULL, 
                 telegram_username = NULL,
                 telegram_notifications_enabled = false
             WHERE id = $1`,
            [userId]
        );

        res.json({ success: true, unlinked: true });
    } catch (error) {
        console.error('Telegram unlink error:', error);
        res.status(500).json({ error: 'Failed to unlink Telegram account' });
    }
});

// Webhook endpoint for n8n to send bot commands back to app
router.post('/webhook', verifyN8nWebhook, async (req, res) => {
    try {
        const { command, chatId, data } = req.body;
        
        // Log the incoming message
        await db.query(
            `INSERT INTO telegram_messages (chat_id, message_type, message_content, direction)
             VALUES ($1, $2, $3, 'incoming')`,
            [chatId, command, JSON.stringify(data)]
        );

        // Handle different commands
        switch (command) {
            case 'get_bookings':
                return await handleGetBookings(req, res);
            case 'get_availability':
                return await handleGetAvailability(req, res);
            case 'get_contacts':
                return await handleGetContacts(req, res);
            default:
                res.json({ success: true });
        }
    } catch (error) {
        console.error('Telegram webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function handleGetBookings(req, res) {
    const { chatId, date } = req.body.data;
    
    const user = await db.query(
        'SELECT id FROM users WHERE telegram_chat_id = $1',
        [chatId]
    );
    
    if (user.rows.length === 0) {
        return res.json({ success: false, error: 'User not found' });
    }
    
    const userId = user.rows[0].id;
    const bookings = await db.query(
        `SELECT * FROM bookings 
         WHERE user_id = $1 AND date >= $2 
         ORDER BY date, start_time 
         LIMIT 10`,
        [userId, date || new Date().toISOString().split('T')[0]]
    );
    
    res.json({ success: true, bookings: bookings.rows });
}

async function handleGetAvailability(req, res) {
    const { chatId, username, date } = req.body.data;
    
    // Implementation similar to booking routes
    res.json({ success: true, slots: [] });
}

async function handleGetContacts(req, res) {
    const { chatId, search } = req.body.data;
    
    const user = await db.query(
        'SELECT id FROM users WHERE telegram_chat_id = $1',
        [chatId]
    );
    
    if (user.rows.length === 0) {
        return res.json({ success: false, error: 'User not found' });
    }
    
    const userId = user.rows[0].id;
    let query = 'SELECT * FROM contacts WHERE user_id = $1';
    const params = [userId];
    
    if (search) {
        query += ' AND name ILIKE $2 LIMIT 10';
        params.push(`%${search}%`);
    } else {
        query += ' ORDER BY updated_at DESC LIMIT 10';
    }
    
    const contacts = await db.query(query, params);
    res.json({ success: true, contacts: contacts.rows });
}

module.exports = router;

