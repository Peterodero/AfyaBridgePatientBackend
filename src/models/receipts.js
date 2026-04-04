const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // RECEIPT
  // Generated after an order is paid. One receipt per order.
  // ─────────────────────────────────────────────────────────────
  return sequelize.define("Receipt", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,                     // FK → orders.id (one receipt per order)
    },
    dispensed_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist)
    },

    // ─── Amounts ─────────────────────────────────────────────
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    // ─── Payment ─────────────────────────────────────────────
    payment_method: {
      type: DataTypes.ENUM("mpesa", "cash", "insurance", "nhif"),
      allowNull: false,
    },
    mpesa_ref: {
      type: DataTypes.STRING(50),
    },

    // ─── Delivery ────────────────────────────────────────────
    pdf_path: {
      type: DataTypes.STRING(500),      // path to generated PDF receipt
    },
    emailed_at: {
      type: DataTypes.DATE,
    },
    sms_sent_at: {
      type: DataTypes.DATE,
    },

  }, {
    tableName: "receipts",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["order_id"] },
      { fields: ["dispensed_by"] },
      { fields: ["payment_method"] },
    ],
  });
};