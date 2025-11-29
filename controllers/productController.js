// controllers/productController.js
const productModel = require('../models/productModel');  
// Import the productModel which handles all DB operations (SELECT, INSERT, UPDATE, DELETE).

function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
  // Helper to render EJS pages AND automatically inject the logged-in user into every view.
}

function popMessages(req) {
  return Array.isArray(req.session.messages) ? req.session.messages.splice(0) : [];
  // Reads and clears messages stored in session.
  // Used for showing one-time alerts (e.g. "Added to cart").
}

module.exports = {
  // -----------------------------------------
  // ADMIN INVENTORY PAGE
  // -----------------------------------------
  inventory(req, res) {
    productModel.getAll((err, rows) => {
      if (err) return res.status(500).send('Database error');  
      // If DB fails → send 500 error.
      return view(res, 'inventory', { products: rows });  
      // Render inventory.ejs and pass all product rows.
    });
  },

  // -----------------------------------------
  // ADMIN: SHOW "ADD PRODUCT" PAGE
  // -----------------------------------------
  showAddForm(req, res) {
    return view(res, 'addProduct');  
    // Simply render the addProduct.ejs view.
  },

  // -----------------------------------------
  // ADMIN: CREATE A NEW PRODUCT
  // -----------------------------------------
  create(req, res) {
    const { name, quantity, price } = req.body;  
    // Read form fields from POST request.

    const image = req.file ? req.file.originalname : null;  
    // If multer uploaded a file, use its filename. If not → null.

    if (!name || !quantity || !price || !image)
      return res.status(400).send('Missing fields');  
      // Ensure all fields are present before inserting.

    productModel.create(
      {
        productName: name,
        quantity: Number(quantity),  // Convert to number
        price: Number(price),        // Convert to number
        image
      },
      (err) => {
        if (err) return res.status(500).send('Database error');  
        // Error inserting DB row
        return res.redirect('/inventory');  
        // After creation → go back to inventory list
      }
    );
  },

  // -----------------------------------------
  // ADMIN: SHOW EDIT FORM
  // -----------------------------------------
  showEditForm(req, res) {
    productModel.getById(req.params.id, (err, product) => {
      // req.params.id comes from route: /editProduct/:id

      if (err) return res.status(500).send('Database error');  
      if (!product) return res.status(404).send('Not found');  
      // If no product with that ID exists → show 404

      return view(res, 'editProduct', { product });  
      // Render editProduct.ejs and pass product object
    });
  },

  // -----------------------------------------
  // ADMIN: UPDATE PRODUCT
  // -----------------------------------------
  update(req, res) {
    const { name, quantity, price, currentImage } = req.body;  
    // Read form fields. currentImage is a hidden input storing old image.

    const image = req.file ? req.file.originalname : currentImage;
    // If no new image uploaded → keep old image name.

    productModel.update(
      req.params.id,  
      // The ID of the product to update

      {
        productName: name,
        quantity: Number(quantity),
        price: Number(price),
        image
      },

      (err) => {
        if (err) return res.status(500).send('Database error');  
        // If MySQL UPDATE fails

        return res.redirect('/inventory');  
        // After update → return admin to inventory
      }
    );
  },

  // -----------------------------------------
  // ADMIN: DELETE PRODUCT
  // -----------------------------------------
  remove(req, res) {
    productModel.remove(req.params.id, (err) => {
      // req.params.id = ID of the product to delete
      if (err) return res.status(500).send('Database error');  
      return res.redirect('/inventory');  
      // After deletion → reload inventory
    });
  },

  // -----------------------------------------
  // CUSTOMER: PRODUCT DETAILS PAGE
  // -----------------------------------------
  details(req, res) {
    productModel.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send('Database error');  
      if (!product) return res.status(404).send('Not found');  

      return view(res, 'product', { product });  
      // Render product.ejs (customer view)
    });
  },

  // -----------------------------------------
  // CUSTOMER: SHOPPING PAGE
  // -----------------------------------------
  shopping(req, res) {
    productModel.getAll((err, rows) => {
      if (err) return res.status(500).send('Database error');  

      const messages = popMessages(req);
      // Pop one-time session messages (e.g. "Added to cart").

      return view(res, 'shopping', { products: rows, messages });
      // Render shopping.ejs with all products + messages
    });
  }
};
