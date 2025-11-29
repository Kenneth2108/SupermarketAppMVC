// models/productModel.js
const db = require('../db'); // Import MySQL database connection pool

module.exports = {
  // -------------------------------------------------------------
  // getAll()
  // Fetch ALL products from the database (used for inventory & shopping)
  // -------------------------------------------------------------
  getAll(callback) {
    db.query(
      'SELECT id, productName, quantity, price, image FROM products ORDER BY id',
      callback
    );
  },

  // -------------------------------------------------------------
  // getById()
  // Fetch ONE product by ID — used for editing, product details, add to cart
  // -------------------------------------------------------------
  getById(id, callback) {
    db.query(
      'SELECT id, productName, quantity, price, image FROM products WHERE id = ?',
      [id],                          // ID passed as parameter
      (err, rows) => {
        if (err) return callback(err);
        callback(null, rows[0] || null); // Return first row or null if no product
      }
    );
  },

  // -------------------------------------------------------------
  // create()
  // Insert a new product into the database — used by admin Add Product
  // -------------------------------------------------------------
  create({ productName, quantity, price, image }, callback) {
    db.query(
      'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)',
      [productName, quantity, price, image],
      callback
    );
  },

  // -------------------------------------------------------------
  // update()
  // Update product details — used in admin Edit Product
  // -------------------------------------------------------------
  update(id, { productName, quantity, price, image }, callback) {
    db.query(
      'UPDATE products SET productName=?, quantity=?, price=?, image=? WHERE id=?',
      [productName, quantity, price, image, id],
      callback
    );
  },

  // -------------------------------------------------------------
  // remove()
  // Delete a product — used by admin Delete Product
  // -------------------------------------------------------------
  remove(id, callback) {
    db.query('DELETE FROM products WHERE id=?', [id], callback);
  },

  // -------------------------------------------------------------
  // decreaseQuantities()
  // Reduces stock after successful checkout:
  //   quantity = quantity - orderedQuantity
  // Uses GREATEST() to ensure quantity never goes < 0
  // -------------------------------------------------------------
  decreaseQuantities(items, callback) {
    if (!items || !items.length) return callback(null); // Nothing to update

    let remaining = items.length; // Track async queries
    let error = null;

    items.forEach((item) => {
      const qty = Number(item.quantity) || 0; // Ordered quantity

      if (qty <= 0) {
        // If item qty invalid or zero, just proceed to next
        if (--remaining === 0 && !error) callback(null);
      } else {
        // Update product stock safely
        db.query(
          'UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?',
          [qty, item.id],
          (err) => {
            if (err && !error) error = err; // Store first error only
            if (--remaining === 0) callback(error); // When all queries finish
          }
        );
      }
    });
  }
};
