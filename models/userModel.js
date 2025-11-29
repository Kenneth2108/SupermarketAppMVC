// models/userModel.js
const crypto = require('crypto');                      // NOTE: Used for SHA-1 hashing
const db = require('../db');                           // NOTE: MySQL connection

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}                                                      // NOTE: Hashes passwords using SHA-1

module.exports = {
  // NOW SUPPORTS twofa_enabled & twofa_secret
  createUser(                                          // NOTE: Function to insert a new user into DB
    {
      username,                                        // NOTE: Extracted from req.body (EJS form)
      email,
      password,
      address,
      contact,
      role,
      twofa_enabled = 0,                               // NOTE: Default = 0 (2FA OFF)
      twofa_secret = null                              // NOTE: Default = null (no secret stored)
    },
    callback                                           // NOTE: Callback after DB query completes
  ) {
    const hashed = sha1(password);                     // NOTE: Hash the password before storing
    db.query(
      `
      INSERT INTO users
        (username, email, password, address, contact, role, twofa_enabled, twofa_secret)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      `,                                               // NOTE: SQL insert query
      [username, email, hashed, address, contact, role, twofa_enabled, twofa_secret],
                                                       // NOTE: Values mapped into SQL
      callback                                         // NOTE: Return result to controller
    );
  },

  findByEmail(email, callback) {                       // NOTE: Fetch user by email (used in login, register)
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0] || null);                 // NOTE: Return first matching row or null
    });
  },

  getById(id, callback) {                              // NOTE: Fetch user by ID
    db.query('SELECT * FROM users WHERE id = ?', [id], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0] || null);
    });
  },

  // returns full user row (including twofa_enabled & twofa_secret)
  validateLogin(email, plainPassword, callback) {      // NOTE: Checks email + password correctness
    this.findByEmail(email, (err, user) => {
      if (err) return callback(err);
      if (!user) return callback(null, null);          // NOTE: Email not found → login fail
      const ok = user.password === sha1(plainPassword);// NOTE: Compare hashed password with DB
      callback(null, ok ? user : null);                // NOTE: Return user if valid
    });
  },

  listUsers(callback) {
    // do not expose secrets here – only basic columns
    db.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.address,
        u.contact,
        u.role,
        u.twofa_enabled,
        COUNT(DISTINCT o.id) AS orderCount
      FROM users u
      LEFT JOIN orders o ON o.userId = u.id
      GROUP BY
        u.id,
        u.username,
        u.email,
        u.address,
        u.contact,
        u.role,
        u.twofa_enabled
      ORDER BY u.id ASC
      `,
      // NOTE: Admin listing (safe columns only) + orderCount for delete protections
      callback
    );
  },

  updateUserRole(id, role, callback) {                 // NOTE: Update user role (admin/user)
    db.query('UPDATE users SET role = ? WHERE id = ?', [role, id], callback);
  },

  updateUser(id, { username, email, address, contact }, callback) {
                                                       // NOTE: Update editable profile fields
    db.query(
      'UPDATE users SET username = ?, email = ?, address = ?, contact = ? WHERE id = ?',
      [username, email, address, contact, id],
      callback
    );
  },

  deleteUser(id, callback) {                           // NOTE: Remove user from database
    db.query('DELETE FROM users WHERE id = ?', [id], callback);
  },

  countAdmins(callback) {                              // NOTE: Count admin users (ensures at least 1 admin)
    db.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'", (err, rows) => {
      if (err) return callback(err);
      const count = rows && rows[0] ? rows[0].cnt : 0; // NOTE: Safely extract count value
      callback(null, count);
    });
  },

  countOrdersByUser(userId, callback) {                // NOTE: Count how many orders belong to a user
    db.query('SELECT COUNT(*) AS cnt FROM orders WHERE userId = ?', [userId], (err, rows) => {
      if (err) return callback(err);
      const count = rows && rows[0] ? rows[0].cnt : 0;
      callback(null, count);
    });
  }
};
