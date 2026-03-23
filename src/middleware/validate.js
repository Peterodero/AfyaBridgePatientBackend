const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/response');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = {};
    errors.array().forEach((err) => {
      if (!details[err.path]) details[err.path] = [];
      details[err.path].push(err.msg);
    });
    return errorResponse(res, 'Validation failed', 422, 'VALIDATION_ERROR', details);
  }
  next();
};

module.exports = { validate };
