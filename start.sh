#!/bin/bash

# Wait for database to be ready
echo "Waiting for database..."
while ! node -e "
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
pool.query('SELECT 1').then(() => process.exit(0)).catch(() => process.exit(1))
" 2>/dev/null; do
    echo "Database not ready, retrying in 5 seconds..."
    sleep 5
done

echo "Database is ready, running migrations..."
npm run migrate

echo "Starting application..."
node index.js 