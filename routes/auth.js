const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../db/database.sqlite'), (err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to the database');
  }
});

// Register page
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Register POST
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.render('register', { error: 'All fields are required' });
  }

  try {
    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, existingUser) => {
      if (err) {
        console.error(err);
        return res.render('register', { error: 'Database error' });
      }

      if (existingUser) {
        return res.render('register', { error: 'Email already registered' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert new user
      db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword],
        function(err) {
          if (err) {
            console.error(err);
            return res.render('register', { error: 'Error creating account' });
          }

          req.session.userId = this.lastID;
          res.redirect('/dashboard');
        }
      );
    });
  } catch (error) {
    console.error(error);
    res.render('register', { error: 'Error creating account' });
  }
});

// Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.render('login', { error: 'Email and password are required' });
  }

  try {
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error(err);
        return res.render('login', { error: 'Database error' });
      }
      
      if (!user) {
        return res.render('login', { error: 'Invalid email or password' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.render('login', { error: 'Invalid email or password' });
      }

      req.session.userId = user.id;
      res.redirect('/dashboard');
    });
  } catch (error) {
    console.error(error);
    res.render('login', { error: 'An error occurred' });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/');
  });
});

module.exports = router; 