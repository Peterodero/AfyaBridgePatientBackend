const { verifyAccessToken } = require("../utils/jwt");
const { User } = require("../models");
const { errorResponse } = require("../utils/response");

// const authenticate = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return errorResponse(res, "No token provided", 401, "UNAUTHORIZED");
//     }

//     const token = authHeader.split(" ")[1];
//     const decoded = verifyAccessToken(token);

//     const patient = await User.findByPk(decoded.patientId);
//     if (!patient || !patient.isActive) {
//       return errorResponse(
//         res,
//         "Patient not found or account disabled",
//         401,
//         "UNAUTHORIZED",
//       );
//     }

//     req.patient = patient;
//     next();
//   } catch (error) {
//     if (error.name === "TokenExpiredError")
//       return errorResponse(res, "Token expired", 401, "TOKEN_EXPIRED");
//     return errorResponse(res, "Invalid token", 401, "INVALID_TOKEN");
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

    const userId = decoded.id || decoded.userId || decoded.patientId;
    
    if (!userId) {
      return errorResponse(res, "Invalid token payload", 401, "INVALID_TOKEN");
    }

    const user = await User.findByPk(userId);
    
    if (!user) {
      return errorResponse(res, "User not found", 401, "UNAUTHORIZED");
    }

    // Check if account is active - using snake_case column names
    if (!user.is_active || user.account_status !== 'active') {
      return errorResponse(res, "Account disabled or inactive", 401, "UNAUTHORIZED");
    }

    if (user.role !== 'patient') {
      return errorResponse(res, "Access denied: Patient only route", 403, "FORBIDDEN");
    }

    // Attach user to request (using 'user' instead of 'patient' for consistency)
    req.user = user;
    req.patient = user; 
    
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, "Token expired", 401, "TOKEN_EXPIRED");
    }
    if (error.name === "JsonWebTokenError") {
      return errorResponse(res, "Invalid token", 401, "INVALID_TOKEN");
    }
    return errorResponse(res, "Authentication failed", 500, "AUTH_ERROR");
  }
};

module.exports = { authenticate };
