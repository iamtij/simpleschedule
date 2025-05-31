const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const db = require('./index');
const sqlite3 = require('sqlite3').verbose();

async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        if (config.env === 'production') {
            await db.query(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL UNIQUE,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            await db.query(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        // Get list of migration files
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        const files = await fs.readdir(migrationsDir);
        const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

        // Get executed migrations
        const result = await db.query('SELECT name FROM migrations');
        const executedMigrations = new Set(result.rows.map(r => r.name));

        // Run pending migrations
        for (const file of sqlFiles) {
            if (!executedMigrations.has(file)) {
                console.log(`Running migration: ${file}`);
                
                // Read and execute migration
                const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
                
                // Convert PostgreSQL syntax to SQLite if needed
                const finalSql = config.env === 'production' ? sql : 
                    sql.replace(/SERIAL/g, 'INTEGER')
                       .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT (datetime(\'now\'))');
                
                await db.query(finalSql);
                
                // Record migration
                await db.query(
                    'INSERT INTO migrations (name) VALUES ($1)',
                    [file]
                );
                
                console.log(`Completed migration: ${file}`);
            }
        }

        console.log('All migrations completed successfully');
        
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        await db.end();
    }
}

// Run migrations
runMigrations(); 