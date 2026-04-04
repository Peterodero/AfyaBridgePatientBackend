const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // NOTIFICATION LOG
  // Records every notification sent to any user across all systems.
  //
  // Admin broadcast flow:
  //   1. Admin creates a BroadcastAnnouncement (target_group = "all" | "patients" | etc.)
  //   2. Your backend queries users WHERE role IN (target_group)
  //   3. For each user, check their NotificationPreference channels
  //   4. Insert one Notification row per user per channel they have enabled
  //   5. broadcast_id links back to the BroadcastAnnouncement that triggered it
  // ─────────────────────────────────────────────────────────────
  const Notification = sequelize.define("Notification", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Recipient ───────────────────────────────────────────
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id
    },

    // ─── Content ─────────────────────────────────────────────
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // ─── Classification ──────────────────────────────────────
    notification_type: {
      type: DataTypes.ENUM(
        "appointment",                  // doctor / patient
        "prescription",                 // doctor / patient / pharmacist
        "order",                        // pharmacist / patient
        "delivery",                     // rider / patient
        "payment",                      // all
        "low_stock",                    // pharmacist
        "expiry_alert",                 // pharmacist
        "broadcast",                    // all — triggered by admin
        "system",                       // all
        "chat"                          // doctor / patient
      ),
      allowNull: false,
    },

    // ─── Delivery Channel ────────────────────────────────────
    channel: {
      type: DataTypes.ENUM("sms", "email", "push", "in_app"),
      defaultValue: "in_app",
      allowNull: false,
    },

    // ─── Reference (optional link to triggering record) ──────
    reference_id: {
      type: DataTypes.UUID,             // e.g. order_id, appointment_id, delivery_id
    },
    reference_type: {
      type: DataTypes.STRING(50),       // e.g. "order", "appointment", "delivery"
    },

    // ─── Broadcast Link ──────────────────────────────────────
    // Populated only when notification_type = "broadcast"
    // Links back to the BroadcastAnnouncement that triggered this row
    broadcast_id: {
      type: DataTypes.UUID,             // FK → broadcast_announcements.id
    },

    // ─── Read Status ─────────────────────────────────────────
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    read_at: {
      type: DataTypes.DATE,
    },
    sent_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

  }, {
    tableName: "notifications",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["notification_type"] },
      { fields: ["channel"] },
      { fields: ["is_read"] },
      { fields: ["broadcast_id"] },
      { fields: ["reference_id", "reference_type"] },
      { fields: ["sent_at"] },
    ],
  });


  // ─────────────────────────────────────────────────────────────
  // NOTIFICATION PREFERENCES
  // One row per user created at registration.
  // Before sending any notification, check this table to know
  // which channels the user has enabled for that notification type.
  // ─────────────────────────────────────────────────────────────
  const NotificationPreference = sequelize.define("NotificationPreference", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationship ────────────────────────────────────────
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,                     // FK → users.id (one row per user)
    },

    // ─── Channel Preferences ─────────────────────────────────
    sms_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    email_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    push_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    in_app_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // ─── Type Preferences (all roles) ────────────────────────
    appointment_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // doctor / patient
    },
    prescription_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // doctor / patient / pharmacist
    },
    payment_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // all
    },
    delivery_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // rider / patient
    },
    chat_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // doctor / patient
    },
    broadcast_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,               // all — user can opt out of admin broadcasts
    },

    // ─── Type Preferences (pharmacist only) ──────────────────
    low_stock_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    expiry_alerts: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    expiry_alert_days: {
      type: DataTypes.INTEGER,
      defaultValue: 14,                 // days before expiry to trigger alert
    },

  }, {
    tableName: "notification_preferences",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["user_id"] },
    ],
  });


  return { Notification, NotificationPreference };
};