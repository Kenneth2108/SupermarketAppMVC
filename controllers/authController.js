// controllers/authController.js
// ---------------------------------------------------------------
// This controller handles showing the registration form with 2FA setup
//
// For registration, it:
// 1) Generates a TOTP secret (base32) using speakeasy
// 2) Stores the secret in the session (req.session._reg2fa_secret)
// 3) Builds an otpauth:// URL for authenticator apps (e.g. Google Authenticator)
// 4) Generates a QR code (data URL) from the otpauth URL using qrcode
// 5) Renders the register view with:
//      - formData   → to repopulate failed attempts
//      - messages   → validation / error messages
//      - twofa      → { secret, qr } passed to EJS so user can scan the QR
// ---------------------------------------------------------------

const speakeasy = require('speakeasy'); // For generating TOTP secrets
const QRCode = require('qrcode');       // For generating QR code images

// ---------------------------------------------------------------
// Helper: view(res, templateName, data)
//
// Wraps res.render() so that we always inject `user` from res.locals,
// which can be used by navbars / layouts.
// ---------------------------------------------------------------
function view(res, name, data = {}) {
  return res.render(name, { ...data, user: res.locals.user });
}

module.exports = {
  // -------------------------------------------------------------
  // GET /register
  //
  // Shows the registration page with 2FA setup:
  //
  // Flow:
  // 1) formData is loaded from session if previous submission failed.
  // 2) messages are popped from req.session.messages (flash-like).
  // 3) Check if there is already a 2FA secret in session (_reg2fa_secret):
  //      - If not, generate a new secret with speakeasy.generateSecret().
  //      - Store base32 secret in session for this registration flow.
  // 4) Build otpauth URL:
  //      otpauth://totp/SupermarketApp?secret=SECRET&issuer=SupermarketApp
  //    This format is understood by authenticator apps.
  // 5) Use QRCode.toDataURL() to produce a Base64 data URL for the QR image.
  // 6) Render register.ejs with:
  //      - messages
  //      - formData
  //      - twofa: { secret, qr }
  //
  // In the EJS template, you can:
  //   - Display QR:   <img src="<%= twofa.qr %>" />
  //   - Show secret:  <%= twofa.secret %>
  //   - Use hidden input for twofa_secret, etc.
  // -------------------------------------------------------------
  showRegister(req, res) {
    // formData is used to repopulate form fields on validation errors
    const formData = req.session.formData || null;

    // Pop and clear flash messages (if any)
    const messages = Array.isArray(req.session.messages)
      ? req.session.messages.splice(0)
      : [];

    // 2FA base32 secret for this registration flow
    let base32 = req.session._reg2fa_secret;

    // If no secret in session yet, generate a new one
    if (!base32) {
      // speakeasy.generateSecret returns an object; we take base32 version
      base32 = speakeasy.generateSecret({
        name: 'Supermarket App', // label shown in authenticator app
        length: 20               // length of the secret
      }).base32;

      // Store in session so it stays consistent during registration
      req.session._reg2fa_secret = base32;
    }

    // Build otpauth:// URL for TOTP (RFC standard for authenticator apps)
    // Format: otpauth://totp/Label?secret=SECRET&issuer=ISSUER
    const otpauthUrl = `otpauth://totp/SupermarketApp?secret=${base32}&issuer=SupermarketApp`;

    // Generate a QR code image (data URL) from the otpauth URL
    QRCode.toDataURL(otpauthUrl, (err, dataUrl) => {
      if (err) {
        // If QR generation fails, log error and show a message
        console.error('[QRCode] error:', err);
        messages.push('Failed to generate QR code');

        // Render register view with no 2FA QR (twofa: null)
        return view(res, 'register', {
          messages,
          formData,
          twofa: null
        });
      }

      // On success, render register with the secret and QR code data URL
      return view(res, 'register', {
        messages,
        formData,
        twofa: {
          secret: base32, // base32 secret the user will need if they type manually
          qr: dataUrl     // QR code image as data URL for <img src="...">
        }
      });
    });
  }
};
