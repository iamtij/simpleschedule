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
        }
    });

    // Test the connection
    db.connect()
        .then(() => console.log('Connected to PostgreSQL database'))
        .catch(err => console.error('PostgreSQL connection error:', err));
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