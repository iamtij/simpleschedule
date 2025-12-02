const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigration() {
    try {
        // Get all SQL files from migrations directory
        const migrationFiles = fs.readdirSync(path.join(__dirname, 'migrations'))
            .filter(file => file.endsWith('.sql'))
            .sort(); // Sort to ensure correct order

        // Run each migration in sequence
        for (const file of migrationFiles) {
            const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
            await db.query(sql);
        }

        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

runMigration(); 