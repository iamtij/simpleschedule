const config = require('./config');

console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not set',
    config_env: config.env,
    config_database_path: config.database.path
}); 