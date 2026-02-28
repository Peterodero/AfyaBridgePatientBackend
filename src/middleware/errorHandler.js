const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err.name === 'SequelizeValidationError') {
    const details = {};
    err.errors.forEach((e) => {
      if (!details[e.path]) details[e.path] = [];
      details[e.path].push(e.message);
    });
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Database validation failed', details, timestamp: new Date().toISOString() } });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Record already exists', timestamp: new Date().toISOString() } });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error', timestamp: new Date().toISOString() },
  });
};

module.exports = { errorHandler };
