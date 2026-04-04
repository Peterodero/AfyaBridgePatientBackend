const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // CONSULTATION
  // Active telemedicine/in-person session linked to an appointment
  // ─────────────────────────────────────────────────────────────
  const Consultation = sequelize.define("Consultation", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    appointment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,                     // FK → appointments.id
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },

    // ─── Session ─────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM("active", "completed", "abandoned"),
      defaultValue: "active",
      allowNull: false,
    },
    meeting_url: {
      type: DataTypes.STRING(500),      // video call link
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end_time: {
      type: DataTypes.DATE,
    },
    symptoms: {
      type: DataTypes.TEXT,
    },
    controls: {
      type: DataTypes.JSON,             // e.g. { mic: true, camera: false }
    },

  }, {
    tableName: "consultations",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["appointment_id"] },
      { fields: ["doctor_id"] },
      { fields: ["patient_id"] },
      { fields: ["status"] },
    ],
  });


  // ─────────────────────────────────────────────────────────────
  // CLINICAL NOTE
  // SOAP note written by doctor during/after consultation
  // ─────────────────────────────────────────────────────────────
  const ClinicalNote = sequelize.define("ClinicalNote", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    consultation_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → consultations.id
    },

    // ─── SOAP Format ─────────────────────────────────────────
    subjective: {
      type: DataTypes.TEXT,             // patient reported symptoms
    },
    objective: {
      type: DataTypes.TEXT,             // doctor observations / vitals
    },
    assessment: {
      type: DataTypes.TEXT,             // diagnosis
    },
    plan: {
      type: DataTypes.TEXT,             // treatment plan
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

  }, {
    tableName: "clinical_notes",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["consultation_id"] },
    ],
  });


  return { Consultation, ClinicalNote };
};