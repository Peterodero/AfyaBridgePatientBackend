const { Patient, RefreshToken } = require("../models");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const { saveOTP, verifyOTP, sendOTP } = require("../utils/otp");
const { successResponse, errorResponse } = require("../utils/response");
const { v4: uuidv4 } = require("uuid");

// POST /auth/register
const register = async (req, res) => {
  try {
    const { fullName, phoneNumber, email, password, termsAccepted } = req.body;

    if (!termsAccepted)
      return errorResponse(
        res,
        "You must accept terms and conditions",
        400,
        "TERMS_NOT_ACCEPTED",
      );

    const existingPatient = await Patient.findOne({ where: { phoneNumber } });
    if (existingPatient)
      return errorResponse(
        res,
        "Phone number already registered",
        409,
        "PHONE_EXISTS",
      );

    if (email) {
      const emailExists = await Patient.findOne({ where: { email } });
      if (emailExists)
        return errorResponse(
          res,
          "Email already registered",
          409,
          "EMAIL_EXISTS",
        );
    }

    const patient = await Patient.create({
      fullName,
      phoneNumber,
      email,
      password,
    });

    const otpCode = await saveOTP(phoneNumber, "verification");
    await sendOTP(phoneNumber, otpCode);

    return successResponse(
      res,
      {
        patientId: patient.id,
        phoneNumber: patient.phoneNumber,
        verificationRequired: true,
        verificationMethod: "sms",
      },
      "Registration successful",
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "REGISTER_ERROR");
  }
};

// POST /auth/verify
const verifyPhone = async (req, res) => {
  try {
    const { phoneNumber, otpCode } = req.body;

    const result = await verifyOTP(phoneNumber, otpCode, "verification");
    if (!result.valid)
      return errorResponse(res, result.reason, 400, "INVALID_OTP");

    await Patient.update({ isVerified: true }, { where: { phoneNumber } });

    return successResponse(
      res,
      { verified: true, nextStep: "complete_profile" },
      "Phone verified successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "VERIFY_ERROR");
  }
};

// POST /auth/resend-otp
const resendOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    const patient = await Patient.findOne({ where: { phoneNumber } });
    if (!patient)
      return errorResponse(
        res,
        "Phone number not registered",
        404,
        "NOT_FOUND",
      );

    const otpCode = await saveOTP(phoneNumber, "verification");
    await sendOTP(phoneNumber, otpCode);

    return successResponse(res, { expiresIn: 300 }, "OTP resent successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "RESEND_OTP_ERROR");
  }
};

// POST /auth/login
const login = async (req, res) => {
  try {
    const { identifier, password, deviceInfo } = req.body;

    const patient = await Patient.findOne({
      where: { phoneNumber: identifier },
    });
    if (!patient)
      return errorResponse(
        res,
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );

    const isValid = await patient.comparePassword(password);
    if (!isValid)
      return errorResponse(
        res,
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );

    // if (!patient.isVerified) return errorResponse(res, 'Phone number not verified', 403, 'NOT_VERIFIED');
    if (!patient.isVerified) {
      // Automatically resend a fresh OTP
      const otpCode = await saveOTP(patient.phoneNumber, "verification");
      await sendOTP(patient.phoneNumber, otpCode);

      return errorResponse(
        res,
        "Phone number not verified. A new verification code has been sent to your phone.",
        403,
        "NOT_VERIFIED",
      );
    }
    if (!patient.isActive)
      return errorResponse(
        res,
        "Account has been disabled",
        403,
        "ACCOUNT_DISABLED",
      );

    const accessToken = generateAccessToken(patient.id);
    const refreshToken = generateRefreshToken(patient.id);

    await RefreshToken.create({
      token: refreshToken,
      patientId: patient.id,
      deviceId: deviceInfo?.deviceId,
      platform: deviceInfo?.platform,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return successResponse(
      res,
      {
        accessToken,
        refreshToken,
        expiresIn: 3600,
        patient: {
          id: patient.id,
          phoneNumber: patient.phoneNumber,
          firstName: patient.fullName.split(" ")[0],
          lastName: patient.fullName.split(" ").slice(1).join(" "),
        },
      },
      "Login successful",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "LOGIN_ERROR");
  }
};

// POST /auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;

    const patient = await Patient.findOne({
      where: { phoneNumber: identifier },
    });
    if (!patient)
      return errorResponse(res, "Phone number not found", 404, "NOT_FOUND");

    const otpCode = await saveOTP(identifier, "reset");
    await sendOTP(identifier, otpCode);

    const maskedPhone =
      identifier.slice(0, 5) + "******" + identifier.slice(-3);

    return successResponse(
      res,
      {
        resetToken: `reset_${uuidv4()}`,
        expiresIn: 300,
        hint: `Code sent to ${maskedPhone}`,
      },
      "Reset code sent",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "FORGOT_PASSWORD_ERROR");
  }
};

// POST /auth/verify-reset-code
const verifyResetCode = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    const result = await verifyOTP(phoneNumber, code, "reset");
    if (!result.valid)
      return errorResponse(res, result.reason, 400, "INVALID_CODE");

    return successResponse(
      res,
      { verified: true, resetToken: `verified_${uuidv4()}` },
      "Code verified",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "VERIFY_RESET_ERROR");
  }
};

// POST /auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { phoneNumber, newPassword, resetToken } = req.body;

    if (!resetToken || !resetToken.startsWith("verified_")) {
      return errorResponse(
        res,
        "Invalid or expired reset token",
        400,
        "INVALID_TOKEN",
      );
    }

    const patient = await Patient.findOne({ where: { phoneNumber } });
    if (!patient)
      return errorResponse(res, "Patient not found", 404, "NOT_FOUND");

    await patient.update({
      password: newPassword,
      lastPasswordChange: new Date(),
    });

    return successResponse(
      res,
      { redirectTo: "/login" },
      "Password reset successful",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "RESET_PASSWORD_ERROR");
  }
};

// POST /auth/logout

const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      await RefreshToken.update(
        { revoked: true },
        { where: { patientId: req.patient?.id } },
      );
    }
    return successResponse(res, null, "Signed out successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "LOGOUT_ERROR");
  }
};

// POST /auth/refresh-token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return errorResponse(res, "Refresh token required", 400, "MISSING_TOKEN");
    }

    // Verify the refresh token is valid
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return errorResponse(
          res,
          "Refresh token expired. Please login again.",
          401,
          "REFRESH_TOKEN_EXPIRED",
        );
      }
      return errorResponse(
        res,
        "Invalid refresh token",
        401,
        "INVALID_REFRESH_TOKEN",
      );
    }

    // Check if refresh token exists and is not revoked in database
    const storedToken = await RefreshToken.findOne({
      where: {
        token: refreshToken,
        patientId: decoded.patientId,
        revoked: false,
      },
    });

    if (!storedToken) {
      return errorResponse(
        res,
        "Refresh token not found or revoked. Please login again.",
        401,
        "INVALID_REFRESH_TOKEN",
      );
    }

    // Check if refresh token has expired in database
    if (new Date() > storedToken.expiresAt) {
      await storedToken.update({ revoked: true });
      return errorResponse(
        res,
        "Refresh token expired. Please login again.",
        401,
        "REFRESH_TOKEN_EXPIRED",
      );
    }

    // Check patient still exists and is active
    const patient = await Patient.findByPk(decoded.patientId);
    if (!patient || !patient.isActive) {
      return errorResponse(
        res,
        "Account not found or disabled",
        401,
        "UNAUTHORIZED",
      );
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(patient.id);

    // Optional: Rotate refresh token (more secure)
    const newRefreshToken = generateRefreshToken(patient.id);

    // Revoke old refresh token
    await storedToken.update({ revoked: true });

    // Save new refresh token
    await RefreshToken.create({
      token: newRefreshToken,
      patientId: patient.id,
      deviceId: storedToken.deviceId,
      platform: storedToken.platform,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return successResponse(
      res,
      {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
      },
      "Token refreshed successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "REFRESH_TOKEN_ERROR");
  }
};

//  CHANGE PASSWORD

// POST /auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const isValid = await req.patient.comparePassword(currentPassword);
    if (!isValid) {
      return errorResponse(
        res,
        "Current password is incorrect",
        400,
        "INVALID_PASSWORD",
      );
    }

    if (currentPassword === newPassword) {
      return errorResponse(
        res,
        "New password must be different from current password",
        400,
        "SAME_PASSWORD",
      );
    }

    await req.patient.update({
      password: newPassword,
      lastPasswordChange: new Date(),
    });

    return successResponse(res, null, "Password changed successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "CHANGE_PASSWORD_ERROR");
  }
};

module.exports = {
  register,
  verifyPhone,
  resendOTP,
  login,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  logout,
  refreshToken,
  changePassword
};
