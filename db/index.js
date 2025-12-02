const config = require('../config');
const { Pool } = require('pg');

// PostgreSQL configuration
const pool = new Pool({
    connectionString: config.database.path,
    ssl: config.database.ssl,
    // Production optimizations
    ...(config.env === 'production' ? {
        max: 20,                         // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,        // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000,    // Return an error after 2 seconds if connection could not be established
        maxUses: 7500                    // Close and replace a connection after it has been used 7500 times
    } : {
        // Development settings
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
    })
});

// Add error handler
pool.on('error', (err) => {
    process.exit(-1);  // Exit on pool error in production
});

// Export pool query interface
const db = {
    query: async (text, params) => {
        const client = await pool.connect();
        try {
            const start = Date.now();
            const res = await client.query(text, params);
            const duration = Date.now() - start;
            
            return res;
        } catch (err) {
            throw err;
        } finally {
            client.release();
        }
    },
    end: () => pool.end(),
    pool: pool  // Export the pool instance
};


module.exports = db; 