const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // DRUG
  // A medication stocked by a pharmacy.
  // ─────────────────────────────────────────────────────────────
  const Drug = sequelize.define("Drug", {

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

    // ─── Identity ────────────────────────────────────────────
    drug_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    generic_name: {
      type: DataTypes.STRING(255),
    },
    category: {
      type: DataTypes.ENUM(
        "antibiotic",
        "analgesic",
        "chronic",
        "vitamin",
        "antifungal",
        "other"
      ),
      allowNull: false,
    },
    unit: {
      type: DataTypes.ENUM(
        "tablet", "capsule", "bottle",
        "vial", "sachet", "tube"
      ),
      defaultValue: "tablet",
    },

    // ─── Pricing ─────────────────────────────────────────────
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    // ─── Stock Levels ────────────────────────────────────────
    quantity_in_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    reorder_level: {
      type: DataTypes.INTEGER,
      defaultValue: 20,                 // trigger low stock alert
    },
    critical_level: {
      type: DataTypes.INTEGER,
      defaultValue: 5,                  // trigger critical stock alert
    },

    // ─── Flags ───────────────────────────────────────────────
    requires_rx: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // requires prescription
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

  }, {
    tableName: "drugs",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["pharmacy_id"] },
      { fields: ["category"] },
      { fields: ["drug_name"] },
      { fields: ["is_active"] },
      { fields: ["quantity_in_stock"] },
    ],
  });


  // ─────────────────────────────────────────────────────────────
  // STOCK BATCH
  // A received batch of a specific drug with expiry tracking.
  // ─────────────────────────────────────────────────────────────
  const StockBatch = sequelize.define("StockBatch", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    drug_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → drugs.id
    },
    supplier_id: {
      type: DataTypes.UUID,             // FK → suppliers.id
    },
    bulk_order_id: {
      type: DataTypes.UUID,             // FK → bulk_orders.id
    },
    received_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist)
    },

    // ─── Batch Info ──────────────────────────────────────────
    batch_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    quantity_received: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity_remaining: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    manufacture_date: {
      type: DataTypes.DATEONLY,
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

  }, {
    tableName: "stock_batches",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["drug_id"] },
      { fields: ["expiry_date"] },
      { fields: ["supplier_id"] },
      { fields: ["bulk_order_id"] },
    ],
  });


  return { Drug, StockBatch };
};