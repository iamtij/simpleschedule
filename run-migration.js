const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigration() {
    try {
        // Get all SQL files from migrations directory
        const migrationFiles = fs.readdirSync(path.join(__dirname, 'migrations'))
            .filter(file => file.endsWith('.sql'))
            .sort(); // Sort to ensure correct order

        console.log('Found migration files:', migrationFiles);

        // Run each migration in sequence
        for (const file of migrationFiles) {
            console.log(`Running migration: ${file}`);
            const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
            await db.query(sql);
            console.log(`Completed migration: ${file}`);
        }

        console.log('All migrations completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration(); 