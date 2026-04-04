const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // PHARMACY REGISTRATION
  // Multi-step onboarding application submitted by a pharmacy
  // before being approved and given a Pharmacy record.
  // ─────────────────────────────────────────────────────────────
  return sequelize.define("PharmacyRegistration", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Business Info ───────────────────────────────────────
    pharmacy_name_legal: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    trading_name: {
      type: DataTypes.STRING(255),
    },
    business_reg_no: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    kra_pin: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    ppb_license_no: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    license_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    // ─── Location ────────────────────────────────────────────
    county: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sub_county: {
      type: DataTypes.STRING(100),
    },
    physical_address: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    gps_lat: {
      type: DataTypes.DECIMAL(9, 6),
    },
    gps_lng: {
      type: DataTypes.DECIMAL(9, 6),
    },

    // ─── Contact ─────────────────────────────────────────────
    business_phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    business_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true },
    },
    phone_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // ─── Lead Pharmacist ─────────────────────────────────────
    pharmacist_name: {
      type: DataTypes.STRING(255),
    },
    id_or_passport_no: {
      type: DataTypes.STRING(50),
    },
    pharmacist_reg_no: {
      type: DataTypes.STRING(100),
    },
    practicing_license: {
      type: DataTypes.STRING(100),
    },
    practicing_expiry: {
      type: DataTypes.DATEONLY,
    },
    pharmacist_phone: {
      type: DataTypes.STRING(20),
    },
    pharmacist_email: {
      type: DataTypes.STRING(255),
      validate: { isEmail: true },
    },

    // ─── Documents (file paths) ──────────────────────────────
    id_document: {
      type: DataTypes.STRING(500),
    },
    practicing_license_doc: {
      type: DataTypes.STRING(500),
    },
    operating_license_doc: {
      type: DataTypes.STRING(500),
    },
    business_reg_cert: {
      type: DataTypes.STRING(500),
    },
    kra_pin_cert: {
      type: DataTypes.STRING(500),
    },
    proof_of_address_doc: {
      type: DataTypes.STRING(500),
    },

    // ─── Payment / Settlement ────────────────────────────────
    mpesa_method: {
      type: DataTypes.ENUM("PAYBILL", "TILL"),
    },
    short_code_name: {
      type: DataTypes.STRING(255),
    },
    short_code_number: {
      type: DataTypes.STRING(10),
    },
    settlement_bank: {
      type: DataTypes.STRING(100),
    },
    settlement_frequency: {
      type: DataTypes.ENUM("DAILY", "WEEKLY", "MONTHLY"),
      defaultValue: "DAILY",
    },

    // ─── Application Status ──────────────────────────────────
    status: {
      type: DataTypes.ENUM(
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected"
      ),
      defaultValue: "draft",
      allowNull: false,
    },
    current_step: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    submitted_at: {
      type: DataTypes.DATE,
    },
    reviewed_by: {
      type: DataTypes.UUID,             // FK → users.id (role = admin)
    },
    review_notes: {
      type: DataTypes.TEXT,
    },

  }, {
    tableName: "pharmacy_registrations",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["business_email"] },
      { fields: ["ppb_license_no"] },
    ],
  });
};