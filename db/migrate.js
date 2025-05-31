const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

async function waitForDatabase(pool, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const client = await pool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
        } catch (err) {
            console.log(`Database connection attempt ${i + 1}/${maxRetries} failed. Retrying in 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
}

async function migrate() {
    if (config.env === 'production') {
        // PostgreSQL migration
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: config.database.path,
            ssl: {
                rejectUnauthorized: false
            }
        });

        try {
            console.log('Waiting for database to be ready...');
            const isConnected = await waitForDatabase(pool);
            if (!isConnected) {
                throw new Error('Could not connect to database after multiple retries');
            }

            // Read and execute PostgreSQL schema
            console.log('Running PostgreSQL migrations...');
            const schemaSQL = await fs.readFile(path.join(__dirname, 'schema.postgres.sql'), 'utf8');
            await pool.query(schemaSQL);
            console.log('PostgreSQL migration completed successfully');
        } catch (err) {
            console.error('Error during PostgreSQL migration:', err);
            throw err; // Let the error propagate
        } finally {
            await pool.end();
        }
    } else {
        // SQLite migration
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

        try {
            const schemaSQL = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
            await new Promise((resolve, reject) => {
                db.exec(schemaSQL, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log('SQLite migration completed successfully');
        } catch (err) {
            console.error('Error during SQLite migration:', err);
            throw err; // Let the error propagate
        } finally {
            db.close();
        }
    }
}

// Run migrations with proper error handling
migrate()
    .then(() => {
        console.log('All migrations completed successfully');
        // Only exit in production to allow for development watch mode
        if (config.env === 'production') {
            process.exit(0);
        }
    })
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    }); 