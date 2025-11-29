// middleware.js
function attachUser(req, res, next) {
  res.locals.user = req.session.user || null;
  next();
}

function ensureRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.session.messages = ['Please log in to continue'];
      return res.redirect('/login');
    }
    if (req.session.user.role !== role) {
      return res.status(403).send(role === 'admin' ? 'Admins only' : 'Users only');
    }
    return next();
  };
}

const ensureAdmin = ensureRole('admin');
const ensureUser = ensureRole('user');

module.exports = {
  attachUser,
  ensureAdmin,
  ensureUser
};
