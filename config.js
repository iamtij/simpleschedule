module.exports = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    database: {
        path: process.env.NODE_ENV === 'production' 
            ? process.env.DATABASE_URL 
            : './db/database.sqlite'
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    },
    recaptcha: {
        siteKey: process.env.RECAPTCHA_SITE_KEY || 'your-site-key',
        secretKey: process.env.RECAPTCHA_SECRET_KEY || 'your-secret-key'
    }
}; 