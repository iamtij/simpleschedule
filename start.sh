#!/bin/bash

# Exit on error
set -e

echo "Starting application setup..."

# Function to test database connection
test_connection() {
    node -e "
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        pool.query('SELECT 1').then(() => process.exit(0)).catch(() => process.exit(1))
    " 2>/dev/null
}

# Wait for database to be ready
echo "Waiting for database..."
max_retries=30
count=0
until test_connection || [ $count -eq $max_retries ]
do
    echo "Database not ready, retrying... ($(($count + 1))/$max_retries)"
    sleep 2
    count=$((count + 1))
done

if [ $count -eq $max_retries ]; then
    echo "Error: Could not connect to database after $max_retries attempts"
    exit 1
fi

echo "Database is ready, running migrations..."
node db/migrate.js

echo "Starting application..."
exec node index.js 