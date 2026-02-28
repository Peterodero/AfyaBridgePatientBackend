const { verifyAccessToken } = require("../utils/jwt");
const { Patient } = require("../models");
const { errorResponse } = require("../utils/response");

// const authenticate = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       return errorResponse(res, 'No token provided', 401, 'UNAUTHORIZED');
//     }

//     const token = authHeader.split(' ')[1];

//     // Check if token is blacklisted (logged out)
//     const isBlacklisted = await TokenBlacklist.findOne({ where: { token } });
//     if (isBlacklisted) {
//       return errorResponse(res, 'Token has been invalidated. Please login again.', 401, 'TOKEN_INVALIDATED');
//     }

//     const decoded = verifyAccessToken(token);

//     const patient = await Patient.findByPk(decoded.patientId);
//     if (!patient || !patient.isActive) {
//       return errorResponse(res, 'Patient not found or account disabled', 401, 'UNAUTHORIZED');
//     }

//     req.patient = patient;
//     next();
//   } catch (error) {
//     if (error.name === 'TokenExpiredError') return errorResponse(res, 'Token expired', 401, 'TOKEN_EXPIRED');
//     return errorResponse(res, 'Invalid token', 401, 'INVALID_TOKEN');
//   }
// };

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, "No token provided", 401, "UNAUTHORIZED");
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    const patient = await Patient.findByPk(decoded.patientId);
    if (!patient || !patient.isActive) {
      return errorResponse(
        res,
        "Patient not found or account disabled",
        401,
        "UNAUTHORIZED",
      );
    }

    req.patient = patient;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError")
      return errorResponse(res, "Token expired", 401, "TOKEN_EXPIRED");
    return errorResponse(res, "Invalid token", 401, "INVALID_TOKEN");
  }
};

module.exports = { authenticate };
