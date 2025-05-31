require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Make reCAPTCHA site key available to templates
app.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session setup
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './db'
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

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
  res.status(500).render('error', { message: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 