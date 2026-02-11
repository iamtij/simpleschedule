require('dotenv').config();
const db = require('../db');
const mailService = require('../services/mail');
const crypto = require('crypto');

/**
 * One-time script to schedule trial expiration emails for existing users
 * whose trials haven't expired yet and don't have upgrade tokens
 * 
 * Run this once manually, then delete the script
 */

async function scheduleEmailsForExistingUsers() {
    try {
        console.log('Finding users who need trial expiration emails...');

        // Find users with trial_started_at but no upgrade_token (or expired token)
        // and whose trial hasn't expired yet
        const result = await db.query(`
            SELECT id, email, username, full_name, display_name, trial_started_at
            FROM users
            WHERE trial_started_at IS NOT NULL
            AND (
                upgrade_token IS NULL 
                OR upgrade_token_expiry IS NULL 
                OR upgrade_token_expiry < NOW()
            )
            AND trial_started_at + INTERVAL '5 days' > NOW()
            AND is_pro = false
            AND (revenuecat_entitlement_status IS NULL OR revenuecat_entitlement_status != 'active')
        `);

        console.log(`Found ${result.rows.length} users who need trial expiration emails`);

        let scheduledCount = 0;
        let errorCount = 0;

        for (const user of result.rows) {
            try {
                // Generate upgrade token
                const upgradeToken = crypto.randomBytes(32).toString('hex');
                const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

                // Save token to database
                await db.query(
                    'UPDATE users SET upgrade_token = $1, upgrade_token_expiry = $2 WHERE id = $3',
                    [upgradeToken, tokenExpiry, user.id]
                );

                // Calculate delivery times based on trial_started_at
                const trialStart = new Date(user.trial_started_at);
                const now = new Date();
                
                // Calculate days since trial started
                const daysSinceTrial = (now - trialStart) / (1000 * 60 * 60 * 24);
                const daysUntilExpiration = 5 - daysSinceTrial;

                // Calculate delivery times
                const deliveryTime1 = new Date(trialStart);
                deliveryTime1.setDate(deliveryTime1.getDate() + 4); // 1 day before expiration
                deliveryTime1.setHours(9, 0, 0, 0); // 9 AM

                const deliveryTime2 = new Date(trialStart);
                deliveryTime2.setDate(deliveryTime2.getDate() + 5); // On expiration day
                deliveryTime2.setHours(9, 0, 0, 0); // 9 AM

                // Only schedule emails if delivery time is in the future
                const userForEmail = {
                    id: user.id,
                    email: user.email,
                    name: user.full_name || user.display_name,
                    full_name: user.full_name,
                    username: user.username
                };

                const promises = [];

                // Schedule "1 day before" email if it hasn't passed yet
                if (deliveryTime1 > now) {
                    promises.push(
                        mailService.scheduleTrialExpirationEmail(userForEmail, 1, deliveryTime1, upgradeToken)
                    );
                    promises.push(
                        mailService.scheduleAdminTrialExpiringNotification(userForEmail, deliveryTime1)
                    );
                }

                // Schedule "expiration day" email if it hasn't passed yet
                if (deliveryTime2 > now) {
                    promises.push(
                        mailService.scheduleTrialExpirationEmail(userForEmail, 0, deliveryTime2, upgradeToken)
                    );
                }

                await Promise.all(promises);

                scheduledCount++;
                console.log(`✓ Scheduled emails for user ${user.email} (${daysUntilExpiration.toFixed(1)} days until expiration)`);
            } catch (error) {
                errorCount++;
                console.error(`✗ Error scheduling emails for user ${user.email}:`, error.message);
            }
        }

        console.log(`\nCompleted!`);
        console.log(`Successfully scheduled: ${scheduledCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`\nYou can now delete this script.`);

        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
scheduleEmailsForExistingUsers();

