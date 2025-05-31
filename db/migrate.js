const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

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
            // Read and execute PostgreSQL schema
            const schemaSQL = await fs.readFile(path.join(__dirname, 'schema.postgres.sql'), 'utf8');
            await pool.query(schemaSQL);
            console.log('PostgreSQL migration completed successfully');
        } catch (err) {
            console.error('Error during PostgreSQL migration:', err);
            process.exit(1);
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
            process.exit(1);
        } finally {
            db.close();
        }
    }
}

migrate().catch(console.error); 