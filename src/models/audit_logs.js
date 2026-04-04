const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("AuditLog", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Who did it ───────────────────────────────────────────
    admin_id: {
      type: DataTypes.UUID,
      allowNull: false,               // FK → users.id (role = admin)
    },
    admin_name: {
      type: DataTypes.STRING(255),
      allowNull: false,               // Snapshot — preserved even if admin is deleted
    },

    // ─── What they did ────────────────────────────────────────
    action: {
      type: DataTypes.ENUM(
        // Auth
        "admin_login",
        "admin_logout",
        // Users
        "user_created",
        "user_status_updated",
        "user_deleted",
        "user_password_reset",
        // Providers
        "provider_approved",
        "provider_rejected",
        // Riders
        "rider_approved",
        "rider_rejected",
        // Pharmacies
        "pharmacy_created",
        "pharmacy_approved",
        "pharmacy_rejected",
        // Consultations & Prescriptions
        "consultation_flagged",
        "prescription_flagged",
        // Orders
        "delivery_reassigned",
        // Payments
        "refund_initiated",
        // Emergencies
        "emergency_escalated",
        // Notifications
        "broadcast_sent",
        "broadcast_deleted",
        // Settings
        "settings_updated",
        "maintenance_toggled"
      ),
      allowNull: false,
    },

    // ─── What it affected ─────────────────────────────────────
    target_type: {
      type: DataTypes.STRING(50),     // e.g. "user", "pharmacy", "consultation"
    },
    target_id: {
      type: DataTypes.UUID,           // ID of the record that was affected
    },

    // ─── Extra context ────────────────────────────────────────
    description: {
      type: DataTypes.TEXT,           // Human-readable summary of the action
    },
    metadata: {
      type: DataTypes.JSON,           // Any extra data — old values, new values, reason etc.
    },

    // ─── Request info ─────────────────────────────────────────
    ip_address: {
      type: DataTypes.STRING(45),     // Supports IPv6
    },
    user_agent: {
      type: DataTypes.STRING(500),
    },

  }, {
    tableName: "audit_logs",
    timestamps: true,
    underscored: true,
    updatedAt: false,                 // Audit logs are write-once, never updated
    indexes: [
      { fields: ["admin_id"] },
      { fields: ["action"] },
      { fields: ["target_type", "target_id"] },
      { fields: ["created_at"] },
    ],
  });
};