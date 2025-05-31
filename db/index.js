const config = require('../config');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

let db;

if (config.env === 'production') {
    // PostgreSQL for production
    db = new Pool({
        connectionString: config.database.path,
        ssl: {
            rejectUnauthorized: false
        },
        // Add connection pool settings for serverless
        max: 1,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000
    });

    // Test the connection
    db.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
    });

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

// Helper function for PostgreSQL queries
db.queryPromise = async (text, params) => {
    const client = await db.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};

module.exports = db; 