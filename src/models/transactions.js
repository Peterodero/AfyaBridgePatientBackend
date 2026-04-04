const { DataTypes, UUIDV4 } = require("sequelize");

module.exports = (sequelize) => {

  // ─────────────────────────────────────────────────────────────
  // TRANSACTION
  // One row per financial event across all user types.
  // Replaces: Finance.transactionHistory, Finance.recentPayouts,
  //           Finance.trend (trend is computed from this table
  //           using date range queries — no need to store it)
  //
  // Every time money moves:
  //   1. Insert a Transaction row
  //   2. Update Wallet.balance (increment for credit, decrement for debit)
  // ─────────────────────────────────────────────────────────────
  const Transaction = sequelize.define("Transaction", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Wallet / User ───────────────────────────────────────
    wallet_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → wallets.id
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (denormalized for easy querying)
    },

    // ─── Amount ──────────────────────────────────────────────
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: "KES",
    },

    // ─── Type ────────────────────────────────────────────────
    type: {
      type: DataTypes.ENUM("credit", "debit"),
      allowNull: false,
    },

    // ─── Category ────────────────────────────────────────────
    // What triggered this transaction
    category: {
      type: DataTypes.ENUM(
        "consultation_fee",             // doctor receives from patient
        "order_payment",                // pharmacy receives from patient
        "delivery_fee",                 // rider earns per delivery
        "payout",                       // rider / pharmacist withdrawal
        "refund",                       // patient refunded
        "platform_fee",                 // platform deducts commission
        "top_up",                       // user adds funds
        "adjustment"                    // manual admin correction
      ),
      allowNull: false,
    },

    // ─── Status ──────────────────────────────────────────────
    status: {
      type: DataTypes.ENUM("pending", "completed", "failed", "reversed"),
      defaultValue: "pending",
      allowNull: false,
    },

    // ─── Reference (what triggered this transaction) ─────────
    reference_id: {
      type: DataTypes.UUID,             // e.g. order_id, delivery_id, appointment_id
    },
    reference_type: {
      type: DataTypes.STRING(50),       // e.g. "order", "delivery", "appointment"
    },

    // ─── Payment Details ─────────────────────────────────────
    payment_method: {
      type: DataTypes.ENUM("mpesa", "cash", "insurance", "nhif", "wallet"),
    },
    mpesa_ref: {
      type: DataTypes.STRING(100),      // M-Pesa transaction code
    },

    // ─── Balance Snapshot ────────────────────────────────────
    // Balance on the wallet AFTER this transaction was applied.
    // Useful for statement generation without re-computing history.
    balance_after: {
      type: DataTypes.DECIMAL(12, 2),
    },

    // ─── Notes ───────────────────────────────────────────────
    description: {
      type: DataTypes.STRING(255),      // human readable e.g. "Payment for Order #00123"
    },

    // ─── Timestamps ──────────────────────────────────────────
    transacted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

  }, {
    tableName: "transactions",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["wallet_id"] },
      { fields: ["user_id"] },
      { fields: ["type"] },
      { fields: ["category"] },
      { fields: ["status"] },
      { fields: ["reference_id", "reference_type"] },
      { fields: ["transacted_at"] },    // for trend/date range queries
      { fields: ["payment_method"] },
    ],
  });


  return Transaction;
};