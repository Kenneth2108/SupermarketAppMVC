// controllers/cartController.js
const productModel = require('../models/productModel'); 
// Import the productModel.
// This model is responsible for reading/updating product records in the database,
// such as fetching product details and decreasing stock after checkout.

const cartModel = require('../models/cartModel');
// Import the cartModel.
// This handles all operations related to the user's cart in the database,
// e.g., adding items, retrieving cart items, updating quantities, clearing cart.

const orderModel = require('../models/orderModel');
// Import the orderModel.
// This model is responsible for creating order records (the main order header)
// when the user checks out, including subtotals, tax, total, etc.

const orderItemModel = require('../models/orderItemModel');
// Import the orderItemModel.
// This model handles the "line items" inside an order.
// For each product in the cart, one record will be created in the order_items table.

const TAX_RATE = 0.09;

function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
  // Helper function for rendering views.
  // Parameters:
  // - res: the response object from Express.
  // - name: the name of the EJS view file (e.g., 'cart', 'checkout').
  // - data: an optional object containing variables to pass into the view.
  //
  // It spreads the `data` object into the render context and also always includes:
  // - user: res.locals.user (the currently logged-in user, set by middleware).
}

function popMessages(req) {
  return Array.isArray(req.session.messages) ? req.session.messages.splice(0) : [];
  // Helper function to retrieve "flash messages" from the session.
  //
  // - Checks if req.session.messages is an array.
  //   If yes:
  //     - req.session.messages.splice(0) returns all elements (from index 0 onward)
  //       and also clears the array in-place.
  //     - This means messages are read ONCE and then removed.
  //   If no:
  //     - Returns an empty array [].
  //
  // This is used to show one-time notifications to the user
  // such as "Don't have sufficient stock" or "Your cart is empty".
}

function insufficientStockMessage(productName) {
  return `Don't have sufficient stock for ${productName}.`;
  // Simple helper to standardize the out-of-stock message.
  // Takes the productName and returns a string message that can be shown to the user.
}

function mapCartRows(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    productName: row.productName,
    price: row.price,
    image: row.image,
    quantity: Number(row.quantity) || 1
  }));
  // This helper converts raw cart rows from the database into a clean format
  // for the view.
  //
  // Input:
  // - rows: an array of cart records from the DB (each row includes product fields).
  //
  // For each row:
  // - id:         product or cart item ID.
  // - productName: name of the product.
  // - price:      price per unit.
  // - image:      image filename.
  // - quantity:   how many units of this item the user has in the cart.
  //               It uses Number(row.quantity) to convert to a number.
  //               If conversion fails or quantity is falsy, it falls back to 1.
  //
  // This ensures the cart passed into the EJS always has numeric quantity values.
}

module.exports = {
  // -------------------------------------------------------------------------
  // GET /cart
  // Show the user's current cart with all items and any flash messages.
  // -------------------------------------------------------------------------
  view(req, res) {
    const userId = req.session.user.id;

    const messages = popMessages(req);

    cartModel.getCartItems(userId, (err, rows = []) => {


      if (err) return res.status(500).send('Database error');

      const cart = mapCartRows(rows);
      // Convert the raw DB rows into cleaned cart item objects
      // with numeric quantity etc. using the helper function.

      return view(res, 'cart', { cart, messages });
      // Render the 'cart' EJS view, passing:
      // - cart: array of cart items
      // - messages: any flash messages to display (like alerts)
      // The `view` helper will also include user: res.locals.user automatically.
    });
  },

  // -------------------------------------------------------------------------
  // POST /add-to-cart/:id
  // Add a product to the cart or increase quantity.
  // -------------------------------------------------------------------------
  add(req, res) {
    const requestedQty = Math.max(1, Number(req.body.quantity || 1));
    // Determine how many units the user wants to add:
    // - req.body.quantity: the quantity from the form (often from an input field).
    // - If quantity is not provided or blank, it uses 1 by default.
    // - Number(...) converts the value to a number.
    // - Math.max(1, ...) ensures the quantity is at least 1
    //   (prevents 0 or negative values).

    const userId = req.session.user.id;

    const productId = Number(req.params.id);
    // Product ID from URL parameter /add-to-cart/:id.
    // For example, if URL is /add-to-cart/5, then req.params.id === "5".
    // Number(...) converts it into a numeric ID.

    const redirect = String(req.body.redirect || '').toLowerCase() === 'cart' ? '/cart' : '/shopping';
    // This decides where to redirect the user after adding to cart.
    // - If the form includes a hidden field named "redirect" with value "cart",
    //   we redirect to '/cart' after adding the item.
    // - Otherwise, we redirect back to '/shopping'.
    //
    // This gives flexibility:
    //   - Add from shopping page and stay on shopping list.
    //   - Or add and go directly to cart page.

    productModel.getById(productId, (err, product) => {
      if (err) return res.status(500).send('Database error');

      if (!product) return res.status(404).send('Not found');

      const availableQty = Number(product.quantity) || 0;
      // Determine how many units of this product are currently in stock.
      // Convert product.quantity to a number; if invalid, default to 0.

      if (availableQty <= 0) {
        // If there is no stock left at all:
        req.session.messages = [insufficientStockMessage(product.productName)];
        return res.redirect(redirect);
      }

      cartModel.getItemQuantity(userId, productId, (err2, currentQty) => {
        // Fetch how many units of this product the user already has in their cart.
        // currentQty is the existing quantity in the cart.

        if (err2) return res.status(500).send('Database error');
        // If there's a DB error here, respond with 500.

        const maxAddable = availableQty - currentQty;
        // maxAddable = how many more units we can add without exceeding stock.
        // For example:
        //   availableQty = 10, currentQty = 3 → maxAddable = 7.
        // So we shouldn't allow adding more than 7 additional units.

        if (maxAddable <= 0 || requestedQty > maxAddable) {
          req.session.messages = [insufficientStockMessage(product.productName)];
          return res.redirect(redirect);
        }

        cartModel.setQuantity(userId, productId, currentQty + requestedQty, (err3) => {
          // If stock allows, update the cart quantity in the database:
          // newQuantity = currentQty + requestedQty.

          if (err3) return res.status(500).send('Database error');
          return res.redirect(redirect);

        });
      });
    });
  },

  // -------------------------------------------------------------------------
  // POST /cart/remove/:id
  // Remove a single product from the user's cart.
  // -------------------------------------------------------------------------
  remove(req, res) {
    const userId = req.session.user.id;
    // Logged-in user's ID.

    const id = Number(req.params.id);
    // ID from URL: /cart/remove/:id
    // This is typically the product ID (or a cart item ID depending on implementation).

    cartModel.removeItem(userId, id, (err) => {
      // Ask the cartModel to remove this item from the user's cart.

      if (err) return res.status(500).send('Database error');
      // If something goes wrong with the DB, send 500.

      return res.redirect('/cart');
      // After removal, redirect back to the cart page to show updated contents.
    });
  },

  // -------------------------------------------------------------------------
  // POST /cart/clear
  // Remove all items from the user's cart.
  // -------------------------------------------------------------------------
  clear(req, res) {
    const userId = req.session.user.id;
    // Logged-in user's ID.

    cartModel.clearCart(userId, (err) => {
      // Ask cartModel to delete all entries for this user from the cart table.

      if (err) return res.status(500).send('Database error');
      // On DB error, send 500.

      return res.redirect('/cart');
      // After clearing, redirect back to cart page (which will now be empty).
    });
  },

  // -------------------------------------------------------------------------
  // POST /cart/update/:id
  // Update quantity of a specific product in the cart.
  // -------------------------------------------------------------------------
  updateQuantity(req, res) {
    const userId = req.session.user.id;
    // Logged-in user's ID.

    const id = Number(req.params.id);
    // Product ID (or cart item ID) from URL /cart/update/:id.

    let qty = Number(req.body.quantity || 1);
    // New quantity requested from the form.
    // If missing or empty, default to 1.
    // Then convert to a number.

    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    // Defensive check:
    // If qty is not a finite number or less than 1, set it to 1.

    if (qty > 999) qty = 999;

    productModel.getById(id, (err, product) => {
      // Fetch product details from DB to check stock.

      if (err) return res.status(500).send('Database error');
      if (!product) return res.status(404).send('Not found');
      const availableQty = Number(product.quantity) || 0;
      // How many units in stock right now.

      if (availableQty <= 0) {
        // If product is out of stock entirely:
        req.session.messages = [insufficientStockMessage(product.productName)];
        // Set an insufficient stock message.

        return cartModel.removeItem(userId, id, (err2) => {
          // Remove this item from the cart since it's not available anymore.

          if (err2) return res.status(500).send('Database error');
          return res.redirect('/cart');
        });
      }

      if (qty > availableQty) {
        // If requested qty is more than what's available in stock:
        req.session.messages = [insufficientStockMessage(product.productName)];
        qty = availableQty;
      }

      cartModel.setQuantity(userId, id, qty, (err3) => {
        // Update the cart item's quantity in DB.
        if (err3) return res.status(500).send('Database error');
        return res.redirect('/cart');
      });
    });
  },

  // -------------------------------------------------------------------------
  // GET /cart/checkout
  // Process checkout: create order, create order items, update stock, clear cart.
  // -------------------------------------------------------------------------
  checkout(req, res) {
    const userId = req.session.user.id;
    // Logged-in user's ID.

    cartModel.getCartItems(userId, (err, rows = []) => {
      // Fetch all cart items for this user from the database.

      if (err) return res.status(500).send('Database error');
      const cart = mapCartRows(rows);
      // Convert raw DB rows into cleaned cart item objects.

      if (!cart.length) {
        // If the cart is empty, user can't checkout.
        req.session.messages = ['Your cart is empty.'];
        return res.redirect('/cart');
      }

      const orderDate = new Date();
      // Current date/time when the order is being created.
      // Used as the invoiceDate and for generating a unique invoice number.

      const invoiceNumber = `INV-${orderDate.getTime()}`;
      // Create a simple unique invoice number using the timestamp.
      // Example: INV-1711122334455

      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      // Calculate subtotal of the order:
      // Sum of (price * quantity) for each item in the cart.

      const taxAmount = Number((subtotal * TAX_RATE).toFixed(2));
      // Calculate tax as subtotal * TAX_RATE.
      // toFixed(2) formats it to 2 decimal places (like 12.34).
      // Number(...) converts it back to a numeric type.

      const total = Number((subtotal + taxAmount).toFixed(2));
      // Calculate total amount = subtotal + tax.
      // Also rounded to 2 decimal places and converted to Number.

      orderModel.create(userId, invoiceNumber, { subtotal, taxAmount, total }, (err2, orderId) => {
        // Create a new order record in the orders table.
        // This usually inserts:
        // - userId
        // - invoiceNumber
        // - subtotal, taxAmount, total
        // - possibly orderDate
        //
        // orderId: ID of the newly created order record in DB.

        if (err2) return res.status(500).send('Database error');
        // If order insert fails, send 500 error.

        orderItemModel.createMany(orderId, cart, (err3) => {
          // Insert multiple records into order_items table, one per cart item.
          // Each row includes:
          // - orderId
          // - productId
          // - productName
          // - unitPrice
          // - quantity
          // - subtotal

          if (err3) return res.status(500).send('Database error');
          productModel.decreaseQuantities(cart, (err4) => {
            // Reduce available stock for each product based on quantities ordered.
            // For each item, do something like:
            // UPDATE products SET quantity = quantity - item.quantity WHERE id = item.id

            if (err4) return res.status(500).send('Database error');

            cartModel.clearCart(userId, (err5) => {
              if (err5) return res.status(500).send('Database error');
              // If cart clear fails, send 500.

              return view(res, 'checkout', {
                cart,
                invoiceDate: orderDate,
                invoiceNumber,
                subtotal,
                taxAmount,
                total,
                userNavActive: 'orders'
              });
              // Finally, render the 'checkout' EJS view to show the order summary.
              // Data passed:
              // - cart: items that were just purchased
              // - invoiceDate: orderDate
              // - invoiceNumber: generated invoice number
              // - subtotal, taxAmount, total: monetary breakdown
              // - userNavActive: 'orders' (possibly used to highlight nav item)
            });
          });
        });
      });
    });
  }
};
