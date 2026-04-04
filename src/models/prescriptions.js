const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Prescription", {

    // ─── Identity ──────────────────────────────────────────────
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    prescription_number: {
      type: DataTypes.STRING(100),
      unique: true,                     // human-readable ref e.g. RX-0001
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
    pharmacy_id: {
      type: DataTypes.UUID,             // FK → pharmacies.id — set when pharmacy receives it
    },
    dispensed_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist) — set on dispense
    },

    // ─── Snapshot Fields (denormalized for record integrity) ───
    patient_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    patient_phone: {
      type: DataTypes.STRING(20),
    },
    patient_address: {
      type: DataTypes.STRING(255),
    },
    doctor_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    // ─── Prescription Details ──────────────────────────────────
    diagnosis: {
      type: DataTypes.TEXT,
    },
    notes: {
      type: DataTypes.TEXT,
    },
    issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
    },

    // ─── Items (individual drugs as JSON) ─────────────────────
    // Each item: { drug_id, drug_name, dosage, frequency, duration,
    //              route, warnings, instructions, quantity,
    //              substitution_ok, duration_days }
    items: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },

    // ─── Lifecycle Status ──────────────────────────────────────
    status: {
      type: DataTypes.ENUM(
        "draft",          // doctor started but not submitted
        "pending",        // submitted by doctor, awaiting pharmacy
        "validated",      // pharmacy confirmed it is legitimate
        "rejected",       // pharmacy rejected (invalid/expired/etc)
        "dispensed",      // pharmacy has dispensed the medication
        "delivered"       // delivered to patient
      ),
      defaultValue: "draft",
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("normal", "urgent"),
      defaultValue: "normal",
    },
    rejection_reason: {
      type: DataTypes.TEXT,             // nullable — set only on rejection
    },

    // ─── Dispensing Info ───────────────────────────────────────
    dispensed_at: {
      type: DataTypes.DATE,             // nullable — set when dispensed
    },
    make_order: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,              
    }

  }, {
    tableName: "prescriptions",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["patient_id"] },
      { fields: ["doctor_id"] },
      { fields: ["pharmacy_id"] },
      { fields: ["status"] },
      { unique: true, fields: ["prescription_number"] },
    ],
  });
};