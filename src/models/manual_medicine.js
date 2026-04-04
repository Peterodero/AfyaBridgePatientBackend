const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  // ───────────────────────────────────────────────────────────
  // MANUAL MEDICINE
  // Medications manually logged by a patient (not from a
  // formal prescription). Used for order/refill requests.
  // ───────────────────────────────────────────────────────────
  return sequelize.define("ManualMedicine", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    dosage: {
      type: DataTypes.STRING(100),
    },
    quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    selected: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: "manual_medicines",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
    ],
  });
};