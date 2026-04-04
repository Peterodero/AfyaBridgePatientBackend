const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  return sequelize.define("PatientMedication", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Core relationships ───────────────────────────────────
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    prescription_id: {
      type: DataTypes.UUID,             // FK → prescriptions.id
      allowNull: true,                  // null when added manually by patient or doctor
    },
    pharmacy_id: {
      type: DataTypes.UUID,             // FK → pharmacies.id
      allowNull: true,                  // null for manually added meds
    },
    prescribed_by: {
      type: DataTypes.UUID,             // FK → users.id (role = doctor)
      allowNull: true,                  // null for OTC / manually added meds
    },
    dispensed_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist)
      allowNull: true,
    },
    drug_id: {
      type: DataTypes.UUID,             // FK → drugs.id — populated when drug exists in catalogue
      allowNull: true,                  // null for free-text meds not in the pharmacy catalogue
    },

    // ─── Drug identity (denormalized for record integrity) ────
    drug_name: {
      type: DataTypes.STRING(255),
      allowNull: false,                 // always required — snapshot of the drug name
    },
    dosage: {
      type: DataTypes.STRING(100),      // e.g. "500mg", "10ml"
    },
    dosage_form: {
      type: DataTypes.ENUM("tablet", "capsule", "syrup", "injection", "cream", "drops", "inhaler", "patch", "other"),
    },

    // ─── Dosing schedule ─────────────────────────────────────
    frequency: {
      type: DataTypes.STRING(100),      // e.g. "Twice daily", "Every 8 hours"
    },
    times_per_day: {
      type: DataTypes.INTEGER,          // e.g. 2 for "twice daily" — used for refill calculations
    },
    dosage_timing: {
      type: DataTypes.JSON,             // e.g. ["08:00", "20:00"] — specific times to take
    },
    with_food: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    route: {
      type: DataTypes.STRING(50),       // e.g. "oral", "topical", "IV"
    },
    instructions: {
      type: DataTypes.TEXT,             // special instructions from doctor / pharmacist
    },

    // ─── Duration & quantity ──────────────────────────────────
    duration_days: {
      type: DataTypes.INTEGER,          // total prescribed duration in days
    },
    quantity_dispensed: {
      type: DataTypes.INTEGER,          // units given at dispensing
    },
    quantity_remaining: {
      type: DataTypes.INTEGER,          // decremented as patient logs doses
    },
    refills_allowed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    refills_used: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // ─── Lifecycle dates ──────────────────────────────────────
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,                 // when the patient should start taking the medication
    },
    end_date: {
      type: DataTypes.DATEONLY,         // calculated from start_date + duration_days
    },
    dispensed_at: {
      type: DataTypes.DATE,             // exact datetime the pharmacy dispensed it
    },
    last_taken_at: {
      type: DataTypes.DATE,             // last time the patient logged taking this medication
    },

    // ─── Refill reminder ─────────────────────────────────────
    next_refill_date: {
      type: DataTypes.DATEONLY,         // when the patient should reorder — drives notifications
    },
    refill_reminder_days: {
      type: DataTypes.INTEGER,
      defaultValue: 3,                  // days before next_refill_date to send the first reminder
    },
    last_reminder_sent_at: {
      type: DataTypes.DATE,             // prevents duplicate reminder notifications
    },

    // ─── Status & flags ───────────────────────────────────────
    status: {
      type: DataTypes.ENUM("active", "completed", "discontinued", "on_hold", "expired"),
      defaultValue: "active",
      allowNull: false,
    },
    is_chronic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,              // chronic meds get indefinite refill reminders
    },
    is_otc: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,              // over-the-counter (no prescription required)
    },
    discontinuation_reason: {
      type: DataTypes.TEXT,             // why the medication was stopped
    },
    notes: {
      type: DataTypes.TEXT,             // any additional notes from doctor, pharmacist, or patient
    },
    warnings: {
      type: DataTypes.TEXT,             // side effects / drug interaction warnings to display
    },
    daily_log: {
      type: DataTypes.JSON,
      defaultValue: {},
      // Structure: { "YYYY-MM-DD": { "Morning": "taken"|"skipped"|"pending", "Afternoon": ... } }
      // Written by PATCH /meds/schedule/slot-update
      // Read by GET /meds/dashboard to derive slot_status and adherence
    },
    adherence_percentage: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      // Recomputed and stored on every slot-update so the dashboard
      // can read it directly without re-scanning daily_log history
    },


  }, {
    tableName: "patient_medications",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["patient_id"] },
      { fields: ["prescription_id"] },
      { fields: ["pharmacy_id"] },
      { fields: ["drug_id"] },
      { fields: ["prescribed_by"] },
      { fields: ["status"] },
      { fields: ["next_refill_date"] },       // queried daily by the refill reminder job
      { fields: ["patient_id", "status"] },   // patient active medication list
    ],
  });
};