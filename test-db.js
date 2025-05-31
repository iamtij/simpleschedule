const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function testConnection() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('Attempting to connect to database...');
        const client = await pool.connect();
        console.log('Successfully connected to database');

        console.log('Reading schema file...');
        const schemaSQL = await fs.readFile(path.join(__dirname, 'db/schema.postgres.sql'), 'utf8');
        
        console.log('Creating tables...');
        await client.query(schemaSQL);
        console.log('Tables created successfully');

        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('Available tables:', tables.rows.map(row => row.table_name));
        
        client.release();
        await pool.end();
    } catch (err) {
        console.error('Error:', err);
    }
}

testConnection(); 