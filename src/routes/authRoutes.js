const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authController = require("../controllers/authController");

// POST /auth/register
router.post(
  "/register",
  [
    body("fullName").trim().notEmpty().withMessage("Full name is required"),
    body("phoneNumber")
      .matches(/^\+254[0-9]{9}$/)
      .withMessage("Valid Kenyan phone number required (+254...)"),
    body("email").optional().isEmail().withMessage("Valid email required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain a number"),
    body("confirmPassword")
      .custom((val, { req }) => val === req.body.password)
      .withMessage("Passwords do not match"),
    body("termsAccepted")
      .isBoolean()
      .equals("true")
      .withMessage("You must accept terms"),
    validate,
  ],
  authController.register,
);

// POST /auth/verify
router.post(
  "/verify",
  [
    body("phoneNumber").notEmpty().withMessage("Phone number required"),
    body("otpCode")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
    validate,
  ],
  authController.verifyPhone,
);

// POST /auth/resend-otp
router.post(
  "/resend-otp",
  [
    body("phoneNumber").notEmpty().withMessage("Phone number required"),
    validate,
  ],
  authController.resendOTP,
);

// POST /auth/login
router.post(
  "/login",
  [
    body("identifier").notEmpty().withMessage("Phone number required"),
    body("password").notEmpty().withMessage("Password required"),
    validate,
  ],
  authController.login,
);

// POST /auth/forgot-password
router.post(
  "/forgot-password",
  [
    body("identifier").notEmpty().withMessage("Phone number required"),
    validate,
  ],
  authController.forgotPassword,
);

// POST /auth/verify-reset-code
router.post(
  "/verify-reset-code",
  [
    body("phoneNumber").notEmpty().withMessage("Phone number required"),
    body("code")
      .isLength({ min: 6, max: 6 })
      .withMessage("Code must be 6 digits"),
    validate,
  ],
  authController.verifyResetCode,
);

// POST /auth/reset-password
router.post(
  "/reset-password",
  [
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("confirmPassword")
      .custom((val, { req }) => val === req.body.newPassword)
      .withMessage("Passwords do not match"),
    body("resetToken").notEmpty().withMessage("Reset token required"),
    validate,
  ],
  authController.resetPassword,
);

// POST /auth/change-password
router.post("/change-password", authenticate, authController.changePassword);

// POST /auth/logout
router.post("/logout", authenticate, authController.logout);

// POST /auth/refresh-token
router.post(
  "/refresh-token",
  [
    body("refreshToken").notEmpty().withMessage("Refresh token required"),
    validate,
  ],
  authController.refreshToken,
);

module.exports = router;
