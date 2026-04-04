const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Vital", {

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
    consultation_id: {
      type: DataTypes.UUID,             // FK → consultations.id (nullable — can be recorded standalone)
    },
    recorded_by: {
      type: DataTypes.UUID,             // FK → users.id (role = doctor) — nullable if self-recorded
    },

    // ─── Measurements ──────────────────────────────────────────
    heart_rate: {
      type: DataTypes.INTEGER,          // bpm
    },
    blood_pressure_systolic: {
      type: DataTypes.INTEGER,          // mmHg
    },
    blood_pressure_diastolic: {
      type: DataTypes.INTEGER,          // mmHg
    },
    blood_glucose: {
      type: DataTypes.DECIMAL(5, 2),    // mmol/L
    },
    temperature: {
      type: DataTypes.DECIMAL(4, 1),    // °C
    },
    oxygen_saturation: {
      type: DataTypes.DECIMAL(4, 1),    // SpO2 %
    },
    weight: {
      type: DataTypes.DECIMAL(5, 1),    // kg
    },
    height: {
      type: DataTypes.DECIMAL(5, 1),    // cm
    },

    // ─── Timestamp ─────────────────────────────────────────────
    recorded_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },

  }, {
    tableName: "vitals",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["patient_id"] },
      { fields: ["consultation_id"] },
      { fields: ["recorded_at"] },
    ],
  });
};