const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

// Start transaction
db.serialize(() => {
  // Add username column
  db.run(`ALTER TABLE users ADD COLUMN username TEXT`);
  
  // Generate unique usernames for existing users based on their names
  db.all(`SELECT id, name, email FROM users`, [], (err, users) => {
    if (err) {
      console.error('Error fetching users:', err);
      process.exit(1);
    }

    users.forEach(user => {
      // Generate username from email (everything before @)
      const baseUsername = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
      
      // Update user with new username
      db.run(`UPDATE users SET username = ? WHERE id = ?`, [baseUsername, user.id]);
    });

    // Make username column NOT NULL and UNIQUE
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    
    console.log('Migration completed successfully');
    db.close();
  });
}); 