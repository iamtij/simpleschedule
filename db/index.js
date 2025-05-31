const config = require('../config');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

let db;

if (config.env === 'production') {
    // PostgreSQL for production
    const pool = new Pool({
        connectionString: config.database.path,
        ssl: {
            rejectUnauthorized: false
        },
        // Optimize for serverless
        max: 1,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000
    });

    // Add error handler
    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
    });

    // Wrap pool query for better error handling
    db = {
        query: async (text, params) => {
            const client = await pool.connect();
            try {
                const result = await client.query(text, params);
                return result;
            } catch (err) {
                console.error('Database query error:', err);
                throw err;
            } finally {
                client.release();
            }
        },
        end: () => pool.end()
    };

    console.log('PostgreSQL pool initialized');
} else {
    // SQLite for development
    db = new sqlite3.Database(config.database.path, (err) => {
        if (err) {
            console.error('Error connecting to SQLite database:', err);
        } else {
            console.log('Connected to SQLite database');
        }
    });
}

module.exports = db; 