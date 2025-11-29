// controllers/orderItemsController.js
// ---------------------------------------------------------------
// This controller shows the details of a single past order.
// It:
// 1) Ensures the order belongs to the logged-in user
// 2) Loads all order_items for that order
// 3) Maps them into a cart-like structure
// 4) Reuses the "checkout.ejs" view to display a read-only invoice,
//    with proper subtotal, tax, total and navigation buttons.
// ---------------------------------------------------------------

const orderModel = require('../models/orderModel');         // DB access for orders
const orderItemModel = require('../models/orderItemModel'); // DB access for order items

// ---------------------------------------------------------------
// Helper: view(res, templateName, data)
//
// Wrapper around res.render() that always injects
// the logged-in user from res.locals.user into the EJS template.
// ---------------------------------------------------------------
function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

module.exports = {
  // -------------------------------------------------------------
  // SHOW A SINGLE ORDER (READ-ONLY CHECKOUT VIEW)
  //
  // Route example: GET /orders/:id
  //
  // Flow:
  // 1. Read userId from session (must be logged in).
  // 2. Convert :id param to Number → orderId.
  //    - If NaN → redirect back to /orders.
  // 3. Use orderModel.getByUserAndId(userId, orderId) to ensure:
  //    - The order exists.
  //    - It belongs to the current logged-in user.
  // 4. If order found, load order items from orderItemModel.getByOrder(orderId).
  // 5. Map DB rows into a "cart" structure similar to active checkout:
  //    - id, productName, price, quantity, subtotal, etc.
  // 6. Pass cart + invoice info (invoiceNumber, invoiceDate, subtotal, tax, total)
  //    into the "checkout" view.
  // 7. Configure navigation labels like "Back to Orders".
  // -------------------------------------------------------------
  show(req, res) {
    // Logged-in user's ID (set earlier when they logged in)
    const userId = req.session.user.id;

    // Order ID from URL, e.g. /orders/123 → 123
    const orderId = Number(req.params.id);

    // If the URL param is not a valid number, go back to orders list
    if (Number.isNaN(orderId)) {
      return res.redirect('/orders');
    }

    // Step 1: Ensure this order belongs to this user
    orderModel.getByUserAndId(userId, orderId, (err, order) => {
      if (err) {
        // Database error while retrieving the order
        return res.status(500).send('Database error');
      }

      // If order does not exist or does not belong to this user,
      // quietly redirect back to /orders
      if (!order) {
        return res.redirect('/orders');
      }

      // Step 2: Load items for this order from order_items table
      orderItemModel.getByOrder(orderId, (err2, items = []) => {
        if (err2) {
          return res.status(500).send('Database error');
        }

        // Map each DB row into a cart item object for the checkout view
        const cart = items.map((item) => ({
          id: item.productId,                       // product ID
          productName: item.productName,           // product name
          price: Number(item.unitPrice),           // unit price
          image: '',                               // image can be filled later if needed
          quantity: Number(item.quantity),         // quantity bought
          subtotal: Number(item.subtotal)          // line subtotal = unitPrice * quantity
        }));

        // Read stored subtotal, tax amount and total from order record
        const storedSubtotal = Number(order.subtotal);
        const storedTaxAmount = Number(order.taxAmount);
        const storedTotal = Number(order.total);

        // Render "checkout.ejs" as a read-only invoice view
        return view(res, 'checkout', {
          cart,
          invoiceNumber: order.invoiceNumber,           // unique invoice no.
          invoiceDate: new Date(order.createdAt),       // order creation date

          // Only pass numbers if they are finite; otherwise undefined
          subtotal: Number.isFinite(storedSubtotal) ? storedSubtotal : undefined,
          taxAmount: Number.isFinite(storedTaxAmount) ? storedTaxAmount : undefined,
          total: Number.isFinite(storedTotal) ? storedTotal : undefined,

          // Navigation and active nav states for the template
          userNavActive: 'orders',                      // highlight "Orders" in user navbar
          nextLink: '/orders',                          // next button URL
          nextText: 'Back to Orders',                   // next button text
          backLink: '/orders',                          // back button URL
          backText: 'Back to Orders'                    // back button text
        });
      });
    });
  }
};
