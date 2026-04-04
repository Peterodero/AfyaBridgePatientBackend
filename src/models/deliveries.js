const { DataTypes, UUIDV4 } = require("sequelize");

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

module.exports = (sequelize) => {
  return sequelize.define("Delivery", {

    // ─── Identity ──────────────────────────────────────────────
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    package_number: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },

    // ─── Relationships ─────────────────────────────────────────
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → orders.id
      unique: true,                     // one delivery per order
    },
    rider_id: {
      type: DataTypes.UUID,             // FK → users.id (role = rider)
    },

    // ─── Status ────────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM(
        "pending",
        "assigned",
        "accepted",
        "picked_up",
        "out_for_delivery",
        "delivered",
        "failed",
        "cancelled"
      ),
      defaultValue: "pending",
      allowNull: false,
    },
    accept_status: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // ─── Pickup Info ───────────────────────────────────────────
    pickup_location: {
      type: DataTypes.STRING(255),
    },
    pickup_lat: {
      type: DataTypes.DECIMAL(9, 6),
    },
    pickup_lng: {
      type: DataTypes.DECIMAL(9, 6),
    },
    pickup_contact: {
      type: DataTypes.STRING(20),       // pharmacy contact
    },
    pickup_time: {
      type: DataTypes.DATE,
    },

    // ─── Dropoff Info ──────────────────────────────────────────
    dropoff_location: {
      type: DataTypes.STRING(255),
    },
    dropoff_lat: {
      type: DataTypes.DECIMAL(9, 6),
    },
    dropoff_lng: {
      type: DataTypes.DECIMAL(9, 6),
    },
    receiver_contact: {
      type: DataTypes.STRING(20),       // patient contact
    },
    // ─── Delivery Details ──────────────────────────────────────
    requirement: {
      type: DataTypes.STRING(255),      // transport condition e.g. "keep refrigerated"
    },
    estimated_delivery_time: {
      type: DataTypes.STRING(100),
    },
    distance: {
      type: DataTypes.FLOAT,
    },
    charges: {
      type: DataTypes.DECIMAL(10, 2),
    },
    delivery_zone: {
      type: DataTypes.STRING(100),
    },
    delivery_notes: {
      type: DataTypes.TEXT,
    },

    // ─── OTP Confirmation ──────────────────────────────────────
    otp_code: {
      type: DataTypes.STRING(6),
      defaultValue: generateOTP,
    },

    // ─── Timestamps ────────────────────────────────────────────
    delivered_at: {
      type: DataTypes.DATE,
    },
    date_approved: {
      type: DataTypes.DATE,
    },

  }, {
    tableName: "deliveries",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["order_id"] },
      { unique: true, fields: ["package_number"] },
      { fields: ["rider_id"] },
      { fields: ["status"] },
    ],
  });
};