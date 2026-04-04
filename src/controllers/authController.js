const { models:{User, OTPVerification, RefreshToken, Wallet} } = require('../models/index.js');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

//  OTP helpers 
const generateOTPCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const saveOTP = async (target, purpose) => {
  await OTPVerification.update(
    { is_used: true },
    { where: { [Op.or]: [{ phone: target }, { email: target }], purpose, is_used: false } }
  );
  const otp_code = generateOTPCode();
  const isEmail = target.includes('@');
  await OTPVerification.create({
    phone: isEmail ? null : target,
    email: isEmail ? target : null,
    otp_code,
    purpose,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
  });
  return otp_code;
};

const verifyOTP = async (target, code, purpose) => {
  const isEmail = target.includes('@');
  const record = await OTPVerification.findOne({
    where: {
      ...(isEmail ? { email: target } : { phone: target }),
      otp_code: code,
      purpose,
      is_used: false,
      expires_at: { [Op.gt]: new Date() },
    },
  });
  if (!record) return { valid: false, reason: 'Invalid or expired OTP' };
  await record.update({ is_used: true });
  return { valid: true };
};

//  Refresh Token DB helpers 
const REFRESH_TOKEN_TTL_DAYS = 30;

const storeRefreshToken = async (userId, token, req) => {
  const expires_at = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const ip_address = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  const user_agent = req?.headers?.['user-agent'] || null;

  // Hard-delete ALL previous tokens for this user, then insert exactly one new one.
  // This ensures one active token per user at all times and keeps the table clean.
  await RefreshToken.destroy({ where: { user_id: userId } });
  return RefreshToken.create({ user_id: userId, token, expires_at, ip_address, user_agent });
};

const revokeRefreshToken = async (token) => {
  await RefreshToken.destroy({ where: { token } });
};

const findValidRefreshToken = async (token) => {
  // Since we hard-delete on logout/rotation, any existing row is valid as long as not expired
  return RefreshToken.findOne({
    where: {
      token,
      expires_at: { [Op.gt]: new Date() },
    },
  });
};

// POST /auth/register
const register = async (req, res) => {
  try {
    const { fullName, phoneNumber, email, password, termsAccepted } = req.body;

    if (!termsAccepted)
      return errorResponse(res, 'You must accept terms and conditions', 400, 'TERMS_NOT_ACCEPTED');

    if (!fullName)
      return errorResponse(res, 'Full name is required', 400, 'FULL_NAME_REQUIRED');

    if (!phoneNumber)
      return errorResponse(res, 'Phone number is required', 400, 'PHONE_REQUIRED');

    if (!email)
      return errorResponse(res, 'Email is required', 400, 'EMAIL_REQUIRED');

    if (!password)
      return errorResponse(res, 'Password is required', 400, 'PASSWORD_REQUIRED');

    const existingPhone = await User.findOne({ where: { phone_number: phoneNumber, role: 'patient' } });
    if (existingPhone)
      return errorResponse(res, 'Phone number already registered', 409, 'PHONE_EXISTS');

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail)
      return errorResponse(res, 'Email already registered', 409, 'EMAIL_EXISTS');

    const user = await User.create({
      role: 'patient',
      full_name: fullName,
      phone_number: phoneNumber,
      email,
      password_hash: password,
    });

    // Auto-create wallet so patient can pay immediately after registration
    await Wallet.create({
      user_id: user.id,
      balance: 5000,
      currency: 'KES',
      is_active: true,
    });

    const otpCode = await saveOTP(phoneNumber, 'registration');
    console.log(`Generated OTP for ${phoneNumber}: ${otpCode}`); // For testing purposes
    // TODO: await sendSMS(phoneNumber, `Your AfyaBridge verification code is ${otpCode}`);

    return successResponse(res, {
      patientId: user.id,
      phoneNumber: user.phone_number,
      verificationRequired: true,
      verificationMethod: 'sms',
    }, 'Registration successful', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'REGISTER_ERROR');
  }
};

// POST /auth/verify
const verifyPhone = async (req, res) => {
  try {
    const { phoneNumber, otpCode } = req.body;

    const result = await verifyOTP(phoneNumber, otpCode, 'registration');
    if (!result.valid)
      return errorResponse(res, result.reason, 400, 'INVALID_OTP');

    await User.update({ is_verified: true }, { where: { phone_number: phoneNumber, role: 'patient' } });

    return successResponse(res, { verified: true, nextStep: 'complete_profile' }, 'Phone verified successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'VERIFY_ERROR');
  }
};

// POST /auth/resend-otp
const resendOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    const user = await User.findOne({ where: { phone_number: phoneNumber, role: 'patient' } });
    if (!user)
      return errorResponse(res, 'Phone number not registered', 404, 'NOT_FOUND');

    const otpCode = await saveOTP(phoneNumber, 'registration');
    // TODO: await sendSMS(phoneNumber, `Your AfyaBridge verification code is ${otpCode}`);

    return successResponse(res, { expiresIn: 300 }, 'OTP resent successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'RESEND_OTP_ERROR');
  }
};

// POST /auth/login
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Detect whether identifier is email or phone
    const isEmail = identifier.includes('@');

    const user = await User.findOne({
      where: {
        ...(isEmail ? { email: identifier } : { phone_number: identifier }),
        role: 'patient',
      },
    });

    if (!user)
      return errorResponse(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const isValid = await user.comparePassword(password);
    if (!isValid)
      return errorResponse(res, 'Invalid credentials', 401, 'INVALID_CREDENTIALS');

    if (!user.is_verified) {
      // Always send OTP to phone, regardless of login method
      const otpCode = await saveOTP(user.phone_number, 'registration');
      console.log(`Generated OTP for ${user.phone_number}: ${otpCode}`);
      return errorResponse(res, 'Phone not verified. A new code has been sent.', 403, 'NOT_VERIFIED');
    }

    if (!user.is_active || user.account_status !== 'active')
      return errorResponse(res, 'Account has been disabled', 403, 'ACCOUNT_DISABLED');

    const accessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    await storeRefreshToken(user.id, newRefreshToken, req);
    await User.update({ last_login: new Date() }, { where: { id: user.id } });

    return successResponse(res, {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
      patient: {
        id: user.id,
        role: user.role,
        phoneNumber: user.phone_number,
        firstName: user.full_name.split(' ')[0],
        lastName: user.full_name.split(' ').slice(1).join(' '),
      },
    }, 'Login successful');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'LOGIN_ERROR');
  }
};

// POST /auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;

    const user = await User.findOne({ where: { phone_number: identifier, role: 'patient' } });
    if (!user)
      return errorResponse(res, 'Phone number not found', 404, 'NOT_FOUND');

    const otpCode = await saveOTP(identifier, 'password_reset');
    console.log(otpCode)
    // TODO: await sendSMS(identifier, `Your AfyaBridge password reset code is ${otpCode}`);

    const maskedPhone = identifier.slice(0, 5) + '******' + identifier.slice(-3);

    return successResponse(res, {
      resetToken: `reset_${uuidv4()}`,
      expiresIn: 300,
      hint: `Code sent to ${maskedPhone}`,
    }, 'Reset code sent');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'FORGOT_PASSWORD_ERROR');
  }
};

// POST /auth/verify-reset-code
const verifyResetCode = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    const result = await verifyOTP(phoneNumber, code, 'password_reset');
    if (!result.valid)
      return errorResponse(res, result.reason, 400, 'INVALID_CODE');

    return successResponse(res, { verified: true, resetToken: `verified_${uuidv4()}` }, 'Code verified');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'VERIFY_RESET_ERROR');
  }
};

// POST /auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { phoneNumber, newPassword, resetToken } = req.body;

    if (!resetToken || !resetToken.startsWith('verified_'))
      return errorResponse(res, 'Invalid or expired reset token', 400, 'INVALID_TOKEN');

    const user = await User.findOne({ where: { phone_number: phoneNumber, role: 'patient' } });
    if (!user)
      return errorResponse(res, 'User not found', 404, 'NOT_FOUND');

    await user.update({
      password_hash: newPassword,
      last_password_change: new Date(),
    });

    // Revoke all refresh tokens on password reset for security
    await RefreshToken.destroy({ where: { user_id: user.id } });

    return successResponse(res, { redirectTo: '/login' }, 'Password reset successful');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'RESET_PASSWORD_ERROR');
  }
};

// POST /auth/logout
const logout = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    // Revoke the specific refresh token from the DB
    if (token) {
      await revokeRefreshToken(token);
    }

    return successResponse(res, null, 'Signed out successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'LOGOUT_ERROR');
  }
};

// POST /auth/refresh-token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token)
      return errorResponse(res, 'Refresh token required', 400, 'MISSING_TOKEN');

    // 1. Verify JWT signature + expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError')
        return errorResponse(res, 'Refresh token expired. Please login again.', 401, 'REFRESH_TOKEN_EXPIRED');
      return errorResponse(res, 'Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    // 2. Check DB — must exist and not be revoked
    const storedToken = await findValidRefreshToken(token);
    if (!storedToken)
      return errorResponse(res, 'Refresh token revoked or not found. Please login again.', 401, 'REFRESH_TOKEN_REVOKED');

    const user = await User.findByPk(decoded.id || decoded.patientId);
    if (!user || !user.is_active)
      return errorResponse(res, 'Account not found or disabled', 401, 'UNAUTHORIZED');

    // 3. Rotate: revoke old token, issue new pair
    await revokeRefreshToken(token);
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(user.id, newRefreshToken, req);

    return successResponse(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    }, 'Token refreshed successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'REFRESH_TOKEN_ERROR');
  }
};

// POST /auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const isValid = await req.user.comparePassword(currentPassword);
    if (!isValid)
      return errorResponse(res, 'Current password is incorrect', 400, 'INVALID_PASSWORD');

    if (currentPassword === newPassword)
      return errorResponse(res, 'New password must be different', 400, 'SAME_PASSWORD');

    await req.user.update({
      password_hash: newPassword,
      last_password_change: new Date(),
    });

    // Revoke all refresh tokens on password change for security
    await RefreshToken.destroy({ where: { user_id: req.user.id } });

    return successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CHANGE_PASSWORD_ERROR');
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
  changePassword,
};