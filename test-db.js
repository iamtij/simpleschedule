const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    user: 'isked',
    password: 'isked_dev',
    host: 'localhost',
    port: 5432,
    database: 'isked_dev'
});

async function testConnection() {
    try {
        // Test database connection
        const client = await pool.connect();
        console.log('Successfully connected to database');

        // Test user query
        const result = await client.query('SELECT id, email, password, username FROM users WHERE email = $1', ['tjtalusan@gmail.com']);
        if (result.rows.length > 0) {
            console.log('User found:', {
                id: result.rows[0].id,
                email: result.rows[0].email,
                username: result.rows[0].username
            });
            
            // Test password
            const testPassword = 'isked2024';
            const validPassword = await bcrypt.compare(testPassword, result.rows[0].password);
            console.log('Password check result:', validPassword);
        } else {
            console.log('User not found');
        }

        client.release();
    } catch (err) {
        console.error('Database test error:', err);
    } finally {
        pool.end();
    }
}

testConnection(); 