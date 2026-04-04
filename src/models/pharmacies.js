const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // PHARMACY
  // A registered pharmacy on the platform.
  // ─────────────────────────────────────────────────────────────
  const Pharmacy = sequelize.define("Pharmacy", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Identity ────────────────────────────────────────────
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true },
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    logo: {
      type: DataTypes.STRING(500),
    },

    // ─── Location ────────────────────────────────────────────
    address_line1: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    address_line2: {
      type: DataTypes.STRING(255),
    },
    county: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sub_county: {
      type: DataTypes.STRING(100),
    },
    gps_lat: {
      type: DataTypes.DECIMAL(9, 6),
    },
    gps_lng: {
      type: DataTypes.DECIMAL(9, 6),
    },

    // ─── Licensing ───────────────────────────────────────────
    license_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    license_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    // ─── Operations ──────────────────────────────────────────
    delivery_zones: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    is_24hr: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

  }, {
    tableName: "pharmacies",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["county"] },
      { fields: ["is_active"] },
      { fields: ["license_number"] },
    ],
  });


  // ─────────────────────────────────────────────────────────────
  // PHARMACY HOURS
  // Operating hours per day for a pharmacy.
  // ─────────────────────────────────────────────────────────────
  const PharmacyHours = sequelize.define("PharmacyHours", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationship ────────────────────────────────────────
    pharmacy_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → pharmacies.id
    },

    // ─── Schedule ────────────────────────────────────────────
    day_of_week: {
      type: DataTypes.ENUM("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"),
      allowNull: false,
    },
    open_time: {
      type: DataTypes.TIME,
    },
    close_time: {
      type: DataTypes.TIME,
    },
    is_closed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

  }, {
    tableName: "pharmacy_hours",
    timestamps: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ["pharmacy_id", "day_of_week"] },
    ],
  });


  return { Pharmacy, PharmacyHours };
};