const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Message", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ─────────────────────────────────────────
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id
    },
    receiver_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id
    },
    consultation_id: {
      type: DataTypes.UUID,             // FK → consultations.id (nullable — general chat)
    },

    // ─── Content ───────────────────────────────────────────────
    content: {
      type: DataTypes.TEXT,
    },
    type: {
      type: DataTypes.ENUM("text", "image", "audio", "video", "file"),
      defaultValue: "text",
      allowNull: false,
    },
    file_url: {
      type: DataTypes.STRING(500),      // path to uploaded media
    },

    // ─── Status ────────────────────────────────────────────────
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    read_at: {
      type: DataTypes.DATE,
    },

  }, {
    tableName: "messages",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["sender_id"] },
      { fields: ["receiver_id"] },
      { fields: ["consultation_id"] },
      { fields: ["is_read"] },
      { fields: ["sender_id", "receiver_id"] },
    ],
  });
};