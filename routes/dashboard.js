const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
};

// Dashboard home
router.get('/', requireLogin, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err) {
      return res.redirect('/');
    }
    db.all('SELECT * FROM bookings WHERE user_id = ? ORDER BY date, start_time', [req.session.userId], (err, bookings) => {
      res.render('dashboard', { user, bookings: bookings || [] });
    });
  });
});

// Get availability
router.get('/availability', requireLogin, (req, res) => {
  db.all('SELECT * FROM availability WHERE user_id = ?', [req.session.userId], (err, availability) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch availability' });
    }
    db.all('SELECT * FROM breaks WHERE user_id = ?', [req.session.userId], (err, breaks) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch breaks' });
      }
      res.json({ availability, breaks });
    });
  });
});

// Update availability
router.post('/availability', requireLogin, (req, res) => {
  const { availability, breaks } = req.body;
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM availability WHERE user_id = ?', [req.session.userId], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to update availability' });
      }

      db.run('DELETE FROM breaks WHERE user_id = ?', [req.session.userId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to update availability' });
        }

        const availStmt = db.prepare('INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)');
        const breakStmt = db.prepare('INSERT INTO breaks (user_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)');

        try {
          availability.forEach(a => {
            availStmt.run(req.session.userId, a.day_of_week, a.start_time, a.end_time);
          });

          breaks.forEach(b => {
            breakStmt.run(req.session.userId, b.day_of_week, b.start_time, b.end_time);
          });

          availStmt.finalize();
          breakStmt.finalize();

          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to update availability' });
            }
            res.json({ success: true });
          });
        } catch (error) {
          db.run('ROLLBACK');
          res.status(500).json({ error: 'Failed to update availability' });
        }
      });
    });
  });
});

// Get bookings
router.get('/bookings', requireLogin, (req, res) => {
  db.all(`
    SELECT * FROM bookings 
    WHERE user_id = ? 
    AND date >= date('now')
    ORDER BY date, start_time
  `, [req.session.userId], (err, bookings) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // Format bookings for FullCalendar
    const events = bookings.map(booking => ({
      id: booking.id,
      title: `${booking.client_name}`,
      start: `${booking.date}T${booking.start_time.split(' ')[0]}`,
      end: `${booking.date}T${booking.end_time.split(' ')[0]}`,
      extendedProps: {
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        notes: booking.notes,
        start_time: booking.start_time,
        end_time: booking.end_time
      }
    }));

    res.json(events);
  });
});

// Delete booking
router.delete('/bookings/:id', requireLogin, (req, res) => {
  const bookingId = req.params.id;
  
  // First check if the booking belongs to the logged-in user
  db.get('SELECT user_id FROM bookings WHERE id = ?', [bookingId], (err, booking) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to verify booking' });
    }
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    if (booking.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this booking' });
    }
    
    // Delete the booking
    db.run('DELETE FROM bookings WHERE id = ?', [bookingId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete booking' });
      }
      res.json({ success: true });
    });
  });
});

module.exports = router; 