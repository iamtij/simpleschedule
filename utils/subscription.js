const db = require('../db');

/**
 * Check if user has active access (within trial period or has active subscription)
 * Admin-granted Pro status takes precedence over trial
 * @param {number} userId - User ID
 * @returns {Promise<{hasAccess: boolean, reason?: string, daysRemaining?: number, isPro?: boolean, isAdminGranted?: boolean}>}
 */
async function checkUserAccess(userId) {
    const userResult = await db.query(
        `SELECT trial_started_at, is_pro, pro_expires_at, revenuecat_entitlement_status 
         FROM users WHERE id = $1`,
        [userId]
    );

    if (userResult.rows.length === 0) {
        return { hasAccess: false, reason: 'User not found' };
    }

    const user = userResult.rows[0];

    // PRIORITY 1: Check if user has admin-granted Pro status (or RevenueCat subscription)
    // Admin-granted Pro takes precedence - if is_pro is true and not expired, grant access
    if (user.is_pro) {
        // If pro_expires_at is null, it's a lifetime subscription (admin-granted)
        if (!user.pro_expires_at) {
            return { hasAccess: true, isPro: true, isAdminGranted: true };
        }
        
        // Check if subscription has expired (expiration date + 1 day grace period)
        const expirationDate = new Date(user.pro_expires_at);
        const expirationPlusOne = new Date(expirationDate);
        expirationPlusOne.setDate(expirationPlusOne.getDate() + 1);
        const now = new Date();
        
        // Calculate days remaining until expiration
        const daysRemaining = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
        
        // If expiration + 1 day has passed, subscription is expired
        if (now > expirationPlusOne) {
            // Auto-deactivate Pro status
            await db.query(
                `UPDATE users SET is_pro = false WHERE id = $1`,
                [userId]
            );
            return { hasAccess: false, reason: 'Subscription expired', isPro: false };
        }
        
        // Subscription is active (within expiration date + 1 day grace period)
        return { 
            hasAccess: true, 
            isPro: true, 
            isAdminGranted: true,
            daysRemaining: Math.max(0, daysRemaining),
            expirationDate: user.pro_expires_at
        };
    }

    // PRIORITY 2: Check RevenueCat entitlement (if using RevenueCat)
    if (user.revenuecat_entitlement_status === 'active') {
        return { hasAccess: true, isPro: true, isRevenueCat: true };
    }

    // PRIORITY 3: Check trial period (5 days) - only if no active subscription
    if (user.trial_started_at) {
        const trialStart = new Date(user.trial_started_at);
        const now = new Date();
        const daysSinceTrial = (now - trialStart) / (1000 * 60 * 60 * 24);
        
        if (daysSinceTrial <= 5) {
            const daysRemaining = Math.ceil(5 - daysSinceTrial);
            return { 
                hasAccess: true, 
                daysRemaining,
                isTrial: true,
                isPro: false
            };
        } else {
            return { 
                hasAccess: false, 
                reason: 'Trial expired',
                daysRemaining: 0,
                isPro: false
            };
        }
    }

    // No trial started and no subscription
    return { hasAccess: false, reason: 'No trial or subscription', isPro: false };
}

/**
 * Check if a user object has active Pro for features (e.g. SMS).
 * Uses same rules as checkUserAccess: is_pro and (lifetime or expiration + 1 day grace).
 * @param {{ is_pro?: boolean, pro_expires_at?: string|Date|null }} user - User row or host object
 * @returns {boolean}
 */
function isProActiveForFeatures(user) {
    if (!user || !user.is_pro) return false;
    if (!user.pro_expires_at) return true; // lifetime
    const expiration = new Date(user.pro_expires_at);
    const expirationPlusOne = new Date(expiration);
    expirationPlusOne.setDate(expirationPlusOne.getDate() + 1);
    return new Date() <= expirationPlusOne;
}

module.exports = {
    checkUserAccess,
    isProActiveForFeatures
};

