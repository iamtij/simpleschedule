require('dotenv').config();
const express = require('express');
const session = require('express-session');
const config = require('./config');
const path = require('path');

const app = express();

// Production security headers
if (config.env === 'production') {
    app.set('trust proxy', 1); // Trust first proxy
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });
}

// Make reCAPTCHA site key available to templates
app.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;

// Session configuration
const pgSession = require('connect-pg-simple')(session);
const sessionConfig = {
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.env === 'production', // Require HTTPS in production
        httpOnly: true,                      // Prevent XSS
        maxAge: 24 * 60 * 60 * 1000,        // 24 hours
        sameSite: config.env === 'production' ? 'strict' : 'lax'
    },
    name: 'isked.sid',                      // Custom session cookie name
    proxy: config.env === 'production',      // Trust the reverse proxy
    store: new pgSession({
        conString: config.database.path,
        ssl: config.env === 'production' ? {
            rejectUnauthorized: false
        } : false,
        createTableIfMissing: true,
        pruneSessionInterval: 60,
        // Clean up expired sessions
        pruneSessionInterval: 24 * 60 // Once per day
    })
};

app.use(session(sessionConfig));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json({ limit: '10mb' }));  // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));  // Limit form data size
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: config.env === 'production' ? '1d' : 0  // Cache static files in production
}));

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: config.env === 'production' ? 'Internal server error' : err.message
    });
});

// Routes
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/booking');
const dashboardRoutes = require('./routes/dashboard');
const testRoutes = require('./routes/test');
const adminRoutes = require('./routes/admin');
const googleAuthRoutes = require('./routes/googleAuth');

// Mount routes
app.use('/auth', authRoutes);
app.use('/booking', bookingRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/test', testRoutes);
app.use('/admin', adminRoutes);
app.use('/', googleAuthRoutes); // Google auth routes are mounted at root level

// Home route
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.render('landing');
    }
});

// Handle 404
app.use((req, res) => {
    res.status(404).render('error', { message: 'Page not found' });
});

// Handle errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        message: config.env === 'production' 
            ? 'Something went wrong!' 
            : err.message 
    });
});

// Export for Railway
module.exports = app;

// Start server
const port = process.env.PORT || config.port;
app.listen(port, '0.0.0.0');
    // console.log(`Server is running in ${config.env} mode on port ${port}`); 