const config = require('../config');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

let db;
let pool;

if (config.env === 'production') {
    // PostgreSQL for production
    pool = new Pool({
        connectionString: config.database.path,
        ssl: {
            rejectUnauthorized: false
        },
        // Optimize for serverless
        max: 1,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000
    });

    // Add error handler
    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        // Attempt to reconnect
        pool.end().catch(console.error);
        pool = new Pool(pool.options);
    });

    // Wrap pool query for better error handling and connection management
    db = {
        query: async (text, params) => {
            let retries = 3;
            while (retries > 0) {
                const client = await pool.connect();
                try {
                    const result = await client.query(text, params);
                    return result;
                } catch (err) {
                    console.error(`Database query error (${retries} retries left):`, err);
                    if (retries === 1) throw err;
                } finally {
                    client.release();
                }
                retries--;
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        },
        end: async () => {
            try {
                await pool.end();
            } catch (err) {
                console.error('Error closing pool:', err);
            }
        }
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