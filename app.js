// app.js (MVC)
const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');

const productController = require('./controllers/productController');
const usersController = require('./controllers/usersController');
const cartController = require('./controllers/cartController');
const ordersController = require('./controllers/ordersController');
const orderItemsController = require('./controllers/orderItemsController');
const adminOrdersController = require('./controllers/adminOrdersController');
const authController = require('./controllers/authController');
const { attachUser, ensureAdmin, ensureUser } = require('./middleware');

const app = express();

// Views & static
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// Session
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// res.locals.user for all views
app.use(attachUser);

// Multer (public/images, keep original name)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Home
app.get('/', (req, res) => res.render('index'));

// Users + 2FA
app.get('/register', authController.showRegister);   // show register page with QR + secret
app.post('/register', usersController.register);     // handle registration + 2FA setup

app.get('/login', usersController.showLogin);
app.post('/login', usersController.login);

// step 2 of login: verify TOTP if enabled
app.get('/verify2fa', usersController.showVerify2fa);
app.post('/twofactor', usersController.verify2fa);

app.get('/logout', usersController.logout);

// Admin products
app.get('/inventory', ensureAdmin, productController.inventory);
app.get('/addProduct', ensureAdmin, productController.showAddForm);
app.post('/addProduct', ensureAdmin, upload.single('image'), productController.create);
app.get('/updateProduct/:id', ensureAdmin, productController.showEditForm);
app.post('/updateProduct/:id', ensureAdmin, upload.single('image'), productController.update);
app.get('/deleteProduct/:id', ensureAdmin, productController.remove);

// Auth products & cart (user access only)
app.get('/product/:id', ensureUser, productController.details);
app.get('/shopping', ensureUser, productController.shopping);

app.post('/add-to-cart/:id', ensureUser, cartController.add);
app.get('/cart', ensureUser, cartController.view);
app.post('/cart/remove/:id', ensureUser, cartController.remove);
app.post('/cart/update/:id', ensureUser, cartController.updateQuantity);
app.post('/cart/clear', ensureUser, cartController.clear);
app.get('/cart/checkout', ensureUser, cartController.checkout);

// Orders (user)
app.get('/orders', ensureUser, ordersController.list);
app.get('/orders/:id', ensureUser, orderItemsController.show);

// Admin users
app.get('/admin/users', ensureAdmin, usersController.listUsers);
app.post('/admin/users/:id/role', ensureAdmin, usersController.updateRole);
app.post('/admin/users/:id/delete', ensureAdmin, usersController.deleteUser);
app.get('/admin/users/new', ensureAdmin, usersController.showCreateUser);
app.post('/admin/users', ensureAdmin, usersController.adminCreateUser);

app.get('/admin/users/:id/edit', ensureAdmin, usersController.showEditUser);
app.post('/admin/users/:id/edit', ensureAdmin, usersController.updateUser);

// Admin orders
app.get('/admin/orders', ensureAdmin, adminOrdersController.list);
app.get('/admin/orders/:id', ensureAdmin, adminOrdersController.details);
app.get('/admin/orders/:id/edit', ensureAdmin, adminOrdersController.showEdit);
app.post('/admin/orders/:id/edit', ensureAdmin, adminOrdersController.update);
app.post('/admin/orders/:id/delete', ensureAdmin, adminOrdersController.remove);

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
