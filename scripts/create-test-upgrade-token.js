require('dotenv').config();
const db = require('../db');
const crypto = require('crypto');

async function createTestToken() {
    try {
        // Find or create a test user
        let userResult = await db.query(
            'SELECT id, email FROM users WHERE email = $1',
            ['tjtalusan@gmail.com']
        );

        let userId;
        if (userResult.rows.length === 0) {
            // Create a test user
            const insertResult = await db.query(
                `INSERT INTO users (full_name, username, email, password, trial_started_at, created_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP)
                 RETURNING id`,
                ['Test User', 'testuser', 'tjtalusan@gmail.com', 'dummy_password_hash']
            );
            userId = insertResult.rows[0].id;
            console.log('Created test user');
        } else {
            userId = userResult.rows[0].id;
            console.log('Using existing user');
        }

        // Generate a test token
        const testToken = 'test-token-' + Date.now();
        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Save token to database
        await db.query(
            'UPDATE users SET upgrade_token = $1, upgrade_token_expiry = $2 WHERE id = $3',
            [testToken, tokenExpiry, userId]
        );

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const upgradeLink = `${appUrl}/upgrade/${testToken}`;

        console.log('\n✅ Test token created successfully!');
        console.log(`\nUpgrade link: ${upgradeLink}`);
        console.log(`\nYou can now click this link to test the upgrade page.`);
        console.log(`Token: ${testToken}`);
        console.log(`Expires: ${tokenExpiry.toISOString()}\n`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

createTestToken();

