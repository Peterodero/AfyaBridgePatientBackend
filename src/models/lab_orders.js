const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("LabOrder", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ─────────────────────────────────────────
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    consultation_id: {
      type: DataTypes.UUID,             // FK → consultations.id (nullable — can be standalone)
    },

    // ─── Order Details ─────────────────────────────────────────
    test_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    tests: {
      type: DataTypes.JSON,             // array of individual tests ordered
      defaultValue: [],
    },
    lab_id: {
      type: DataTypes.STRING(100),      // external lab reference
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "sent_to_lab",
        "in_progress",
        "results_ready",
        "cancelled"
      ),
      defaultValue: "pending",
      allowNull: false,
    },

    // ─── Results ───────────────────────────────────────────────
    results: {
      type: DataTypes.JSON,             // lab results when returned
    },
    results_at: {
      type: DataTypes.DATE,
    },

  }, {
    tableName: "lab_orders",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["patient_id"] },
      { fields: ["doctor_id"] },
      { fields: ["consultation_id"] },
      { fields: ["status"] },
    ],
  });
};