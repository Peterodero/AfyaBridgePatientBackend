const { OTP } = require('../models');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const saveOTP = async (phoneNumber, type = 'verification') => {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRES_IN) || 300) * 1000);

  // Invalidate previous OTPs of same type
  await OTP.update({ used: true }, { where: { phoneNumber, type, used: false } });

  await OTP.create({ phoneNumber, code, type, expiresAt });
  return code;
};

const verifyOTP = async (phoneNumber, code, type = 'verification') => {
  const otp = await OTP.findOne({
    where: { phoneNumber, code, type, used: false },
    order: [['createdAt', 'DESC']],
  });

  if (!otp) return { valid: false, reason: 'Invalid OTP code' };
  if (new Date() > otp.expiresAt) return { valid: false, reason: 'OTP has expired' };

  await otp.update({ used: true });
  return { valid: true };
};

// In production, send via Twilio. For now logs to console.
const sendOTP = async (phoneNumber, code) => {
  if (process.env.NODE_ENV === 'production') {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      body: `Your AfyaBridge verification code is: ${code}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });
  } else {
    console.log(`OTP for ${phoneNumber}: ${code}`);
  }
};

module.exports = { saveOTP, verifyOTP, sendOTP };
