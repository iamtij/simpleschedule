const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const config = require('../config');
const db = require('../db');
const axios = require('axios');
const crypto = require('crypto');
const mailService = require('../services/mail');
const Coupon = require('../models/Coupon');

// Register page
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Login page
router.get('/login', (req, res) => {
  const successMessage = req.session.successMessage;
  delete req.session.successMessage; // Clear the message after use
  res.render('login', { error: null, successMessage });
});

// Register POST
router.post('/register', async (req, res) => {
  const { name: full_name, username, email, password, 'confirm-password': confirmPassword, 'coupon-code': couponCode } = req.body;
  
  try {
    // Validate required fields
    if (!full_name || !username || !email || !password || !confirmPassword || !couponCode) {
      return res.render('register', { error: 'All fields are required' });
    }

    // Validate coupon code
    const couponValidation = await Coupon.validateCode(couponCode);
    if (!couponValidation.valid) {
      return res.render('register', { error: couponValidation.message });
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return res.render('register', { 
        error: 'Username can only contain letters, numbers, underscores and hyphens'
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.render('register', { error: 'Passwords do not match' });
    }

    // Check if user already exists (email or username)
    const existingUserResult = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUserResult.rows.length > 0) {
      return res.render('register', { 
        error: 'Email or username already taken'
      });
    }

    // Start transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      const result = await client.query(
        'INSERT INTO users (full_name, username, email, password) VALUES ($1, $2, $3, $4) RETURNING id',
        [full_name, username, email, hashedPassword]
      );

      // Record coupon usage
      await Coupon.useCoupon(couponValidation.coupon.id, result.rows[0].id, client);

      await client.query('COMMIT');

      // Set session and redirect
      req.session.userId = result.rows[0].id;
      req.session.user = {
        id: result.rows[0].id,
        email: email,
        is_admin: false
      };

      // Send welcome email
      try {
        await mailService.sendWelcomeEmail({
          name: full_name,
          email: email
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail registration if email fails
      }

      return res.redirect('/dashboard');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Registration error:', error);
    return res.render('register', { 
      error: 'Error creating account. Please try again.'
    });
  }
});

// Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('Login attempt for email:', email);
  
  if (!email || !password) {
    console.log('Missing email or password');
    return res.render('login', { error: 'Email and password are required' });
  }

  try {
    console.log('Querying database for user...');
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log('Database query result:', { found: result.rows.length > 0 });

    const user = result.rows[0];
    if (!user) {
      console.log('User not found');
      return res.render('login', { error: 'Invalid email or password' });
    }

    // Check if user account is inactive
    if (!user.status) {
      console.log('Inactive account');
      return res.render('login', { error: 'Your account is inactive. Please contact support.' });
    }

    console.log('Comparing passwords...');
    const validPassword = await bcrypt.compare(password, user.password);
    console.log('Password validation result:', validPassword);

    if (!validPassword) {
      console.log('Invalid password');
      return res.render('login', { error: 'Invalid email or password' });
    }

    // Update last_login timestamp
    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Store full user object in session
    req.session.user = {
      id: user.id,
      email: user.email,
      is_admin: user.is_admin
    };
    req.session.userId = user.id; // Also set userId for backward compatibility
    console.log('Session created:', { userId: user.id, email: user.email });
    
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

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { error: null, success: null });
});

// Handle forgot password request
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Check if user exists
        const result = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.render('forgot-password', { 
                error: 'If an account exists with this email, you will receive a password reset link', 
                success: null 
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

        // Save reset token in database
        await db.query(
            'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3',
            [resetToken, resetTokenExpiry, email]
        );

        // Send reset email
        await mailService.sendPasswordResetEmail(email, resetToken);

        res.render('forgot-password', {
            error: null,
            success: 'Password reset instructions have been sent to your email'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.render('forgot-password', { 
            error: 'An error occurred. Please try again.', 
            success: null 
        });
    }
});

// Reset password page
router.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        // Check if token is valid and not expired
        const result = await db.query(
            'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.render('reset-password', { 
                error: 'Invalid or expired reset link. Please request a new one.',
                token: null
            });
        }

        res.render('reset-password', { error: null, token });
    } catch (error) {
        console.error('Reset password error:', error);
        res.render('reset-password', { 
            error: 'An error occurred. Please try again.',
            token: null
        });
    }
});

// Handle password reset
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        // Check if token is valid and not expired
        const result = await db.query(
            'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.render('reset-password', { 
                error: 'Invalid or expired reset link. Please request a new one.',
                token: null
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password and clear reset token
        await db.query(
            'UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = $2',
            [hashedPassword, token]
        );

        // Set success message and redirect to login
        req.session.successMessage = 'Your password has been successfully reset. Please log in with your new password.';
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Reset password error:', error);
        res.render('reset-password', { 
            error: 'An error occurred. Please try again.',
            token
        });
    }
});

module.exports = router; 