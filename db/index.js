const config = require('../config');
const { Pool } = require('pg');

// PostgreSQL configuration
const pool = new Pool({
    connectionString: config.database.path,
    ssl: config.env === 'production' ? {
        rejectUnauthorized: false
    } : false,
    // Optimize for serverless in production
    ...(config.env === 'production' ? {
        max: 1,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000
    } : {})
});

// Add error handler
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Export pool query interface
const db = {
    query: async (text, params) => {
        const client = await pool.connect();
        try {
            return await client.query(text, params);
        } finally {
            client.release();
        }
    },
    end: () => pool.end()
};

console.log(`PostgreSQL pool initialized for ${config.env} environment`);

module.exports = db; 