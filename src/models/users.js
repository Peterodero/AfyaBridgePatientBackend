const { DataTypes, UUIDV4 } = require("sequelize");
const bycrypt = require("bcryptjs");
const { calculateAge } = require("../utils/ageCalculator");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      // ─── Identity ─────────────────────────────────────────────
      id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        primaryKey: true,
      },
      role: {
        type: DataTypes.ENUM(
          "patient",
          "doctor",
          "pharmacist",
          "rider",
          "admin",
        ),
        allowNull: false,
      },
      full_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        unique: true,
        allowNull: false,
        validate: { isEmail: true },
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      phone_number: {
        type: DataTypes.STRING(20),
        unique: true,
      },
      profile_image: {
        type: DataTypes.STRING(500),
      },
      initials: {
        type: DataTypes.STRING(10),
      },

      // ─── Status & Auth ─────────────────────────────────────────
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      two_factor_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      two_factor_method: {
        type: DataTypes.ENUM("sms", "email", "app"),
        defaultValue: "sms",
      },
      two_factor_phone: {
        type: DataTypes.STRING(20),
      },
      last_password_change: {
        type: DataTypes.DATE,
      },
      last_login: {
        type: DataTypes.DATE,
      },
      account_status: {
        type: DataTypes.ENUM("active", "suspended", "locked", "disabled"),
        defaultValue: "active",
      },
      status_reason: {
        type: DataTypes.STRING(255),
      },

      // ─── Profile & Metadata ────────────────────────────────────
      bio: {
        type: DataTypes.TEXT,
      },
      gender: {
        type: DataTypes.STRING(20),
      },
      date_of_birth: {
        type: DataTypes.STRING(50), // nullable — patient only
      },
      age: {
        type: DataTypes.INTEGER, // nullable — patient only
      },
      blood_type: {
        type: DataTypes.STRING(10), // nullable — patient only
      },
      address: {
        type: DataTypes.STRING(255),
      },

      // ─── Security / Privacy ────────────────────────────────────
      provider_sharing: {
        type: DataTypes.BOOLEAN,
        defaultValue: true, // nullable — patient only
      },
      research_opt_in: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // nullable — patient only
      },

      // ─── Patient Medical JSON Columns ──────────────────────────
      emergency_contacts: {
        type: DataTypes.JSON, // nullable — patient only
      },
      allergies: {
        type: DataTypes.JSON, // nullable — patient only
      },
      surgeries: {
        type: DataTypes.JSON, // nullable — patient only
      },
      visits: {
        type: DataTypes.JSON, // nullable — patient only
      },
      conditions: {
        type: DataTypes.JSON, // nullable — patient only
      },
      documents: {
        type: DataTypes.JSON, // nullable — patient only
      },

      // ─── Doctor-specific ───────────────────────────────────────
      specialty: {
        type: DataTypes.STRING(255), // nullable — doctor only
      },
      kmpdc_license: {
        type: DataTypes.STRING(100), // nullable — doctor only
      },
      hospital: {
        type: DataTypes.STRING(255), // nullable — doctor only
      },
      consultation_fee: {
        type: DataTypes.FLOAT, // nullable — doctor only
      },
      allow_video_consultations: {
        type: DataTypes.BOOLEAN, // nullable — doctor only
      },
      allow_in_person_consultations: {
        type: DataTypes.BOOLEAN, // nullable — doctor only
      },
      working_hours: {
        type: DataTypes.JSON, // nullable — doctor only
      },
      slot_duration: {
        type: DataTypes.INTEGER, // nullable — doctor only
      },
      auto_confirm_appointments: {
        type: DataTypes.BOOLEAN, // nullable — doctor only
      },
      rating: {
        type: DataTypes.FLOAT,
        defaultValue: 0, // nullable — doctor only
      },
      total_reviews: {
        type: DataTypes.INTEGER,
        defaultValue: 0, // nullable — doctor only
      },
      verification_status: {
        type: DataTypes.ENUM("pending_verification", "verified", "rejected"), // nullable — doctor only
        defaultValue: "pending_verification",
      },
      verified_at: {
        type: DataTypes.DATE, // nullable — doctor only
      },
      verified_by: {
        type: DataTypes.STRING(100), // nullable — doctor only
      },

      // ─── Rider-specific ────────────────────────────────────────
      national_id: {
        type: DataTypes.STRING(50), // nullable — rider only
      },
      vehicle_type: {
        type: DataTypes.STRING(100), // nullable — rider only
      },
      plate_number: {
        type: DataTypes.STRING(50), // nullable — rider only
      },
      driving_license_no: {
        type: DataTypes.STRING(100), // nullable — rider only
      },
      license_expiry: {
        type: DataTypes.DATE, // nullable — rider only
      },
      id_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // nullable — rider only
      },
      license_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // nullable — rider only
      },
      approved_status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"), // nullable — rider only
        // nullable — rider only
      },
      date_approved: {
        type: DataTypes.DATE, // nullable — rider only
      },
      on_duty: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // nullable — rider only
      },
      emergency_contact: {
        type: DataTypes.STRING(100), // nullable — rider only
      },
      orders_made: {
        type: DataTypes.INTEGER,
        defaultValue: 0, // nullable — rider only
      },
      verified_by_admin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // nullable — rider only
      },

      // ─── PharmacyUser-specific ─────────────────────────────────
      pharmacy_id: {
        type: DataTypes.UUID, // nullable — pharmacist / pharmacy_manager / delivery_partner only
      },
      gps_lat: {
        type: DataTypes.STRING(255), // nullable
      },
      gps_lng: {
        type: DataTypes.STRING(255), // nullable
      },

      // NOTE: Notification preferences are stored in the
      // notification_preferences table, not here.
    },
    {
      tableName: "users",
      timestamps: true,
      underscored: true,
      hooks: {
        beforeCreate: async (user) => {
          if (user.password_hash) {
            const bcrypt = require("bcryptjs");
            const alreadyHashed =
              user.password_hash.startsWith("$2a$") ||
              user.password_hash.startsWith("$2b$");
            if (!alreadyHashed) {
              user.password_hash = await bcrypt.hash(user.password_hash, 10);
            }
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("password_hash")) {
            const value = user.password_hash;
            const alreadyHashed =
              value.startsWith("$2a$") || value.startsWith("$2b$");
            if (!alreadyHashed) {
              const bcrypt = require("bcryptjs");
              user.password_hash = await bcrypt.hash(value, 10);
            }
          }
        },
      },
      indexes: [
        { unique: true, fields: ["email"] },
        { unique: true, fields: ["phone_number"] },
        { fields: ["role"] },
        { fields: ["account_status"] },
        { fields: ["pharmacy_id"] },
      ],
    },
  );

  User.prototype.comparePassword = async function (password) {
    return bycrypt.compare(password, this.password_hash);
  };

  // Add this inside your User model definition
  User.prototype.getAge = function () {
    return calculateAge(this.date_of_birth);
  };

  return User;
};
