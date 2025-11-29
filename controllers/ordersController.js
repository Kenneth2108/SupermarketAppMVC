// controllers/ordersController.js
// ---------------------------------------------------------------
// This controller handles displaying a user's order history.
// It uses orderModel to fetch orders from the database.
// It also ensures every order has a valid status, defaulting to
// "Pending for delivery" if status is empty.
// ---------------------------------------------------------------

const orderModel = require('../models/orderModel'); // Handles DB queries for orders

// ---------------------------------------------------------------
// DEFAULT ORDER STATUS
//
// orderModel may export DEFAULT_STATUS.
// If it does, use that. Otherwise, fall back to "Pending for delivery".
// ---------------------------------------------------------------
const DEFAULT_ORDER_STATUS = orderModel.DEFAULT_STATUS || 'Pending for delivery';

// ---------------------------------------------------------------
// Helper: withDefaultStatus(order)
//
// Ensures that every order object returned from DB has a "status" field.
// If order.status exists → return order unchanged.
// If missing → set status = DEFAULT_ORDER_STATUS.
// ---------------------------------------------------------------
function withDefaultStatus(order = {}) {
  // If order is not an object, return an object with only default status
  if (!order || typeof order !== 'object') {
    return { status: DEFAULT_ORDER_STATUS };
  }

  // If DB already returned a status for this order, leave it as is
  if (order.status) return order;

  // Otherwise override with default
  return { ...order, status: DEFAULT_ORDER_STATUS };
}

// ---------------------------------------------------------------
// Helper: view(res, templateName, data)
//
// Wrapper for res.render() that always injects
// the logged-in user from res.locals.user.
// ---------------------------------------------------------------
function view(res, name, data = {}) {
  return res.render(name, {
    ...data,
    user: res.locals.user // allows <%= user %> in EJS
  });
}

module.exports = {
  // -------------------------------------------------------------
  // LIST USER'S ORDERS (User-facing)
  //
  // Steps:
  // 1. Read the user's ID from session (must be logged in).
  // 2. orderModel.getOrdersByUser(userId) to load user's orders.
  // 3. Apply withDefaultStatus() to each order.
  // 4. Render "orders.ejs" with the list.
  // -------------------------------------------------------------
  list(req, res) {
    const userId = req.session.user.id; // logged-in user's ID

    // Fetch user’s order history from DB
    orderModel.getOrdersByUser(userId, (err, rows = []) => {
      if (err) {
        return res.status(500).send('Database error');
      }

      // Ensure every order has a status
      const orders = rows.map(withDefaultStatus);

      // Render "orders.ejs"
      return view(res, 'orders', { orders });
    });
  }
};
