const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { Pool } = require('pg');

async function runMigrations() {
    let pool;
    try {
        // Create a new pool with a longer timeout
        pool = new Pool({
            connectionString: config.database.path,
            ssl: config.env === 'production' ? {
                rejectUnauthorized: false
            } : false,
            connectionTimeoutMillis: 10000, // 10 seconds
            query_timeout: 10000 // 10 seconds
        });

        // Test the connection
        console.log('Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('Database connection successful');

        // Create migrations table if it doesn't exist
        console.log('Creating migrations table if needed...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get list of migration files
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        console.log('Reading migrations from:', migrationsDir);
        const files = await fs.readdir(migrationsDir);
        const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
        console.log('Found migration files:', sqlFiles);

        // Get executed migrations
        const result = await pool.query('SELECT name FROM migrations');
        const executedMigrations = new Set(result.rows.map(r => r.name));
        console.log('Already executed migrations:', Array.from(executedMigrations));

        // Run pending migrations
        for (const file of sqlFiles) {
            if (!executedMigrations.has(file)) {
                console.log(`Starting migration: ${file}`);
                
                // Read migration file
                const filePath = path.join(migrationsDir, file);
                console.log('Reading migration file:', filePath);
                const sql = await fs.readFile(filePath, 'utf8');
                
                // Split SQL into individual statements
                const statements = sql.split(';').filter(stmt => stmt.trim());
                
                // Execute each statement separately
                for (let i = 0; i < statements.length; i++) {
                    const stmt = statements[i].trim();
                    if (stmt) {
                        console.log(`Executing statement ${i + 1}/${statements.length}`);
                        await pool.query(stmt);
                    }
                }
                
                // Record migration
                await pool.query(
                    'INSERT INTO migrations (name) VALUES ($1)',
                    [file]
                );
                
                console.log(`Completed migration: ${file}`);
            } else {
                console.log(`Skipping already executed migration: ${file}`);
            }
        }

        console.log('All migrations completed successfully');
        
    } catch (error) {
        console.error('Migration error:', error);
        if (error.code) {
            console.error('Error code:', error.code);
        }
        if (error.message) {
            console.error('Error message:', error.message);
        }
        process.exit(1);
    } finally {
        if (pool) {
            console.log('Closing database connection...');
            await pool.end();
        }
    }
}

// Run migrations
console.log('Starting migrations...');
console.log('Environment:', config.env);
console.log('Database path:', config.database.path.replace(/:[^:@]+@/, ':***@')); // Hide password
runMigrations(); 