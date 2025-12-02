const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { Pool } = require('pg');

async function runMigrations() {
    let pool;
    try {
        // Create connection configuration
        const connectionConfig = {
            connectionString: config.database.path,
            ssl: config.env === 'production' ? {
                rejectUnauthorized: false
            } : false,
            connectionTimeoutMillis: 10000, // 10 seconds
            query_timeout: 10000 // 10 seconds
        };

        pool = new Pool(connectionConfig);

        // Test the connection with retries
        let connected = false;
        let retries = 5;
        while (!connected && retries > 0) {
            try {
                await pool.query('SELECT NOW()');
                connected = true;
            } catch (err) {
                retries--;
                if (retries === 0) {
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Create migrations table if it doesn't exist
        await pool.query(`
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
        const result = await pool.query('SELECT name FROM migrations');
        const executedMigrations = new Set(result.rows.map(r => r.name));

        // Run pending migrations
        for (const file of sqlFiles) {
            if (!executedMigrations.has(file)) {
                // Read migration file
                const filePath = path.join(migrationsDir, file);
                const sql = await fs.readFile(filePath, 'utf8');
                
                try {
                    // Execute the entire migration file as one statement
                    await pool.query(sql);
                    
                    // Record migration
                    await pool.query(
                        'INSERT INTO migrations (name) VALUES ($1)',
                        [file]
                    );
                } catch (error) {
                    throw error;
                }
            }
        }
        
        // Attempt to fix collation version mismatch warning
        try {
            const dbNameResult = await pool.query('SELECT current_database() as db_name');
            const dbName = dbNameResult.rows[0].db_name;
            
            // Try to refresh collation version
            // Note: This may require superuser privileges, so we catch and ignore errors
            try {
                await pool.query(`ALTER DATABASE "${dbName}" REFRESH COLLATION VERSION`);
            } catch (collationError) {
                // If we don't have permissions or it fails, just ignore it
                // This is a warning, not an error, so we continue
            }
        } catch (error) {
            // Ignore errors in collation fix attempt
        }
        
    } catch (error) {
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

// Run migrations
runMigrations(); 