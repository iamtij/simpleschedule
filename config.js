require('dotenv').config();

module.exports = {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    database: {
        path: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your-secret-key'
    },
    recaptcha: {
        siteKey: process.env.RECAPTCHA_SITE_KEY,
        secretKey: process.env.RECAPTCHA_SECRET_KEY
    }
}; 