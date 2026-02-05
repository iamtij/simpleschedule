const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/payment-proofs/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, JPG, PNG, GIF) and PDF files are allowed'));
    }
  }
});

// Upgrade page route
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // Validate token and get user
    const result = await db.query(
      'SELECT id, email, username, full_name, display_name FROM users WHERE upgrade_token = $1 AND upgrade_token_expiry > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.render('error', {
        message: 'Invalid or expired upgrade link. Please contact support if you need assistance.'
      });
    }

    const user = result.rows[0];

    // Check if monthly subscription is enabled (from system settings or default)
    let monthlySubscriptionEnabled = false;
    try {
      const settingsResult = await db.query(
        'SELECT setting_value FROM system_settings WHERE setting_key = $1',
        ['monthly_subscription_enabled']
      );
      monthlySubscriptionEnabled = settingsResult.rows.length > 0 
        ? settingsResult.rows[0].setting_value === 'true' 
        : false;
    } catch (settingsError) {
      // If system_settings table doesn't exist or query fails, default to false
      console.error('Error checking monthly subscription setting:', settingsError);
      monthlySubscriptionEnabled = false;
    }

    res.render('upgrade', {
      user,
      token,
      monthlySubscriptionEnabled
    });
  } catch (error) {
    console.error('Error loading upgrade page:', error);
    res.render('error', {
      message: 'An error occurred. Please try again later.'
    });
  }
});

// Handle payment proof submission with token
router.post('/:token/payment-proof', upload.single('proof'), async (req, res) => {
  const { token } = req.params;
  const { planType } = req.body;

  if (!planType || !['monthly', 'yearly'].includes(planType)) {
    return res.status(400).json({ success: false, error: 'Invalid plan type' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Payment proof file is required' });
  }

  try {
    // Validate token and get user
    const userResult = await db.query(
      'SELECT id, email, username, full_name, display_name FROM users WHERE upgrade_token = $1 AND upgrade_token_expiry > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const user = userResult.rows[0];

    // Determine plan price
    const planPrice = planType === 'monthly' ? 'PHP 499' : 'PHP 4,788';

    // Save payment proof
    const proofResult = await db.query(
      `INSERT INTO payment_proofs (user_id, plan_type, file_path, original_filename, file_size, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
       RETURNING id`,
      [user.id, planType, req.file.path, req.file.originalname, req.file.size]
    );

    // Send notification email to admin
    const mailService = require('../services/mail');
    try {
      await mailService.sendPaymentProof(
        user,
        planType,
        planPrice,
        req.file.path,
        req.file.originalname
      );
    } catch (emailError) {
      console.error('Error sending payment proof email:', emailError);
      // Continue even if email fails
    }

    // Optionally clear/expire the upgrade token after submission
    // await db.query(
    //   'UPDATE users SET upgrade_token = NULL, upgrade_token_expiry = NULL WHERE id = $1',
    //   [user.id]
    // );

    res.json({
      success: true,
      message: 'Payment proof submitted successfully! We will review it and activate your Pro subscription shortly.'
    });
  } catch (error) {
    console.error('Error submitting payment proof:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'An error occurred while submitting your payment proof. Please try again.'
    });
  }
});

module.exports = router;

