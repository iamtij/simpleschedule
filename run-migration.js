const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigration() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'migrations', '002_add_full_name.sql'), 'utf8');
        await db.query(sql);
        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration(); 