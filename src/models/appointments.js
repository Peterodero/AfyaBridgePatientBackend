const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // APPOINTMENT
  // ─────────────────────────────────────────────────────────────
  const Appointment = sequelize.define("Appointment", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },

    // ─── Scheduling ──────────────────────────────────────────
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING(10),       // e.g. "09:00 AM"
      allowNull: false,
    },
    duration: {
      type: DataTypes.INTEGER,          // in minutes
      defaultValue: 30,
    },

    // ─── Details ─────────────────────────────────────────────
    type: {
      type: DataTypes.ENUM("in_person", "video"),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
    },
    priority: {
      type: DataTypes.ENUM("urgent", "normal"),
      defaultValue: "normal",
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show"
      ),
      defaultValue: "pending",
      allowNull: false,
    },
    meeting_url: {
      type: DataTypes.STRING(500),
    },
    charges: {
      type: DataTypes.DECIMAL(10, 2),
    },

  }, {
    tableName: "appointments",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["doctor_id"] },
      { fields: ["patient_id"] },
      { fields: ["date"] },
      { fields: ["status"] },
      { fields: ["type"] },
    ],
  });


  // ─────────────────────────────────────────────────────────────
  // APPOINTMENT SLOT
  // Pre-generated available slots per doctor per day
  // ─────────────────────────────────────────────────────────────
  const AppointmentSlot = sequelize.define("AppointmentSlot", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING(10),       // e.g. "09:00 AM"
      allowNull: false,
    },
    slot_duration: {
      type: DataTypes.INTEGER,
      defaultValue: 30,                 // in minutes
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

  }, {
    tableName: "appointment_slots",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["doctor_id"] },
      { fields: ["date"] },
      { fields: ["is_available"] },
      { unique: true, fields: ["doctor_id", "date", "time"] },
    ],
  });


  return { Appointment, AppointmentSlot };
};