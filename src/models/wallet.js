const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // WALLET
  // One row per user. Holds the current balance only.
  // Balance is updated by inserting a Transaction row and then
  // incrementing / decrementing this value — never edited directly.
  // Replaces: Finance.balance + Rider.balance
  // ─────────────────────────────────────────────────────────────
  const Wallet = sequelize.define("Wallet", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationship ────────────────────────────────────────
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,                     // FK → users.id (one wallet per user)
    },

    // ─── Balance ─────────────────────────────────────────────
    balance: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
    },

    // ─── Currency ────────────────────────────────────────────
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: "KES",
    },

    // ─── Status ──────────────────────────────────────────────
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // ─── Payout Details ──────────────────────────────────────
    // For riders and pharmacists receiving payouts
    payout_method: {
      type: DataTypes.ENUM("mpesa", "bank"),
    },
    payout_account: {
      type: DataTypes.STRING(100),      // M-Pesa number or bank account
    },

  }, {
    tableName: "wallets",
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ["user_id"] },
      { fields: ["is_active"] },
    ],
  });


  return Wallet;
};