require('dotenv').config();

module.exports = {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    database: {
        path: process.env.DATABASE_URL || `postgresql://isked:isked_dev@localhost:5432/isked_dev`,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your-secret-key'
    },
    recaptcha: {
        siteKey: process.env.RECAPTCHA_SITE_KEY,
        secretKey: process.env.RECAPTCHA_SECRET_KEY
    }
}; 