const db = require('../db'); // Import DB connection

// -----------------------------------------------------------
// Order statuses allowed in system (used by admin + checkout)
// -----------------------------------------------------------
const ORDER_STATUSES = [
  'Pending for delivery',
  'Order delivered',
  'Order completed',
  'Order cancelled'
];

const DEFAULT_ORDER_STATUS = ORDER_STATUSES[0]; // Default = "Pending for delivery"

// -----------------------------------------------------------
// normalizeStatus()
// Makes sure a given status is valid (case-insensitive)
// If invalid → return default status
// -----------------------------------------------------------
function normalizeStatus(status) {
  if (typeof status !== 'string' || !status.trim()) return DEFAULT_ORDER_STATUS;
  const match = ORDER_STATUSES.find(
    (opt) => opt.toLowerCase() === status.trim().toLowerCase()
  );
  return match || DEFAULT_ORDER_STATUS;
}

// -----------------------------------------------------------
// formatMoney()
// Forces number to 2 decimal places — ensures consistent money format
// -----------------------------------------------------------
function formatMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

// -----------------------------------------------------------
// create()
// Inserts a new order into the database
// Used in checkoutController/cartController
// -----------------------------------------------------------
function create(userId, invoiceNumber, totals, callback) {
  const payload = totals || {};                         // Totals object from controller

  const subtotal = formatMoney(payload.subtotal);       // Subtotal amount
  const taxAmount = formatMoney(payload.taxAmount);     // Tax amount (9% etc)

  let finalTotal = Number(payload.total);               // Total including tax
  if (!Number.isFinite(finalTotal)) finalTotal = subtotal + taxAmount;
  const total = formatMoney(finalTotal);

  const normalizedStatus = normalizeStatus(payload.status || DEFAULT_ORDER_STATUS);

  db.query(
    'INSERT INTO orders (invoiceNumber, userId, subtotal, tax_amount, total, status) VALUES (?, ?, ?, ?, ?, ?)',
    [invoiceNumber, userId, subtotal, taxAmount, total, normalizedStatus],
    (err, result) => {
      if (err) return callback(err);
      return callback(null, result.insertId);           // Return new order ID
    }
  );
}

// -----------------------------------------------------------
// getOrdersByUser()
// Returns ALL orders for a given userId — used for "My Orders"
// -----------------------------------------------------------
function getOrdersByUser(userId, callback) {
  db.query(
    'SELECT id, invoiceNumber, subtotal, tax_amount AS taxAmount, total, createdAt, status FROM orders WHERE userId = ? ORDER BY createdAt ASC',
    [userId],
    callback
  );
}

// -----------------------------------------------------------
// getByUserAndId()
// Fetch one specific order *owned by the same user*
// Used when user views order details
// -----------------------------------------------------------
function getByUserAndId(userId, orderId, callback) {
  db.query(
    'SELECT id, invoiceNumber, subtotal, tax_amount AS taxAmount, total, createdAt, status FROM orders WHERE userId = ? AND id = ?',
    [userId, orderId],
    (err, rows) => {
      if (err) return callback(err);
      return callback(null, rows[0] || null);           // Return single order
    }
  );
}

// -----------------------------------------------------------
// getAll()
// Admin — returns ALL orders with user info
// -----------------------------------------------------------
function getAll(callback) {
  const sql = `
    SELECT o.id, o.invoiceNumber, o.subtotal, o.tax_amount AS taxAmount, o.total, o.createdAt, o.status, u.username, u.email
    FROM orders o
    INNER JOIN users u ON u.id = o.userId              -- join user who placed order
    ORDER BY o.createdAt ASC
  `;
  db.query(sql, callback);
}

// -----------------------------------------------------------
// getById()
// Admin — get full order details including username + email
// -----------------------------------------------------------
function getById(orderId, callback) {
  const sql = `
    SELECT o.id, o.invoiceNumber, o.subtotal, o.tax_amount AS taxAmount, o.total, o.createdAt, o.status,
           u.username, u.email, u.id AS userId
    FROM orders o
    INNER JOIN users u ON u.id = o.userId
    WHERE o.id = ?
    LIMIT 1
  `;
  db.query(sql, [orderId], (err, rows) => {
    if (err) return callback(err);
    return callback(null, rows[0] || null);
  });
}

// -----------------------------------------------------------
// deleteOrder()
// Admin — deletes a single order row
// Order items must be deleted first (handled in controller)
// -----------------------------------------------------------
function deleteOrder(orderId, callback) {
  db.query('DELETE FROM orders WHERE id = ?', [orderId], callback);
}

// -----------------------------------------------------------
// update()
// Admin — update invoice + totals + status
// Also recalculates subtotal/tax if needed
// -----------------------------------------------------------
function update(orderId, { invoiceNumber, subtotal, taxAmount, total, status }, callback) {
  const normalizedStatus = normalizeStatus(status); // Validate status

  // If subtotal not valid, fallback to total or 0
  const safeSubtotal = formatMoney(typeof subtotal === 'number' ? subtotal : total);

  // If tax missing → default 0
  const safeTaxAmount = formatMoney(typeof taxAmount === 'number' ? taxAmount : 0);

  // Ensure final total valid
  const safeTotal = formatMoney(
    typeof total === 'number'
      ? total
      : safeSubtotal + safeTaxAmount
  );

  db.query(
    'UPDATE orders SET invoiceNumber = ?, subtotal = ?, tax_amount = ?, total = ?, status = ? WHERE id = ?',
    [invoiceNumber, safeSubtotal, safeTaxAmount, safeTotal, normalizedStatus, orderId],
    callback
  );
}

// -----------------------------------------------------------
// Export everything
// -----------------------------------------------------------
module.exports = {
  STATUSES: ORDER_STATUSES,       // Export available statuses
  DEFAULT_STATUS: DEFAULT_ORDER_STATUS,
  normalizeStatus,                // Helper
  create,                         // Insert new order
  getOrdersByUser,                // User's orders
  getByUserAndId,                 // User-specific order
  getAll,                         // Admin all orders
  getById,                        // Admin order by ID
  delete: deleteOrder,            // Delete order
  update                          // Update order
};
