const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const axios = require('axios');

const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;
const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY || 'test_MNtPqiNNwjFdUJyGmziseOBwCtm';
const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';

/**
 * Verify RevenueCat webhook authorization
 * RevenueCat sends the authorization header value you configured
 */
function verifyWebhookAuthorization(authHeader) {
    if (!REVENUECAT_WEBHOOK_SECRET) {
        return true; // Skip verification if secret not set (for development)
    }
    
    if (!authHeader) {
        return false;
    }
    
    // Handle "Bearer <token>" format
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;
    
    // Compare with configured secret (with or without Bearer prefix)
    const expectedSecret = REVENUECAT_WEBHOOK_SECRET.startsWith('Bearer ')
        ? REVENUECAT_WEBHOOK_SECRET.substring(7)
        : REVENUECAT_WEBHOOK_SECRET;
    
    return token === expectedSecret;
}

/**
 * Handle RevenueCat webhook events
 */
router.post('/webhook', express.json(), async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers['x-revenuecat-signature'];
        const event = req.body.event;

        // Verify webhook authorization
        if (!verifyWebhookAuthorization(authHeader)) {
            return res.status(401).json({ error: 'Invalid authorization' });
        }

        const { app_user_id } = event;
        
        // Find user by RevenueCat app_user_id (should match your user ID)
        const userResult = await db.query(
            'SELECT id FROM users WHERE id::text = $1 OR email = $1',
            [app_user_id]
        );

        if (userResult.rows.length === 0) {
            console.log('User not found for RevenueCat event:', app_user_id);
            return res.status(200).json({ received: true });
        }

        const userId = userResult.rows[0].id;

        // Handle different event types
        switch (event.type) {
            case 'INITIAL_PURCHASE':
            case 'RENEWAL':
            case 'UNCANCELLATION':
                // User has active subscription
                const expirationDate = event.expiration_at_ms 
                    ? new Date(event.expiration_at_ms) 
                    : null;
                
                // Get entitlement status
                const entitlementStatus = event.entitlements?.['ISKED Pro']?.status || 'active';
                
                await db.query(
                    `UPDATE users 
                     SET is_pro = true, 
                         pro_expires_at = $1,
                         revenuecat_subscription_status = $2,
                         revenuecat_entitlement_status = $3,
                         revenuecat_user_id = $4
                     WHERE id = $5`,
                    [
                        expirationDate,
                        event.subscription_status || 'active',
                        entitlementStatus,
                        app_user_id,
                        userId
                    ]
                );
                break;

            case 'CANCELLATION':
            case 'EXPIRATION':
                // Subscription expired or cancelled
                await db.query(
                    `UPDATE users 
                     SET is_pro = false,
                         revenuecat_subscription_status = $1,
                         revenuecat_entitlement_status = $2
                     WHERE id = $3`,
                    [
                        event.subscription_status || 'expired',
                        event.entitlements?.['ISKED Pro']?.status || 'expired',
                        userId
                    ]
                );
                break;

            case 'BILLING_ISSUE':
                // Handle billing issues (optional - you might want to keep access)
                console.log('Billing issue for user:', userId);
                break;
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('RevenueCat webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

/**
 * Get customer info from RevenueCat REST API
 */
router.get('/customer-info', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId.toString();
        
        const response = await axios.get(`${REVENUECAT_BASE_URL}/subscribers/${userId}`, {
            headers: {
                'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            customerInfo: response.data
        });
    } catch (error) {
        console.error('Error fetching customer info:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer info'
        });
    }
});

/**
 * Get offerings from RevenueCat REST API
 */
router.get('/offerings', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId.toString();
        
        const response = await axios.get(`${REVENUECAT_BASE_URL}/subscribers/${userId}/offerings`, {
            headers: {
                'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            offerings: response.data
        });
    } catch (error) {
        console.error('Error fetching offerings:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch offerings'
        });
    }
});

/**
 * Check if user has entitlement
 */
router.get('/entitlement/:entitlementId', requireLogin, async (req, res) => {
    try {
        const userId = req.session.userId.toString();
        const entitlementId = req.params.entitlementId;
        
        const response = await axios.get(`${REVENUECAT_BASE_URL}/subscribers/${userId}`, {
            headers: {
                'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const customerInfo = response.data;
        const entitlement = customerInfo.subscriber?.entitlements?.[entitlementId];
        
        res.json({
            success: true,
            hasEntitlement: entitlement !== undefined && (entitlement.expires_date === null || new Date(entitlement.expires_date) > new Date()),
            entitlement: entitlement || null
        });
    } catch (error) {
        console.error('Error checking entitlement:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to check entitlement'
        });
    }
});

module.exports = router;

