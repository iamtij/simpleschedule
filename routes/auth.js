const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const config = require('../config');

const db = new sqlite3.Database(path.join(__dirname, '../db/database.sqlite'), (err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to the database');
  }
});

// Register page
router.get('/register', (req, res) => {
  res.render('register', { error: null, recaptchaSiteKey: config.recaptcha.siteKey });
});

// Login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Register POST
router.post('/register', async (req, res) => {
  const { name, username, email, password, 'confirm-password': confirmPassword, 'g-recaptcha-response': recaptchaResponse } = req.body;
  
  try {
    // Validate required fields
    if (!name || !username || !email || !password || !confirmPassword) {
      return res.render('register', { error: 'All fields are required', recaptchaSiteKey: config.recaptcha.siteKey });
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return res.render('register', { 
        error: 'Username can only contain letters, numbers, underscores and hyphens',
        recaptchaSiteKey: config.recaptcha.siteKey 
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.render('register', { error: 'Passwords do not match', recaptchaSiteKey: config.recaptcha.siteKey });
    }

    // Verify reCAPTCHA
    if (!recaptchaResponse) {
      return res.render('register', { error: 'Please complete the reCAPTCHA', recaptchaSiteKey: config.recaptcha.siteKey });
    }

    // Verify reCAPTCHA with Google
    const recaptchaVerification = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: config.recaptcha.secretKey,
          response: recaptchaResponse
        }
      }
    );

    if (!recaptchaVerification.data.success) {
      return res.render('register', { error: 'reCAPTCHA verification failed', recaptchaSiteKey: config.recaptcha.siteKey });
    }

    // Check if user already exists (email or username)
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    if (existingUser) {
      return res.render('register', { 
        error: 'Email or username already taken', 
        recaptchaSiteKey: config.recaptcha.siteKey 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const userId = await new Promise((resolve, reject) => {
      db.run('INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)',
        [name, username, email, hashedPassword],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Set session and redirect
    req.session.userId = userId;
    return res.redirect('/dashboard');

  } catch (error) {
    console.error('Registration error:', error);
    return res.render('register', { 
      error: 'Error creating account. Please try again.',
      recaptchaSiteKey: config.recaptcha.siteKey 
    });
  }
});

// Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.render('login', { error: 'Email and password are required' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    if (!user) {
      return res.render('login', { error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: 'Invalid email or password' });
    }

    req.session.userId = user.id;
    return res.redirect('/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    return res.render('login', { error: 'An error occurred. Please try again.' });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

module.exports = router; 