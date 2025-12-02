const db = require('../db');

// Check once per day (24 hours = 24 * 60 * 60 * 1000 ms)
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let intervalRef = null;
let isRunning = false;

/**
 * Check and expire subscriptions that have passed expiration date + 1 day
 */
async function checkAndExpireSubscriptions() {
    if (isRunning) {
        return;
    }

    isRunning = true;

    try {
        // Find all Pro users with expiration dates
        const result = await db.query(
            `SELECT id, pro_expires_at 
             FROM users 
             WHERE is_pro = true 
             AND pro_expires_at IS NOT NULL`
        );

        const now = new Date();
        const expiredUserIds = [];

        for (const user of result.rows) {
            const expirationDate = new Date(user.pro_expires_at);
            const expirationPlusOne = new Date(expirationDate);
            expirationPlusOne.setDate(expirationPlusOne.getDate() + 1);

            // If expiration + 1 day has passed, mark for deactivation
            if (now > expirationPlusOne) {
                expiredUserIds.push(user.id);
            }
        }

        // Batch update expired subscriptions
        if (expiredUserIds.length > 0) {
            await db.query(
                `UPDATE users 
                 SET is_pro = false, 
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ANY($1)`,
                [expiredUserIds]
            );
            console.log(`Expired ${expiredUserIds.length} subscription(s)`);
        }
    } catch (error) {
        console.error('Error checking subscription expiration:', error);
    } finally {
        isRunning = false;
    }
}

function start() {
    if (process.env.DISABLE_SUBSCRIPTION_EXPIRATION_JOB === 'true') {
        return;
    }

    if (intervalRef) {
        return;
    }

    // Run immediately on start, then daily
    checkAndExpireSubscriptions().catch((error) => {
        console.error('Initial subscription expiration check failed:', error);
    });

    intervalRef = setInterval(() => {
        checkAndExpireSubscriptions().catch((error) => {
            console.error('Scheduled subscription expiration check failed:', error);
        });
    }, CHECK_INTERVAL_MS);
}

function stop() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
}

module.exports = {
    start,
    stop
};

