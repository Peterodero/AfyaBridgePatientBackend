const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ───────────────────────────────────────────────────────────
  // SYMPTOM SESSION
  // A single AI symptom checker conversation session.
  // Contains many SymptomMessages.
  // ───────────────────────────────────────────────────────────
  const SymptomSession = sequelize.define("SymptomSession", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    status: {
      type: DataTypes.ENUM("active", "ended"),
      defaultValue: "active",
    },
    disclaimer_accepted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    consent_to_ai_analysis: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: "symptom_sessions",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["status"] },
    ],
  });


  // ───────────────────────────────────────────────────────────
  // SYMPTOM MESSAGE
  // Individual messages within a symptom checker session.
  // ───────────────────────────────────────────────────────────
  const SymptomMessage = sequelize.define("SymptomMessage", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → symptom_sessions.id
    },
    sender: {
      type: DataTypes.ENUM("patient", "ai"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    suggested_actions: {
      type: DataTypes.JSON,             // e.g. [{label: "Book appointment", action: "book"}]
    },
  }, {
    tableName: "symptom_messages",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["session_id"] },
      { fields: ["sender"] },
    ],
  });

  // SymptomSession has many SymptomMessages
  SymptomSession.hasMany(SymptomMessage, { foreignKey: "session_id" });
  SymptomMessage.belongsTo(SymptomSession, { foreignKey: "session_id" });

  return { SymptomSession, SymptomMessage };
};