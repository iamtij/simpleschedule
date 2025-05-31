require('dotenv').config();
const express = require('express');
const session = require('express-session');
const config = require('./config');
const path = require('path');

const app = express();

// Make reCAPTCHA site key available to templates
app.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;

// Session configuration
let sessionConfig = {
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.env === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    },
    name: 'isked.sid' // Custom session cookie name
};

if (config.env === 'production') {
    // Use PostgreSQL session store in production
    const pgSession = require('connect-pg-simple')(session);
    sessionConfig.store = new pgSession({
        conString: config.database.path,
        ssl: {
            rejectUnauthorized: false
        },
        createTableIfMissing: true,
        pruneSessionInterval: 60
    });
} else {
    // Use SQLite session store in development
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionConfig.store = new SQLiteStore({ db: 'db/sessions.db' });
}

app.use(session(sessionConfig));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// Mount routes
app.use('/auth', authRoutes);
app.use('/booking', bookingRoutes);
app.use('/dashboard', dashboardRoutes);

// Home route
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: null });
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

// Export for Vercel
module.exports = app;

// Only listen if not running on Vercel
if (config.env !== 'production') {
    app.listen(config.port, () => {
        console.log(`Server is running on port ${config.port}`);
    });
} 