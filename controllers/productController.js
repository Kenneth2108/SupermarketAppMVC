// controllers/productController.js
const productModel = require('../models/productModel');

function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

module.exports = {
  inventory(req, res) {
    productModel.getAll((err, rows) => {
      if (err) return res.status(500).send('Database error');
      return view(res, 'inventory', { products: rows });
    });
  },

  showAddForm(req, res) {
    return view(res, 'addProduct');
  },

  create(req, res) {
    const { name, quantity, price } = req.body;
    const image = req.file ? req.file.originalname : null;
    if (!name || !quantity || !price || !image) return res.status(400).send('Missing fields');
    productModel.create(
      { productName: name, quantity: Number(quantity), price: Number(price), image },
      (err) => {
        if (err) return res.status(500).send('Database error');
        return res.redirect('/inventory');
      }
    );
  },

  showEditForm(req, res) {
    productModel.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send('Database error');
      if (!product) return res.status(404).send('Not found');
      return view(res, 'editProduct', { product });
    });
  },

  update(req, res) {
    const { name, quantity, price, currentImage } = req.body;
    const image = req.file ? req.file.originalname : currentImage;
    productModel.update(
      req.params.id,
      { productName: name, quantity: Number(quantity), price: Number(price), image },
      (err) => {
        if (err) return res.status(500).send('Database error');
        return res.redirect('/inventory');
      }
    );
  },

  remove(req, res) {
    productModel.remove(req.params.id, (err) => {
      if (err) return res.status(500).send('Database error');
      return res.redirect('/inventory');
    });
  },

  details(req, res) {
    productModel.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send('Database error');
      if (!product) return res.status(404).send('Not found');
      return view(res, 'product', { product });
    });
  },

  shopping(req, res) {
    productModel.getAll((err, rows) => {
      if (err) return res.status(500).send('Database error');
      return view(res, 'shopping', { products: rows });
    });
  },

  addToCart(req, res) {
    const qty = Number(req.body.quantity || 1);
    productModel.getById(req.params.id, (err, product) => {
      if (err) return res.status(500).send('Database error');
      if (!product) return res.status(404).send('Not found');
      if (!req.session.cart) req.session.cart = [];
      req.session.cart.push({
        id: product.id,
        productName: product.productName,
        price: product.price,
        quantity: qty,
        image: product.image
      });
      return res.redirect('/cart');
    });
  },

  cart(req, res) {
    return view(res, 'cart', { cart: req.session.cart || [] });
  }
};
