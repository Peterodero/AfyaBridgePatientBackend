const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("SavedLocation", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    label: {
      type: DataTypes.ENUM("Home", "Work", "Other"),
      defaultValue: "Home",
    },
    address: {
      type: DataTypes.STRING(255),
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: "saved_locations",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
    ],
  });
};