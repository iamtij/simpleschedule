const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Create the db directory if it doesn't exist
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

// Connect to database
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Read and execute initialization SQL
const initSQL = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
db.exec(initSQL, (err) => {
    if (err) {
        console.error('Error initializing database:', err);
        process.exit(1);
    }
    console.log('Database initialized successfully');
    db.close();
}); 