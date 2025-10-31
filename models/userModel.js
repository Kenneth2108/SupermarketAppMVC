// models/userModel.js
const mysql = require('mysql2');
const crypto = require('crypto');
require('dotenv').config();

// Create a small pool using your .env
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

module.exports = {
  createUser({ username, email, password, address, contact, role }, callback) {
    const hashed = sha1(password);
    db.query(
      'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashed, address, contact, role],
      callback
    );
  },

  findByEmail(email, callback) {
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0] || null);
    });
  },

  getById(id, callback) {
    db.query('SELECT * FROM users WHERE id = ?', [id], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0] || null);
    });
  },

  validateLogin(email, plainPassword, callback) {
    this.findByEmail(email, (err, user) => {
      if (err) return callback(err);
      if (!user) return callback(null, null);
      const ok = user.password === sha1(plainPassword);
      callback(null, ok ? user : null);
    });
  },

  listUsers(callback) {
    db.query('SELECT id, username, email, address, contact, role FROM users ORDER BY id ASC', callback);
  },

  updateUserRole(id, role, callback) {
    db.query('UPDATE users SET role = ? WHERE id = ?', [role, id], callback);
  },

  deleteUser(id, callback) {
    db.query('DELETE FROM users WHERE id = ?', [id], callback);
  },

  countAdmins(callback) {
    db.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'", (err, rows) => {
      if (err) return callback(err);
      const count = rows && rows[0] ? rows[0].cnt : 0;
      callback(null, count);
    });
  }
};
