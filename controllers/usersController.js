// controllers/usersController.js
const userModel = require('../models/userModel');

function pop(arr) {
  return Array.isArray(arr) ? arr.splice(0) : [];
}

function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

module.exports = {
  // --- REGISTER PAGE ---
  showRegister(req, res) {
    const messages = pop(req.session.messages);
    return view(res, 'register', { messages, formData: req.session.formData || null });
  },

  // --- REGISTER LOGIC ---
  register(req, res) {
    const { username, email, password, address, contact } = req.body;
    req.session.formData = { username, email, address, contact };

    const errors = [];
    if (!username || !email || !password || !address || !contact) {
      errors.push('All fields are required.');
    }
    if (errors.length) {
      req.session.messages = errors;
      return res.redirect('/register');
    }

    // role is not provided by the form; default to 'user'
    const roleNorm = 'user';

    userModel.findByEmail(email, (err, existing) => {
      if (err) {
        console.error('[findByEmail] MySQL:', err);
        req.session.messages = [err.sqlMessage || 'Database error'];
        return res.redirect('/register');
      }
      if (existing) {
        req.session.messages = ['Email already registered'];
        return res.redirect('/register');
      }

      userModel.createUser(
        { username, email, password, address, contact, role: roleNorm },
        (err2) => {
          if (err2) {
            console.error('[createUser] MySQL:', err2);
            req.session.messages = [err2.sqlMessage || 'Database error'];
            return res.redirect('/register');
          }
          req.session.formData = null;
          req.session.messages = ['Registration successful. Please log in.'];
          return res.redirect('/login');
        }
      );
    });
  },

  // --- LOGIN PAGE ---
  showLogin(req, res) {
    const messages = pop(req.session.messages);
    const errors = pop(req.session.errors);
    return view(res, 'login', { messages, errors });
  },

  // --- LOGIN LOGIC ---
  login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      req.session.errors = ['Email and password are required'];
      return res.redirect('/login');
    }

    console.log('[LOGIN] Attempt:', email);

    userModel.validateLogin(email, password, (err, user) => {
      if (err) {
        console.error('[LOGIN] DB error:', err);
        req.session.errors = [err.sqlMessage || 'Database error'];
        return res.redirect('/login');
      }
      if (!user) {
        console.warn('[LOGIN] Invalid credentials for', email);
        req.session.errors = ['Invalid email or password'];
        return res.redirect('/login');
      }

      // success → persist user session
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      console.log('[LOGIN] Success:', user.username, `(${user.role})`);
      return res.redirect(user.role === 'admin' ? '/inventory' : '/shopping');
    });
  },

  // --- LOGOUT ---
  logout(req, res) {
    req.session.destroy(() => res.redirect('/'));
  },

  // --- ADMIN: LIST USERS ---
  listUsers(req, res) {
    const messages = pop(req.session.messages);
    userModel.listUsers((err, users) => {
      if (err) {
        console.error('[listUsers] MySQL:', err);
        return res.status(500).send('Database error');
      }
      return view(res, 'adminUsers', { users, messages });
    });
  },

  // --- ADMIN: UPDATE ROLE ---
  updateRole(req, res) {
    const { id } = req.params;
    const { role } = req.body;
    const roleNorm = String(role).toLowerCase() === 'admin' ? 'admin' : 'user';

    // prevent demoting the last admin (lightweight check)
    userModel.countAdmins((err, count) => {
      if (err) {
        console.error('[countAdmins] MySQL:', err);
        req.session.messages = ['Database error'];
        return res.redirect('/admin/users');
      }
      if (roleNorm === 'user' && count <= 1) {
        req.session.messages = ['Cannot remove role: at least one admin required'];
        return res.redirect('/admin/users');
      }

      userModel.updateUserRole(id, roleNorm, (err2) => {
        if (err2) {
          console.error('[updateUserRole] MySQL:', err2);
          req.session.messages = ['Failed to update role'];
        } else {
          req.session.messages = ['User role updated'];
        }
        return res.redirect('/admin/users');
      });
    });
  },

  // --- ADMIN: DELETE USER ---
  deleteUser(req, res) {
    const { id } = req.params;
    // prevent deleting self
    if (req.session.user && String(req.session.user.id) === String(id)) {
      req.session.messages = ["You can't delete your own account while logged in as admin."];
      return res.redirect('/admin/users');
    }

    // prevent deleting the last admin
    userModel.getById(id, (err, u) => {
      if (err) {
        console.error('[getById] MySQL:', err);
        req.session.messages = ['Database error'];
        return res.redirect('/admin/users');
      }
      if (!u) {
        req.session.messages = ['User not found'];
        return res.redirect('/admin/users');
      }
      if (u.role === 'admin') {
        userModel.countAdmins((err2, count) => {
          if (err2) {
            console.error('[countAdmins] MySQL:', err2);
            req.session.messages = ['Database error'];
            return res.redirect('/admin/users');
          }
          if (count <= 1) {
            req.session.messages = ['Cannot delete the last admin'];
            return res.redirect('/admin/users');
          }
          userModel.deleteUser(id, (err3) => {
            if (err3) {
              console.error('[deleteUser] MySQL:', err3);
              req.session.messages = ['Failed to delete user'];
            } else {
              req.session.messages = ['User deleted'];
            }
            return res.redirect('/admin/users');
          });
        });
      } else {
        userModel.deleteUser(id, (err4) => {
          if (err4) {
            console.error('[deleteUser] MySQL:', err4);
            req.session.messages = ['Failed to delete user'];
          } else {
            req.session.messages = ['User deleted'];
          }
          return res.redirect('/admin/users');
        });
      }
    });
  },

  // --- ADMIN: SHOW CREATE USER FORM ---
  showCreateUser(req, res) {
    const messages = pop(req.session.messages);
    const formData = req.session.formData || null;
    return view(res, 'adminAddUser', { messages, formData });
  },

  // --- ADMIN: CREATE USER WITH ROLE ---
  adminCreateUser(req, res) {
    const { username, email, password, address, contact, role } = req.body;
    req.session.formData = { username, email, address, contact, role };

    const errors = [];
    if (!username || !email || !password || !address || !contact || !role) {
      errors.push('All fields are required.');
    }
    const roleNorm = String(role).toLowerCase() === 'admin' ? 'admin' : 'user';
    if (errors.length) {
      req.session.messages = errors;
      return res.redirect('/admin/users/new');
    }

    userModel.findByEmail(email, (err, existing) => {
      if (err) {
        console.error('[findByEmail] MySQL:', err);
        req.session.messages = [err.sqlMessage || 'Database error'];
        return res.redirect('/admin/users/new');
      }
      if (existing) {
        req.session.messages = ['Email already registered'];
        return res.redirect('/admin/users/new');
      }

      userModel.createUser(
        { username, email, password, address, contact, role: roleNorm },
        (err2) => {
          if (err2) {
            console.error('[createUser] MySQL:', err2);
            req.session.messages = [err2.sqlMessage || 'Database error'];
            return res.redirect('/admin/users/new');
          }
          req.session.formData = null;
          req.session.messages = ['User created'];
          return res.redirect('/admin/users');
        }
      );
    });
  }
};
