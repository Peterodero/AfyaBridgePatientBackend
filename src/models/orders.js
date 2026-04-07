const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Order", {

    // ─── Identity ──────────────────────────────────────────────
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    order_number: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },

    // ─── Relationships ─────────────────────────────────────────
    prescription_id: {
      type: DataTypes.UUID,             // FK → prescriptions.id (nullable — walk-in orders)
    },
    pharmacy_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → pharmacies.id
    },
    prepared_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist)
    },

    // ─── Patient Snapshot ──────────────────────────────────────
    patient_id: {
      type: DataTypes.UUID,             // FK → users.id (role = patient)
    },
    patient_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    patient_phone: {
      type: DataTypes.STRING(20),
    },
    patient_address: {
      type: DataTypes.TEXT,
    },
    patient_lat: {
      type: DataTypes.DOUBLE,
    },
    patient_lng: {
      type: DataTypes.DOUBLE,
    },

    // ─── Order Details ─────────────────────────────────────────
    delivery_type: {
      type: DataTypes.ENUM("pickup", "home_delivery"),
      defaultValue: "pickup",
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("urgent", "normal"),
      defaultValue: "normal",
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "processing",
        "ready",
        "dispatched",
        "delivered",
        "cancelled"
      ),
      defaultValue: "pending",
      allowNull: false,
    },

    // ─── Payment ───────────────────────────────────────────────
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    payment_status: {
      type: DataTypes.ENUM("unpaid", "paid", "refunded"),
      defaultValue: "unpaid",
    },
    payment_method: {
      type: DataTypes.ENUM("mpesa", "cash", "insurance", "nhif"),
    },
    mpesa_ref: {
      type: DataTypes.STRING(50),
    },

  }, {
    tableName: "orders",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["order_number"] },
      { fields: ["prescription_id"] },
      { fields: ["pharmacy_id"] },
      { fields: ["patient_id"] },
      { fields: ["status"] },
      { fields: ["payment_status"] },
    ],
  });
};