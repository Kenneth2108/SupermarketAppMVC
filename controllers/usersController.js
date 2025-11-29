// controllers/usersController.js
// This controller handles all user-related actions:
// - Registration (with optional 2FA setup)
// - Login (with optional 2FA verification step)
// - Logout
// - Admin actions: list users, edit users, update roles, delete users, create users

const userModel = require('../models/userModel'); // Model that talks to the users table in MySQL
const speakeasy = require('speakeasy'); // Library used for generating/verifying TOTP codes (e.g., Google Authenticator)

// ------------------------------
// EMAIL + PASSWORD VALIDATION
// ------------------------------

// Simple regex to check basic email format, e.g. something@domain.com
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && emailRegex.test(email.trim());
}

// Password must:
// - have at least 1 lowercase letter
// - have at least 1 uppercase letter
// - have at least 1 digit
// - be at least 6 characters long
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
function isValidPassword(password) {
  return typeof password === 'string' && passwordRegex.test(password);
}

// Helper to safely read and clear arrays stored in session (e.g. messages or errors)
// If arr is an array -> splice(0) returns all elements and empties the array
// If not an array -> return empty array
function pop(arr) {
  return Array.isArray(arr) ? arr.splice(0) : [];
}

// Helper to render a view while always passing the logged-in user (from res.locals.user)
// You can also pass extra data in "data"
function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

module.exports = {
  // -------------------------------------------------------------------
  // REGISTER LOGIC (handles 2FA setup during registration)
  // -------------------------------------------------------------------
  register(req, res) {
    const {
      username,
      email,
      password,
      address,
      contact,
      enable2fa,   // checkbox from form: 'on' if checked
      twofa_secret, // TOTP secret generated when user scans QR code
      twofa_token   // 6-digit code user enters from authenticator app
    } = req.body;

    // remember form values so that if validation fails,
    // we can re-fill the form fields for the user
    req.session.formData = {
      username,
      email,
      address,
      contact,
      enable2fa
    };

    const errors = [];
    // Basic required field check
    if (!username || !email || !password || !address || !contact) {
      errors.push('All fields are required.');
    }
    // Email format check
    if (email && !isValidEmail(email)) {
      errors.push('Please provide a valid email address.');
    }
    // Password strength check
    if (password && !isValidPassword(password)) {
      errors.push('Password must be at least 6 characters and include uppercase, lowercase, and a number.');
    }

    // handle toggle for 2FA checkbox
    // enable2fa === 'on' -> store 1 in DB; otherwise 0
    const twofaEnabled = enable2fa === 'on' ? 1 : 0;

    // If user turned on 2FA, verify the 6-digit code from authenticator
    if (twofaEnabled) {
      // User must have scanned QR (secret) and entered a token
      if (!twofa_secret || !twofa_token) {
        errors.push('Please scan the QR code and enter the 6-digit 2FA code.');
      } else {
        // Verify the token using speakeasy TOTP
        const ok = speakeasy.totp.verify({
          secret: twofa_secret,
          encoding: 'base32',
          token: twofa_token,
          window: 1 // small window to allow slight time drift
        });
        if (!ok) {
          errors.push('The 2FA code is invalid. Please try again.');
        }
      }
    }

    // If there are any validation or 2FA errors, redirect back to register
    if (errors.length) {
      req.session.messages = errors;
      return res.redirect('/register');
    }

    // role is not provided by the form; default to 'user'
    const roleNorm = 'user';

    // Check if email already exists in DB
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

      // If all good, create the new user in DB
      userModel.createUser(
        {
          username,
          email,
          password, // in your model, this should be hashed before saving
          address,
          contact,
          role: roleNorm,
          twofa_enabled: twofaEnabled,
          twofa_secret: twofaEnabled ? twofa_secret : null // store secret only if 2FA enabled
        },
        (err2) => {
          if (err2) {
            console.error('[createUser] MySQL:', err2);
            req.session.messages = [err2.sqlMessage || 'Database error'];
            return res.redirect('/register');
          }
          // clear form data + any temporary 2FA secret from session after successful registration
          req.session.formData = null;
          req.session._reg2fa_secret = null;
          req.session.messages = ['Registration successful. Please log in.'];
          return res.redirect('/login');
        }
      );
    });
  },

  // -------------------------------------------------------------------
  // LOGIN PAGE (GET /login)
  // -------------------------------------------------------------------
  showLogin(req, res) {
    // messages and errors might be set previously in session
    const messages = pop(req.session.messages);
    const errors = pop(req.session.errors);
    // Render login.ejs and pass in messages/errors + user (via view())
    return view(res, 'login', { messages, errors });
  },

  // -------------------------------------------------------------------
  // LOGIN LOGIC (POST /login)
  // Step 1: check email + password
  // Step 2: if 2FA is enabled, redirect to /verify2fa to check TOTP
  // -------------------------------------------------------------------
  login(req, res) {
    const { email, password } = req.body;
    // Basic check if fields are filled
    if (!email || !password) {
      req.session.errors = ['Email and password are required'];
      return res.redirect('/login');
    }

    console.log('[LOGIN] Attempt:', email);

    // Validate login (usually checks email + hashed password)
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

      // If 2FA is NOT enabled → login is complete now
      if (!user.twofa_enabled) {
        // Save essential user info in session to mark as logged-in
        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          twofa_enabled: user.twofa_enabled
        };
        console.log('[LOGIN] Success (no 2FA):', user.username, `(${user.role})`);
        // Redirect based on role
        return res.redirect(user.role === 'admin' ? '/inventory' : '/shopping');
      }

      // If 2FA IS enabled → store user in a "pending" session and go verify page
      req.session.pending2fa = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      };
      console.log('[LOGIN] Password OK, 2FA required for', user.email);
      return res.redirect('/verify2fa');
    });
  },

  // -------------------------------------------------------------------
  // SHOW VERIFY 2FA PAGE (GET /verify2fa)
  // Only accessible if there's a pending 2FA login in session
  // -------------------------------------------------------------------
  showVerify2fa(req, res) {
    const pending = req.session.pending2fa;
    if (!pending) {
      // nothing pending, user probably navigated here manually -> back to login
      return res.redirect('/login');
    }
    const messages = pop(req.session.messages);
    // verify2fa.ejs expects "email" + "messages"
    return view(res, 'verify2fa', { messages, email: pending.email });
  },

  // -------------------------------------------------------------------
  // HANDLE 2FA VERIFICATION AFTER LOGIN (POST /verify2fa)
  // Checks the 6-digit TOTP token. If valid → finalize login.
  // -------------------------------------------------------------------
  verify2fa(req, res) {
    const pending = req.session.pending2fa;
    if (!pending) {
      // no pending login, send back to login
      return res.redirect('/login');
    }

    const { token } = req.body; // 6-digit code entered by user
    if (!token) {
      req.session.messages = ['Please enter the 6-digit code.'];
      return res.redirect('/verify2fa');
    }

    // Load latest user info + secret from DB using pending user id
    userModel.getById(pending.id, (err, user) => {
      if (err) {
        console.error('[verify2fa] DB error:', err);
        req.session.messages = [err.sqlMessage || 'Database error'];
        return res.redirect('/login');
      }
      if (!user || !user.twofa_enabled || !user.twofa_secret) {
        // In case user disabled 2FA in between or no secret stored
        req.session.messages = ['2FA is not enabled for this account.'];
        return res.redirect('/login');
      }

      // Verify the TOTP token using Speakeasy
      const ok = speakeasy.totp.verify({
        secret: user.twofa_secret,
        encoding: 'base32',
        token,
        window: 1
      });

      if (!ok) {
        req.session.messages = ['Invalid 2FA code. Please try again.'];
        return res.redirect('/verify2fa');
      }

      // 2FA success → consider user fully logged in
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        twofa_enabled: user.twofa_enabled
      };
      // Remove pending2fa because login is completed
      delete req.session.pending2fa;

      console.log('[LOGIN] 2FA success:', user.username, `(${user.role})`);
      return res.redirect(user.role === 'admin' ? '/inventory' : '/shopping');
    });
  },

  // -------------------------------------------------------------------
  // LOGOUT (GET /logout)
  // Destroys the entire session and redirects to home page
  // -------------------------------------------------------------------
  logout(req, res) {
    req.session.destroy(() => res.redirect('/'));
  },

  // -------------------------------------------------------------------
  // ADMIN: LIST USERS (GET /admin/users)
  // Shows a list of users to admin
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // ADMIN: SHOW EDIT USER FORM (GET /admin/users/:id/edit)
  // -------------------------------------------------------------------
  showEditUser(req, res) {
    const { id } = req.params; // user id from URL
    const messages = pop(req.session.messages);
    const formData = req.session.formData || null; // if previous validation failed
    delete req.session.formData; // clear it after reading

    userModel.getById(id, (err, targetUser) => {
      if (err) {
        console.error('[getById] MySQL:', err);
        req.session.messages = ['Database error'];
        return res.redirect('/admin/users');
      }
      if (!targetUser) {
        req.session.messages = ['User not found'];
        return res.redirect('/admin/users');
      }
      // Render edit form with DB user + any override formData from previous failed submit
      return view(res, 'adminEditUser', { targetUser, messages, formData });
    });
  },

  // -------------------------------------------------------------------
  // ADMIN: UPDATE USER (POST /admin/users/:id/edit)
  // Updates username/email/address/contact (NOT role)
  // -------------------------------------------------------------------
  updateUser(req, res) {
    const { id } = req.params;
    const { username, email, address, contact } = req.body;

    // Save latest form input in session in case validation fails
    req.session.formData = { username, email, address, contact };

    const errors = [];
    // required fields
    if (!username || !email || !address || !contact) {
      errors.push('All fields are required.');
    }
    // email format
    if (email && !isValidEmail(email)) {
      errors.push('Please provide a valid email address.');
    }

    // First, confirm the user exists
    userModel.getById(id, (err, existingUser) => {
      if (err) {
        console.error('[getById] MySQL:', err);
        req.session.messages = ['Database error'];
        return res.redirect(`/admin/users/${id}/edit`);
      }
      if (!existingUser) {
        req.session.messages = ['User not found'];
        return res.redirect('/admin/users');
      }

      // Then, check if email is already used by another account
      userModel.findByEmail(email, (err2, otherUser) => {
        if (err2) {
          console.error('[findByEmail] MySQL:', err2);
          req.session.messages = ['Database error'];
          return res.redirect(`/admin/users/${id}/edit`);
        }
        if (otherUser && String(otherUser.id) !== String(id)) {
          errors.push('Email already in use by another account.');
        }

        // If any validation errors, redirect back to edit form
        if (errors.length) {
          req.session.messages = errors;
          return res.redirect(`/admin/users/${id}/edit`);
        }

        // Perform update in DB
        userModel.updateUser(id, { username, email, address, contact }, (err3) => {
          if (err3) {
            console.error('[updateUser] MySQL:', err3);
            req.session.messages = ['Failed to update user'];
            return res.redirect(`/admin/users/${id}/edit`);
          }
          // Clear temporary form data and show success message
          req.session.formData = null;
          req.session.messages = ['User updated'];
          return res.redirect('/admin/users');
        });
      });
    });
  },

  // -------------------------------------------------------------------
  // ADMIN: UPDATE ROLE (POST /admin/users/:id/role)
  // Quickly change a user's role to 'admin' or 'user'
  // -------------------------------------------------------------------
  updateRole(req, res) {
    const { id } = req.params;
    const { role } = req.body;
    // Only allow 'admin' or 'user', everything else becomes 'user'
    const roleNorm = String(role).toLowerCase() === 'admin' ? 'admin' : 'user';

    // prevent demoting the last admin (lightweight check)
    userModel.countAdmins((err, count) => {
      if (err) {
        console.error('[countAdmins] MySQL:', err);
        req.session.messages = ['Database error'];
        return res.redirect('/admin/users');
      }
      // If we are changing role to 'user' and there is only 1 admin -> block
      if (roleNorm === 'user' && count <= 1) {
        req.session.messages = ['Cannot remove role: at least one admin required'];
        return res.redirect('/admin/users');
      }

      // Update role in DB
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

  // -------------------------------------------------------------------
  // ADMIN: DELETE USER (POST /admin/users/:id/delete)
  // Has protections:
  // - Admin cannot delete themselves
  // - Cannot delete the last remaining admin
  // -------------------------------------------------------------------
  deleteUser(req, res) {
    const { id } = req.params;

    // prevent deleting self while logged in as admin
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

      // Do not allow deleting users that have existing orders
      userModel.countOrdersByUser(id, (err2, orderCount) => {
        if (err2) {
          console.error('[countOrdersByUser] MySQL:', err2);
          req.session.messages = ['Database error'];
          return res.redirect('/admin/users');
        }
        if (orderCount > 0) {
          req.session.messages = ['Cannot delete user with existing orders'];
          return res.redirect('/admin/users');
        }

        // If the target user is an admin, check total number of admins
        if (u.role === 'admin') {
          userModel.countAdmins((err3, count) => {
            if (err3) {
              console.error('[countAdmins] MySQL:', err3);
              req.session.messages = ['Database error'];
              return res.redirect('/admin/users');
            }
            if (count <= 1) {
              // There is only one admin left, do not allow deleting
              req.session.messages = ['Cannot delete the last admin'];
              return res.redirect('/admin/users');
            }

            // Safe to delete admin (not the last one)
            userModel.deleteUser(id, (err4) => {
              if (err4) {
                console.error('[deleteUser] MySQL:', err4);
                req.session.messages = ['Failed to delete user'];
              } else {
                req.session.messages = ['User deleted'];
              }
              return res.redirect('/admin/users');
            });
          });
        } else {
          // If the user is not an admin, just delete directly
          userModel.deleteUser(id, (err5) => {
            if (err5) {
              console.error('[deleteUser] MySQL:', err5);
              req.session.messages = ['Failed to delete user'];
            } else {
              req.session.messages = ['User deleted'];
            }
            return res.redirect('/admin/users');
          });
        }
      });
    });
  },

  // -------------------------------------------------------------------
  // ADMIN: SHOW CREATE USER FORM (GET /admin/users/new)
  // -------------------------------------------------------------------
  showCreateUser(req, res) {
    const messages = pop(req.session.messages);
    const formData = req.session.formData || null; // keep last entered inputs if there was an error
    return view(res, 'adminAddUser', { messages, formData });
  },

  // -------------------------------------------------------------------
  // ADMIN: CREATE USER WITH ROLE (POST /admin/users/new)
  // Similar to public registration, but admin can choose role.
  // -------------------------------------------------------------------
  adminCreateUser(req, res) {
    const { username, email, password, address, contact, role } = req.body;
    // Save form data for re-use if validation fails
    req.session.formData = { username, email, address, contact, role };

    const errors = [];
    // Basic required fields check
    if (!username || !email || !password || !address || !contact || !role) {
      errors.push('All fields are required.');
    }
    // Email format
    if (email && !isValidEmail(email)) {
      errors.push('Please provide a valid email address.');
    }
    // Password strength
    if (password && !isValidPassword(password)) {
      errors.push('Password must be at least 6 characters and include uppercase, lowercase, and a number.');
    }

    // Normalize role input ('admin' or 'user') (Is like if else statement)
    const roleNorm = String(role).toLowerCase() === 'admin' ? 'admin' : 'user';

    // If any validation errors so far, go back to create form
    if (errors.length) {
      req.session.messages = errors;
      return res.redirect('/admin/users/new');
    }

    // Check if email already exists
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

      // Create user with the chosen role
      userModel.createUser(
        { username, email, password, address, contact, role: roleNorm },
        (err2) => {
          if (err2) {
            console.error('[createUser] MySQL:', err2);
            req.session.messages = [err2.sqlMessage || 'Database error'];
            return res.redirect('/admin/users/new');
          }
          // Clear form data and show success
          req.session.formData = null;
          req.session.messages = ['User created'];
          return res.redirect('/admin/users');
        }
      );
    });
  }
};
