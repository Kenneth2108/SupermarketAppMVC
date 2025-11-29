// models/cartModel.js
// ---------------------------------------------------------------
// This model handles all database operations for the user's cart.
// It assumes a `cart_items` table with columns:
//   - id (PK, auto-increment)     [optional but commonly present]
//   - userId (FK to users.id)
//   - productId (FK to products.id)
//   - quantity (int)
//
// It also joins to `products` to get productName, price, and image.
// ---------------------------------------------------------------

const db = require('../db'); // MySQL connection pool/instance

const cartModel = {
  // -------------------------------------------------------------
  // getCartItems(userId, callback)
  //
  // Returns all cart items for a given user, including:
  //   - id          → productId
  //   - quantity    → quantity in cart
  //   - productName → from products table
  //   - price       → from products table
  //   - image       → from products table
  //
  // The results are ordered by cart_items.id ASC for stable display.
  // -------------------------------------------------------------
  getCartItems(userId, callback) {
    const sql = `
      SELECT
        ci.productId AS id,  -- we expose productId as "id" for convenience
        ci.quantity,
        p.productName,
        p.price,
        p.image
      FROM cart_items ci
      INNER JOIN products p ON p.id = ci.productId
      WHERE ci.userId = ?
      ORDER BY ci.id ASC
    `;
    db.query(sql, [userId], callback);
  },

  // -------------------------------------------------------------
  // getItemQuantity(userId, productId, callback)
  //
  // Looks up the quantity of a specific product in the user's cart.
  // If no row exists, quantity is treated as 0.
  //
  // callback signature: (err, quantityNumber)
  // -------------------------------------------------------------
  getItemQuantity(userId, productId, callback) {
    db.query(
      'SELECT quantity FROM cart_items WHERE userId = ? AND productId = ?',
      [userId, productId],
      (err, rows) => {
        if (err) return callback(err);

        // If row exists, parse quantity; else default to 0
        const qty = rows[0] ? Number(rows[0].quantity) : 0;
        callback(null, qty);
      }
    );
  },

  // -------------------------------------------------------------
  // setQuantity(userId, productId, quantity, callback)
  //
  // Upserts the quantity of a given product in the user's cart:
  // - If quantity <= 0 → removes the item from the cart.
  // - Else:
  //     INSERT ... ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
  //
  // This requires a UNIQUE KEY on (userId, productId) in cart_items so
  // that ON DUPLICATE KEY works as expected.
  // -------------------------------------------------------------
  setQuantity(userId, productId, quantity, callback) {
    // If quantity is zero or negative, just remove the item from cart
    if (quantity <= 0) {
      return cartModel.removeItem(userId, productId, callback);
    }

    const sql = `
      INSERT INTO cart_items (userId, productId, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
    `;
    db.query(sql, [userId, productId, quantity], callback);
  },

  // -------------------------------------------------------------
  // removeItem(userId, productId, callback)
  //
  // Deletes a single cart row for the given user + product.
  // -------------------------------------------------------------
  removeItem(userId, productId, callback) {
    db.query(
      'DELETE FROM cart_items WHERE userId = ? AND productId = ?',
      [userId, productId],
      callback
    );
  },

  // -------------------------------------------------------------
  // clearCart(userId, callback)
  //
  // Removes ALL cart items for the specified user.
  // Used after checkout or when user clicks "Clear Cart".
  // -------------------------------------------------------------
  clearCart(userId, callback) {
    db.query('DELETE FROM cart_items WHERE userId = ?', [userId], callback);
  }
};

module.exports = cartModel;
