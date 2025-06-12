const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function resetPassword() {
    const pool = new Pool({
        user: 'isked',
        password: 'isked_dev',
        host: 'localhost',
        port: 5432,
        database: 'isked_dev'
    });

    try {
        // Generate new password hash
        const password = 'isked2024';
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        // Update user's password
        const result = await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, email',
            [hash, 'tjtalusan@gmail.com']
        );

        console.log('Password updated for user:', result.rows[0]);
    } catch (err) {
        console.error('Error resetting password:', err);
    } finally {
        await pool.end();
    }
}

resetPassword(); 