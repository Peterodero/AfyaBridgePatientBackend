const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // BROADCAST ANNOUNCEMENT
  // Created by an admin to send a message to a group of users.
  // After creation, the backend fans out individual Notification
  // rows for each targeted user (see Notification.js).
  // ─────────────────────────────────────────────────────────────
  return sequelize.define("BroadcastAnnouncement", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Author ──────────────────────────────────────────────
    admin_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = admin)
    },

    // ─── Content ─────────────────────────────────────────────
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // ─── Targeting ───────────────────────────────────────────
    target_group: {
      type: DataTypes.ENUM(
        "patients",
        "doctors",
        "pharmacists",
        "pharmacy_managers",
        "riders",
        "all"
      ),
      defaultValue: "all",
      allowNull: false,
    },

    // ─── Scheduling ──────────────────────────────────────────
    expires_at: {
      type: DataTypes.DATE,
    },

    // ─── Delivery Tracking ───────────────────────────────────
    total_recipients: {
      type: DataTypes.INTEGER,
      defaultValue: 0,                  // populated after fan-out
    },

  }, {
    tableName: "broadcast_announcements",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["admin_id"] },
      { fields: ["target_group"] },
      { fields: ["expires_at"] },
    ],
  });
};