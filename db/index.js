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
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000
    });

    // Add error handler
    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
    });

    // Export pool query interface
    db = {
        query: async (text, params) => {
            const client = await pool.connect();
            try {
                return await client.query(text, params);
            } finally {
                client.release();
            }
        },
        end: () => pool.end()
    };

    console.log('PostgreSQL pool initialized');
} else {
    // SQLite for development
    const sqliteDb = new sqlite3.Database(config.database.path);
    
    // Wrap SQLite to match Postgres interface
    db = {
        query: (text, params) => {
            return new Promise((resolve, reject) => {
                // Convert $1, $2, etc. to ?, ?
                const sqliteQuery = text.replace(/\$\d+/g, '?');
                
                // For SELECT queries
                if (text.trim().toLowerCase().startsWith('select')) {
                    sqliteDb.all(sqliteQuery, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve({ rows });
                    });
                }
                // For INSERT queries with RETURNING
                else if (text.toLowerCase().includes('returning')) {
                    sqliteDb.run(sqliteQuery, params, function(err) {
                        if (err) reject(err);
                        else resolve({ 
                            rows: [{ id: this.lastID }]
                        });
                    });
                }
                // For other queries (UPDATE, DELETE, etc.)
                else {
                    sqliteDb.run(sqliteQuery, params, (err) => {
                        if (err) reject(err);
                        else resolve({ rowCount: this.changes });
                    });
                }
            });
        },
        end: () => {
            return new Promise((resolve, reject) => {
                sqliteDb.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    };

    console.log('SQLite initialized with Postgres-compatible interface');
}

module.exports = db; 