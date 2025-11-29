// models/orderItemModel.js
// ---------------------------------------------------------------
// This model handles all DB operations for items belonging to an order.
// It assumes an `order_items` table with columns:
//   - orderId      (FK to orders.id)
//   - productId    (FK to products.id)
//   - productName  (snapshot of name at time of purchase)
//   - unitPrice    (snapshot of price at time of purchase)
//   - quantity
//   - subtotal     (unitPrice * quantity)
//
// Used by:
//   - checkout flow (to save purchased items)
//   - order details (to display past order contents)
//   - admin order management (to view / delete orders)
// ---------------------------------------------------------------

const db = require('../db'); // MySQL connection

module.exports = {
  // -------------------------------------------------------------
  // createMany(orderId, items, callback)
  //
  // Bulk inserts many order items for a single order:
  //   - orderId  → ID of the order in the orders table
  //   - items    → array of cart-like objects:
  //                { id, productName, price, quantity, ... }
  //
  // Steps:
  // 1) If items array is empty, just callback with no error.
  // 2) Map items into rows:
  //      [orderId, productId, productName, unitPrice, quantity, subtotal]
  // 3) Use single INSERT ... VALUES ? bulk insert for efficiency.
  //
  // Requires `order_items` schema:
  //   orderId, productId, productName, unitPrice, quantity, subtotal
  // -------------------------------------------------------------
  createMany(orderId, items, callback) {
    // If there are no items, nothing to insert
    if (!items.length) return callback(null);

    // Build rows for bulk insert: one row per item
    const rows = items.map((item) => [
      orderId,                               // orderId (FK to orders.id)
      item.id,                               // productId
      item.productName,                      // snapshot of product name
      item.price,                            // unit price at time of purchase
      item.quantity,                         // quantity bought
      item.price * item.quantity             // subtotal = unitPrice * quantity
    ]);

    const sql = `
      INSERT INTO order_items
        (orderId, productId, productName, unitPrice, quantity, subtotal)
      VALUES ?
    `;

    // Insert all rows in a single query
    db.query(sql, [rows], callback);
  },

  // -------------------------------------------------------------
  // getByOrder(orderId, callback)
  //
  // Fetches all items for a given orderId from order_items.
  // Returns fields:
  //   - productId
  //   - productName
  //   - unitPrice
  //   - quantity
  //   - subtotal
  //
  // Used when displaying order details for user or admin.
  // -------------------------------------------------------------
  getByOrder(orderId, callback) {
    db.query(
      'SELECT productId, productName, unitPrice, quantity, subtotal FROM order_items WHERE orderId = ?',
      [orderId],
      callback
    );
  },

  // -------------------------------------------------------------
  // deleteByOrder(orderId, callback)
  //
  // Deletes all order_items rows belonging to a given orderId.
  // Typically used when admin deletes an order entirely.
  // -------------------------------------------------------------
  deleteByOrder(orderId, callback) {
    db.query(
      'DELETE FROM order_items WHERE orderId = ?',
      [orderId],
      callback
    );
  }
};
