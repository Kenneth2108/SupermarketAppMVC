// controllers/cartController.js
const fs = require('fs');
const path = require('path');
const productModel = require('../models/productModel');

function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

// --- File-backed cart helpers (no separate model) ---
const CART_DIR = path.join(__dirname, '..', 'data', 'carts');
function ensureDir() { try { fs.mkdirSync(CART_DIR, { recursive: true }); } catch (_) {} }
function cartPath(userId) { ensureDir(); return path.join(CART_DIR, String(userId) + '.json'); }
function readMap(userId, cb) {
  const p = cartPath(userId);
  fs.readFile(p, 'utf8', (err, data) => {
    if (err) { if (err.code === 'ENOENT') return cb(null, {}); return cb(err); }
    try { cb(null, JSON.parse(data || '{}') || {}); } catch (e) { cb(null, {}); }
  });
}
function writeMap(userId, map, cb) {
  const p = cartPath(userId);
  fs.writeFile(p, JSON.stringify(map), 'utf8', (err) => {
    if (!err) {
      try { console.log('[CART] Saved cart for user', userId, '->', p); } catch(_) {}
    }
    cb(err);
  });
}
function mapToArray(map, cb) {
  const ids = Object.keys(map).map(n => Number(n)).filter(n => !Number.isNaN(n));
  if (ids.length === 0) return cb(null, []);
  const items = new Array(ids.length);
  let left = ids.length;
  ids.forEach((id, i) => {
    productModel.getById(id, (err, product) => {
      if (!err && product) {
        items[i] = {
          id: product.id,
          productName: product.productName,
          price: product.price,
          image: product.image,
          quantity: Number(map[id]) || 1
        };
      } else { items[i] = null; }
      if (--left === 0) cb(null, items.filter(Boolean));
    });
  });
}

module.exports = {
  // GET /cart
  view(req, res) {
    const userId = req.session.user.id;
    readMap(userId, (err, map) => {
      if (err) return res.status(500).send('Storage error');
      mapToArray(map, (err2, items) => {
        if (err2) return res.status(500).send('Storage error');
        return view(res, 'cart', { cart: items });
      });
    });
  },

  // POST /add-to-cart/:id
  add(req, res) {
    const qty = Math.max(1, Number(req.body.quantity || 1));
    const userId = req.session.user.id;
    const productId = Number(req.params.id);
    productModel.getById(productId, (err, product) => {
      if (err) return res.status(500).send('Database error');
      if (!product) return res.status(404).send('Not found');
      readMap(userId, (err2, map) => {
        if (err2) return res.status(500).send('Storage error');
        map[productId] = (Number(map[productId]) || 0) + qty;
        writeMap(userId, map, (err3) => {
          if (err3) return res.status(500).send('Storage error');
          const redirect = String(req.body.redirect || '').toLowerCase();
          return res.redirect(redirect === 'cart' ? '/cart' : '/shopping');
        });
      });
    });
  },

  // POST /cart/remove/:id
  remove(req, res) {
    const userId = req.session.user.id;
    const id = Number(req.params.id);
    readMap(userId, (err, map) => {
      if (err) return res.status(500).send('Storage error');
      if (Object.prototype.hasOwnProperty.call(map, id)) delete map[id];
      writeMap(userId, map, (err2) => {
        if (err2) return res.status(500).send('Storage error');
        return res.redirect('/cart');
      });
    });
  },

  // POST /cart/remove-item/:index
  removeAtIndex(req, res) {
    const userId = req.session.user.id;
    const idx = parseInt(req.params.index, 10);
    if (Number.isNaN(idx)) return res.redirect('/cart');
    readMap(userId, (err, map) => {
      if (err) return res.status(500).send('Storage error');
      mapToArray(map, (err2, items) => {
        if (err2) return res.status(500).send('Storage error');
        const item = items[idx];
        if (!item) return res.redirect('/cart');
        if (Object.prototype.hasOwnProperty.call(map, item.id)) delete map[item.id];
        writeMap(userId, map, () => res.redirect('/cart'));
      });
    });
  },

  // POST /cart/update/:id
  updateQuantity(req, res) {
    const userId = req.session.user.id;
    const id = Number(req.params.id);
    let qty = Number(req.body.quantity || 1);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (qty > 999) qty = 999;
    readMap(userId, (err, map) => {
      if (err) return res.status(500).send('Storage error');
      map[id] = qty;
      writeMap(userId, map, (err2) => {
        if (err2) return res.status(500).send('Storage error');
        return res.redirect('/cart');
      });
    });
  }
};
