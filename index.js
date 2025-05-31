require('dotenv').config();
const express = require('express');
const session = require('express-session');
const config = require('./config');
const path = require('path');

const app = express();

// Make reCAPTCHA site key available to templates
app.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;

// Session configuration
const pgSession = require('connect-pg-simple')(session);
const sessionConfig = {
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.env === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    },
    name: 'isked.sid', // Custom session cookie name
    store: new pgSession({
        conString: config.database.path,
        ssl: config.env === 'production' ? {
            rejectUnauthorized: false
        } : false,
        createTableIfMissing: true,
        pruneSessionInterval: 60
    })
};

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

// Export for Railway
module.exports = app;

// Only listen if not running on Railway
if (config.env !== 'production') {
    app.listen(config.port, () => {
        console.log(`Server is running on port ${config.port}`);
    });
} else {
    const port = process.env.PORT || 3000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server is running on port ${port}`);
    });
} 