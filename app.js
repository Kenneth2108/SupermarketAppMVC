// app.js (MVC)
const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');

const productController = require('./controllers/productController');
const usersController = require('./controllers/usersController');
const cartController = require('./controllers/cartController');

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
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// res.locals.user for all views
app.use((req, res, next) => { res.locals.user = req.session.user || null; next(); });

// Multer (public/images, keep originalname)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Auth guards
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.messages = ['Please log in to continue'];
  return res.redirect('/login');
}
function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('Admins only');
}

// Home
app.get('/', (req, res) => res.render('index'));

// Users
app.get('/register', usersController.showRegister);
app.post('/register', usersController.register);

app.get('/login', usersController.showLogin);
app.get('/Login', usersController.showLogin);
app.post('/login', usersController.login);

app.get('/logout', usersController.logout);
app.get('/Logout', usersController.logout);

// Admin products
app.get('/inventory', ensureAdmin, productController.inventory);
app.get('/addProduct', ensureAdmin, productController.showAddForm);
app.post('/addProduct', ensureAdmin, upload.single('image'), productController.create);
app.get('/updateProduct/:id', ensureAdmin, productController.showEditForm);
app.post('/updateProduct/:id', ensureAdmin, upload.single('image'), productController.update);
app.get('/deleteProduct/:id', ensureAdmin, productController.remove);

// Auth products
app.get('/product/:id', ensureAuthenticated, productController.details);
app.get('/shopping', ensureAuthenticated, productController.shopping);
app.post('/add-to-cart/:id', ensureAuthenticated, cartController.add);
app.get('/cart', ensureAuthenticated, cartController.view);
app.post('/cart/remove/:id', ensureAuthenticated, cartController.remove);
app.post('/cart/remove-item/:index', ensureAuthenticated, cartController.removeAtIndex);
app.post('/cart/update/:id', ensureAuthenticated, cartController.updateQuantity);

// Admin users
app.get('/admin/users', ensureAdmin, usersController.listUsers);
app.post('/admin/users/:id/role', ensureAdmin, usersController.updateRole);
app.post('/admin/users/:id/delete', ensureAdmin, usersController.deleteUser);
app.get('/admin/users/new', ensureAdmin, usersController.showCreateUser);
app.post('/admin/users', ensureAdmin, usersController.adminCreateUser);

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
