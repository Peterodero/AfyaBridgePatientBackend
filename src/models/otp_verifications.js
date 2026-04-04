const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // OTP VERIFICATION
  // Stores one-time passwords for phone/email verification
  // across all user types and all systems.
  // ─────────────────────────────────────────────────────────────
  return sequelize.define("OTPVerification", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Target ──────────────────────────────────────────────
    // Either phone or email — one must be provided
    phone: {
      type: DataTypes.STRING(20),
    },
    email: {
      type: DataTypes.STRING(255),
      validate: { isEmail: true },
    },

    // ─── OTP ─────────────────────────────────────────────────
    otp_code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    purpose: {
      type: DataTypes.ENUM(
        "registration",                 // new user verifying phone/email
        "login",                        // 2FA login
        "password_reset",               // forgot password flow
        "delivery_confirmation",      // rider confirms delivery to patient
      ),
      allowNull: false,
    },

    // ─── Status ──────────────────────────────────────────────
    is_used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

  }, {
    tableName: "otp_verifications",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["phone"] },
      { fields: ["email"] },
      { fields: ["is_used"] },
      { fields: ["expires_at"] },
    ],
  });
};