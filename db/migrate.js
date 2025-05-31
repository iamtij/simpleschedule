const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const db = require('./index');

async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
                await db.query(sql);
                
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