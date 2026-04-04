const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // ISSUE
  // Support issues raised by any user against any reference
  // (order, delivery, appointment, etc.)
  // ─────────────────────────────────────────────────────────────
  return sequelize.define("Issue", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Raised By ───────────────────────────────────────────
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id
    },

    // ─── Reference (what the issue is about) ─────────────────
    reference_id: {
      type: DataTypes.UUID,             // e.g. order_id, delivery_id, appointment_id
    },
    reference_type: {
      type: DataTypes.STRING(50),       // e.g. "order", "delivery", "appointment"
    },

    // ─── Content ─────────────────────────────────────────────
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // ─── Status ──────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM("open", "in_review", "resolved", "closed"),
      defaultValue: "open",
      allowNull: false,
    },

    // ─── Resolution ──────────────────────────────────────────
    resolved_by: {
      type: DataTypes.UUID,             // FK → users.id (role = admin)
    },
    resolution_notes: {
      type: DataTypes.TEXT,
    },
    resolved_at: {
      type: DataTypes.DATE,
    },

  }, {
    tableName: "issues",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["status"] },
      { fields: ["reference_id", "reference_type"] },
    ],
  });
};