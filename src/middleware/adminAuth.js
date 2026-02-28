const { errorResponse } = require('../utils/response');
require('dotenv').config();

// Admin requests must come with a shared secret key
// In production this will be replaced with proper admin JWT
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  

  if (!adminKey) {
    return errorResponse(res, 'Admin key required', 401, 'UNAUTHORIZED');
  }

  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return errorResponse(res, 'Invalid admin key', 403, 'FORBIDDEN');
  }

  next();
};

module.exports = { adminAuth };