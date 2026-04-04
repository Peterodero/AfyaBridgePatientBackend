const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("MedicalRecord", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    type: {
      type: DataTypes.ENUM(
        "lab",
        "vaccination",
        "consultation",
        "prescription",
        "imaging"
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    facility: {
      type: DataTypes.STRING(150),
    },
    file_url: {
      type: DataTypes.STRING(500),
    },
    date: {
      type: DataTypes.DATEONLY,
    },
  }, {
    tableName: "medical_records",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["type"] },
      { fields: ["date"] },
    ],
  });
};