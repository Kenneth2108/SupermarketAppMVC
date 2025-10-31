// models/productModel.js
const mysql = require('mysql2');
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

module.exports = {
  getAll(callback) {
    db.query(
      'SELECT id, productName, quantity, price, image FROM products ORDER BY id',
      callback
    );
  },

  getById(id, callback) {
    db.query(
      'SELECT id, productName, quantity, price, image FROM products WHERE id = ?',
      [id],
      (err, rows) => {
        if (err) return callback(err);
        callback(null, rows[0] || null);
      }
    );
  },

  create({ productName, quantity, price, image }, callback) {
    db.query(
      'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)',
      [productName, quantity, price, image],
      callback
    );
  },

  update(id, { productName, quantity, price, image }, callback) {
    db.query(
      'UPDATE products SET productName=?, quantity=?, price=?, image=? WHERE id=?',
      [productName, quantity, price, image, id],
      callback
    );
  },

  remove(id, callback) {
    db.query('DELETE FROM products WHERE id=?', [id], callback);
  }
};
