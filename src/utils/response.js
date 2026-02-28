const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const errorResponse = (res, message, statusCode = 400, code = 'ERROR', details = null) => {
  const error = { code, message, timestamp: new Date().toISOString() };
  if (details) error.details = details;
  return res.status(statusCode).json({ success: false, error });
};

const paginatedResponse = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) },
  });
};

module.exports = { successResponse, errorResponse, paginatedResponse };
