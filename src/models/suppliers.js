const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // SUPPLIER
  // A drug/medical supply vendor used by pharmacies.
  // ─────────────────────────────────────────────────────────────
  return sequelize.define("Supplier", {

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
    contact_name: {
      type: DataTypes.STRING(255),
    },
    email: {
      type: DataTypes.STRING(255),
      validate: { isEmail: true },
    },
    phone: {
      type: DataTypes.STRING(20),
    },
    address: {
      type: DataTypes.TEXT,
    },

    // ─── Status ──────────────────────────────────────────────
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

  }, {
    tableName: "suppliers",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["name"] },
      { fields: ["is_active"] },
    ],
  });
};