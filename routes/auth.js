const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const config = require('../config');
const db = require('../db');
const axios = require('axios');

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
    const existingUserResult = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUserResult.rows.length > 0) {
      return res.render('register', { 
        error: 'Email or username already taken', 
        recaptchaSiteKey: config.recaptcha.siteKey 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const result = await db.query(
      'INSERT INTO users (name, username, email, password) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, username, email, hashedPassword]
    );

    // Set session and redirect
    req.session.userId = result.rows[0].id;
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
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

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