const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // BULK ORDER
  // A pharmacy's purchase order sent to a supplier.
  // ─────────────────────────────────────────────────────────────
  const BulkOrder = sequelize.define("BulkOrder", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    pharmacy_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → pharmacies.id
    },
    supplier_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → suppliers.id
    },
    created_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist / pharmacy_manager)
    },

    // ─── Status ──────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM(
        "draft",
        "submitted",
        "acknowledged",
        "partially_received",
        "received",
        "cancelled"
      ),
      defaultValue: "draft",
      allowNull: false,
    },

    // ─── Financials ──────────────────────────────────────────
    total_cost: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },

    // ─── Dates ───────────────────────────────────────────────
    expected_date: {
      type: DataTypes.DATEONLY,
    },
    received_date: {
      type: DataTypes.DATEONLY,
    },

    // ─── Notes ───────────────────────────────────────────────
    notes: {
      type: DataTypes.TEXT,
    },

  }, {
    tableName: "bulk_orders",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["pharmacy_id"] },
      { fields: ["supplier_id"] },
      { fields: ["status"] },
    ],
  });


  // ─────────────────────────────────────────────────────────────
  // BULK ORDER ITEM
  // Individual line items within a bulk order.
  // ─────────────────────────────────────────────────────────────
  const BulkOrderItem = sequelize.define("BulkOrderItem", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    bulk_order_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → bulk_orders.id
    },
    drug_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → drugs.id
    },

    // ─── Quantities ──────────────────────────────────────────
    quantity_ordered: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity_received: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // ─── Pricing ─────────────────────────────────────────────
    unit_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    // ─── Batch Info ──────────────────────────────────────────
    batch_number: {
      type: DataTypes.STRING(100),
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
    },

  }, {
    tableName: "bulk_order_items",
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ["bulk_order_id"] },
      { fields: ["drug_id"] },
    ],
  });


  return { BulkOrder, BulkOrderItem };
};