const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { Pool } = require('pg');

async function runMigrations() {
    let pool;
    try {
        console.log('Starting migrations...');
        console.log('Environment:', config.env);
        
        // Create connection configuration
        const connectionConfig = {
            connectionString: config.database.path,
            ssl: config.env === 'production' ? {
                rejectUnauthorized: false
            } : false,
            connectionTimeoutMillis: 10000, // 10 seconds
            query_timeout: 10000 // 10 seconds
        };

        console.log('Attempting database connection...');
        pool = new Pool(connectionConfig);

        // Test the connection with retries
        let connected = false;
        let retries = 5;
        while (!connected && retries > 0) {
            try {
                console.log(`Connection attempt ${6 - retries}/5...`);
                await pool.query('SELECT NOW()');
                connected = true;
                console.log('Database connection successful');
            } catch (err) {
                retries--;
                if (retries === 0) {
                    throw err;
                }
                console.log(`Connection failed, retrying in 5 seconds... (${retries} attempts remaining)`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

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
                
                try {
                    // Execute the entire migration file as one statement
                    console.log('Executing migration...');
                    await pool.query(sql);
                    
                    // Record migration
                    await pool.query(
                        'INSERT INTO migrations (name) VALUES ($1)',
                        [file]
                    );
                    
                    console.log(`Completed migration: ${file}`);
                } catch (error) {
                    console.error(`Error executing migration ${file}:`, error);
                    throw error;
                }
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
runMigrations(); 