// controllers/adminOrdersController.js
// ---------------------------------------------------------------
// This controller is for ADMIN order management:
// - List all orders (admin overview)
// - View details of any order (using the checkout view as read-only invoice)
// - Delete orders
// - Edit/update order invoice & status
//
// Uses:
//   orderModel      → orders table
//   orderItemModel  → order_items table
//
// It also:
// - Applies a default status to orders if status is missing
// - Recalculates subtotal + tax based on edited total
// ---------------------------------------------------------------

const orderModel = require('../models/orderModel');
const orderItemModel = require('../models/orderItemModel');

// ---------------------------------------------------------------
// STATUS OPTIONS & DEFAULTS
//
// orderModel.STATUSES (if provided) is used as the list of valid statuses.
// If not present, we fall back to a hard-coded list.
// DEFAULT_ORDER_STATUS is taken from orderModel.DEFAULT_STATUS if present,
// otherwise the first entry from STATUS_OPTIONS.
// ---------------------------------------------------------------
const STATUS_OPTIONS = orderModel.STATUSES || [
  'Pending for delivery',
  'Order delivered',
  'Order completed',
  'Order cancelled'
];

const DEFAULT_ORDER_STATUS = orderModel.DEFAULT_STATUS || STATUS_OPTIONS[0];

// Tax rate used when recalculating subtotal and tax from a total
const TAX_RATE = 0.09;

// ---------------------------------------------------------------
// Helper: withDefaultStatus(order)
//
// Ensures every order object has a "status" field.
// - If order is falsy or not an object → returns object with only default status.
// - If order.status is already set → returns the original order.
// - Otherwise → returns a shallow copy of order with status = DEFAULT_ORDER_STATUS.
// ---------------------------------------------------------------
function withDefaultStatus(order = {}) {
  if (!order || typeof order !== 'object') {
    return { status: DEFAULT_ORDER_STATUS };
  }
  if (order.status) return order;
  return { ...order, status: DEFAULT_ORDER_STATUS };
}

// ---------------------------------------------------------------
// Helper: view(res, templateName, data)
//
// Wrapper for res.render() that always injects `user` from res.locals.
// This allows templates (e.g. navbars) to use <%= user %>.
// ---------------------------------------------------------------
function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

// ---------------------------------------------------------------
// Helper: popMessages(req)
//
// Flash-message style helper:
// - If req.session.messages is an array, returns its items and clears it.
// - Otherwise returns [].
// ---------------------------------------------------------------
function popMessages(req) {
  return Array.isArray(req.session.messages)
    ? req.session.messages.splice(0)
    : [];
}

module.exports = {
  // -------------------------------------------------------------
  // ADMIN: LIST ALL ORDERS
  //
  // GET /admin/orders
  //
  // - Loads all orders via orderModel.getAll()
  // - Applies withDefaultStatus() to ensure each has a status
  // - Pops any flash messages
  // - Renders adminOrders.ejs
  // -------------------------------------------------------------
  list(req, res) {
    const messages = popMessages(req);

    orderModel.getAll((err, orders = []) => {
      if (err) {
        return res.status(500).send('Database error');
      }

      // Ensure every order has a valid status
      const ordersWithStatus = orders.map(withDefaultStatus);

      return view(res, 'adminOrders', {
        orders: ordersWithStatus,
        messages
      });
    });
  },

  // -------------------------------------------------------------
  // ADMIN: ORDER DETAILS VIEW
  //
  // GET /admin/orders/:id
  //
  // This reuses the "checkout" template as a read-only admin view:
  // - Validates orderId from route param
  // - Fetches order by ID
  // - Applies default status
  // - Loads order items and maps them into cart-like objects
  // - Passes invoiceNumber, createdAt, subtotal, taxAmount, total into view
  // - Sets useAdminNav=true so navbar can highlight admin section
  // - Provides "Back to Orders" navigation links
  // -------------------------------------------------------------
  details(req, res) {
    const orderId = Number(req.params.id);

    // If :id is not a valid number, go back to admin orders
    if (Number.isNaN(orderId)) {
      return res.redirect('/admin/orders');
    }

    // Load order record
    orderModel.getById(orderId, (err, order) => {
      if (err) {
        return res.status(500).send('Database error');
      }
      if (!order) {
        // No such order → back to list
        return res.redirect('/admin/orders');
      }

      // Ensure status is set
      const orderWithStatus = withDefaultStatus(order);

      // Load all items belonging to this order
      orderItemModel.getByOrder(orderId, (err2, items = []) => {
        if (err2) {
          return res.status(500).send('Database error');
        }

        // Map each DB row into a cart item object
        const cart = items.map((item) => ({
          id: item.productId,
          productName: item.productName,
          price: Number(item.unitPrice),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
          image: '' // placeholder if you want to add images later
        }));

        // Read stored financial values and ensure they're finite numbers
        const storedSubtotal = Number(orderWithStatus.subtotal);
        const storedTaxAmount = Number(orderWithStatus.taxAmount);
        const storedTotal = Number(orderWithStatus.total);

        return view(res, 'checkout', {
          cart,
          invoiceNumber: orderWithStatus.invoiceNumber,
          invoiceDate: new Date(orderWithStatus.createdAt),

          // Only pass these if they are valid finite numbers
          subtotal: Number.isFinite(storedSubtotal) ? storedSubtotal : undefined,
          taxAmount: Number.isFinite(storedTaxAmount) ? storedTaxAmount : undefined,
          total: Number.isFinite(storedTotal) ? storedTotal : undefined,

          // Flags/links for admin layout & navigation
          useAdminNav: true,
          nextLink: '/admin/orders',
          nextText: 'Back to Orders',
          backLink: '/admin/orders',
          backText: 'Back to Orders'
        });
      });
    });
  },

  // -------------------------------------------------------------
  // ADMIN: DELETE ORDER
  //
  // POST /admin/orders/:id/delete  (or similar)
  //
  // Steps:
  // 1) Validate orderId
  // 2) Delete order items via orderItemModel.deleteByOrder(orderId)
  // 3) Delete order via orderModel.delete(orderId)
  // 4) Set flash message "Order deleted"
  // 5) Redirect back to /admin/orders
  // -------------------------------------------------------------
  remove(req, res) {
    const orderId = Number(req.params.id);

    // Invalid ID → go back to list
    if (Number.isNaN(orderId)) {
      return res.redirect('/admin/orders');
    }

    // First delete order_items for this order
    orderItemModel.deleteByOrder(orderId, (err) => {
      if (err) {
        return res.status(500).send('Database error');
      }

      // Then delete the order record itself
      orderModel.delete(orderId, (err2) => {
        if (err2) {
          return res.status(500).send('Database error');
        }

        req.session.messages = ['Order deleted'];
        return res.redirect('/admin/orders');
      });
    });
  },

  // -------------------------------------------------------------
  // ADMIN: SHOW EDIT ORDER FORM
  //
  // GET /admin/orders/:id/edit
  //
  // - Validates orderId
  // - Fetches order by ID
  // - Applies default status
  // - Pops messages from session
  // - Renders adminEditOrder.ejs with:
  //      - order (with default status)
  //      - messages
  //      - statusOptions (for dropdown of statuses)
  // -------------------------------------------------------------
  showEdit(req, res) {
    const orderId = Number(req.params.id);

    // Invalid ID → go back to list
    if (Number.isNaN(orderId)) {
      return res.redirect('/admin/orders');
    }

    orderModel.getById(orderId, (err, order) => {
      if (err) {
        return res.status(500).send('Database error');
      }
      if (!order) {
        return res.redirect('/admin/orders');
      }

      const messages = popMessages(req);

      return view(res, 'adminEditOrder', {
        order: withDefaultStatus(order),
        messages,
        statusOptions: STATUS_OPTIONS
      });
    });
  },

  // -------------------------------------------------------------
  // ADMIN: UPDATE ORDER
  //
  // POST /admin/orders/:id/edit
  //
  // Allows editing:
  //  - invoiceNumber
  //  - total
  //  - status
  //
  // Validation:
  //  - invoiceNumber required
  //  - total must be a non-negative number
  //  - status must be one of STATUS_OPTIONS
  //
  // After validation:
  //  - recompute subtotal and taxAmount from total using TAX_RATE:
  //      subtotal = total / (1 + TAX_RATE)
  //      taxAmount = total - subtotal
  //  - update DB with orderModel.update()
  //  - set success/error messages and redirect accordingly
  // -------------------------------------------------------------
  update(req, res) {
    const orderId = Number(req.params.id);

    // Invalid ID → go back to list
    if (Number.isNaN(orderId)) {
      return res.redirect('/admin/orders');
    }

    const { invoiceNumber, total, status } = req.body;
    const errors = [];

    // Invoice number is required
    if (!invoiceNumber) {
      errors.push('Invoice number is required.');
    }

    // Total must be a valid non-negative number
    const parsedTotal = Number(total);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      errors.push('Total must be a positive number.');
    }

    // Status must be one of STATUS_OPTIONS
    const trimmedStatus = typeof status === 'string' ? status.trim() : '';
    const statusValue = STATUS_OPTIONS.includes(trimmedStatus) ? trimmedStatus : null;
    if (!statusValue) {
      errors.push('Please select a valid order status.');
    }

    // If any validation errors, store and redirect back to edit form
    if (errors.length) {
      req.session.messages = errors;
      return res.redirect(`/admin/orders/${orderId}/edit`);
    }

    // Recalculate subtotal and tax from total (reverse tax calculation):
    //   total = subtotal * (1 + TAX_RATE)
    // => subtotal = total / (1 + TAX_RATE)
    const subtotal = Number((parsedTotal / (1 + TAX_RATE)).toFixed(2));

    // taxAmount = total - subtotal, clamped at minimum 0
    let taxAmount = Number((parsedTotal - subtotal).toFixed(2));
    if (taxAmount < 0) taxAmount = 0;

    // Build update object
    const updateData = {
      invoiceNumber,
      subtotal,
      taxAmount,
      total: parsedTotal,
      status: statusValue
    };

    // Perform the update in DB
    orderModel.update(orderId, updateData, (err) => {
      if (err) {
        req.session.messages = ['Failed to update order'];
        return res.redirect(`/admin/orders/${orderId}/edit`);
      }

      req.session.messages = ['Order updated'];
      return res.redirect('/admin/orders');
    });
  }
};
