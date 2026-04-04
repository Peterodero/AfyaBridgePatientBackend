const { models:{Wallet, Transaction, Order, User} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const serviceClient = require('../utils/serviceClients');

// ─── Internal helper: get or create wallet for a patient 
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ where: { user_id: userId } });
  if (!wallet) {
    wallet = await Wallet.create({
      user_id: userId,
      balance: 0,
      currency: 'KES',
      is_active: true,
    });
  }
  return wallet;
};

// ─── Internal helper: record a transaction and update balance 
// Must be called inside a Sequelize transaction (t)
const recordTransaction = async ({ wallet, type, category, amount, referenceId, referenceType, paymentMethod, mpesaRef, description }, t) => {
  const newBalance =
    type === 'credit'
      ? parseFloat(wallet.balance) + parseFloat(amount)
      : parseFloat(wallet.balance) - parseFloat(amount);

  await wallet.update({ balance: newBalance }, { transaction: t });

  const txn = await Transaction.create({
    wallet_id: wallet.id,
    user_id: wallet.user_id,
    amount,
    type,
    category,
    status: 'completed',
    reference_id: referenceId || null,
    reference_type: referenceType || null,
    payment_method: paymentMethod || null,
    mpesa_ref: mpesaRef || null,
    balance_after: newBalance,
    description: description || null,
    transacted_at: new Date(),
  }, { transaction: t });

  return { txn, newBalance }; 
};

// GET /wallet
// Returns the patient's wallet balance and summary
const getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    // Quick stats
    const [totalDeposited, totalSpent] = await Promise.all([
      Transaction.sum('amount', { where: { wallet_id: wallet.id, type: 'credit', status: 'completed' } }),
      Transaction.sum('amount', { where: { wallet_id: wallet.id, type: 'debit', status: 'completed' } }),
    ]);

    return successResponse(res, {
      walletId: wallet.id,
      balance: parseFloat(wallet.balance),
      currency: wallet.currency,
      isActive: wallet.is_active,
      payoutMethod: wallet.payout_method,
      payoutAccount: wallet.payout_account,
      stats: {
        totalDeposited: parseFloat(totalDeposited || 0),
        totalSpent: parseFloat(totalSpent || 0),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_WALLET_ERROR');
  }
};

// POST /wallet/deposit/mpesa
// Patient deposits money into wallet via M-Pesa STK push.
// Patient backend triggers STK push directly here since this is
// a wallet top-up, not an order payment (pharmacy not involved).
const depositViaMpesa = async (req, res) => {
  try {
    const { amount, phoneNumber } = req.body;

    if (!amount || parseFloat(amount) <= 0)
      return errorResponse(res, 'Invalid deposit amount', 400, 'INVALID_AMOUNT');

    if (parseFloat(amount) < 10)
      return errorResponse(res, 'Minimum deposit amount is KES 10', 400, 'BELOW_MINIMUM');

    if (parseFloat(amount) > 150000)
      return errorResponse(res, 'Maximum deposit amount is KES 150,000', 400, 'ABOVE_MAXIMUM');

    const wallet = await getOrCreateWallet(req.user.id);

    const phone = phoneNumber || req.user.phone_number;

    // TODO: Trigger real Daraja STK Push here
    // The callback URL will be POST /wallet/deposit/mpesa/callback
    // For now we simulate a pending deposit transaction
    const pendingTxn = await Transaction.create({
      wallet_id: wallet.id,
      user_id: req.user.id,
      amount: parseFloat(amount),
      type: 'credit',
      category: 'top_up',
      status: 'pending',
      payment_method: 'mpesa',
      description: `Wallet top-up via M-Pesa`,
      transacted_at: new Date(),
    });

    return successResponse(res, {
      transactionId: pendingTxn.id,
      status: 'pending',
      message: `An M-Pesa prompt has been sent to ${phone}. Enter your PIN to complete the deposit.`,
      amount: parseFloat(amount),
      currency: 'KES',
      checkStatusAt: `/wallet/deposit/${pendingTxn.id}/status`,
    }, 'M-Pesa prompt initiated');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DEPOSIT_MPESA_ERROR');
  }
};

// POST /wallet/deposit/mpesa/callback
// Safaricom calls this after the patient completes the STK push.
// Finds the pending transaction and credits the wallet.

const mpesaDepositCallback = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { Body } = req.body;
    const stk = Body?.stkCallback;

    if (!stk || stk.ResultCode !== 0) {
      // Payment failed or cancelled — mark pending txn as failed
      // In production, match by CheckoutRequestID stored on the transaction
      await t.commit();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const metadata = stk.CallbackMetadata?.Item || [];
    const get = (name) => metadata.find((i) => i.Name === name)?.Value;

    const amount = parseFloat(get('Amount'));
    const mpesaRef = get('MpesaReceiptNumber');
    const phone = get('PhoneNumber')?.toString();

    // Find the patient by phone number
    const user = await User.findOne({ where: { phone_number: phone, role: 'patient' } });
    if (!user) { await t.rollback(); return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); }

    const wallet = await getOrCreateWallet(user.id);

    // Fail any existing pending top_up without mpesa_ref (duplicate guard)
    await Transaction.update(
      { status: 'failed' },
      { where: { wallet_id: wallet.id, category: 'top_up', status: 'pending', mpesa_ref: null }, transaction: t }
    );

    // Credit wallet
    await recordTransaction({
      wallet,
      type: 'credit',
      category: 'top_up',
      amount,
      paymentMethod: 'mpesa',
      mpesaRef,
      description: `M-Pesa deposit — ${mpesaRef}`,
    }, t);

    await t.commit();

    // TODO: Send in-app / SMS notification to patient about successful deposit

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    await t.rollback();
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Always 200 to Safaricom
  }
};

// GET /wallet/deposit/:transactionId/status
// Patient polls this to know if their pending deposit went through

const getDepositStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const txn = await Transaction.findOne({
      where: { id: transactionId, user_id: req.user.id, category: 'top_up' },
    });
    if (!txn) return errorResponse(res, 'Transaction not found', 404, 'NOT_FOUND');

    const wallet = await getOrCreateWallet(req.user.id);

    return successResponse(res, {
      transactionId: txn.id,
      status: txn.status,
      amount: parseFloat(txn.amount),
      mpesaRef: txn.mpesa_ref,
      walletBalance: parseFloat(wallet.balance),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DEPOSIT_STATUS_ERROR');
  }
};

// POST /wallet/pay
// Patient pays for an Order directly from wallet balance.
// This is the primary payment method — replaces M-Pesa per-order.

const payFromWallet = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderId } = req.body;

    if (!orderId)
      return errorResponse(res, 'orderId is required', 400, 'MISSING_ORDER_ID');

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id }, transaction: t });
    if (!order) { await t.rollback(); return errorResponse(res, 'Order not found', 404, 'NOT_FOUND'); }

    if (order.payment_status === 'paid') {
      await t.rollback();
      return errorResponse(res, 'This order has already been paid', 400, 'ALREADY_PAID');
    }

    if (!order.total_amount || parseFloat(order.total_amount) <= 0) {
      await t.rollback();
      return errorResponse(res, 'Order amount is not set. Please wait for the pharmacy to confirm pricing.', 400, 'AMOUNT_NOT_SET');
    }

    const wallet = await Wallet.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!wallet || !wallet.is_active) {
      await t.rollback();
      return errorResponse(res, 'Wallet not found or inactive', 404, 'WALLET_NOT_FOUND');
    }

    if (parseFloat(wallet.balance) < parseFloat(order.total_amount)) {
      await t.rollback();
      return errorResponse(res, `Insufficient wallet balance. You need KES ${order.total_amount} but your balance is KES ${wallet.balance}. Please top up your wallet.`, 400, 'INSUFFICIENT_BALANCE');
    }

    // Debit wallet
    const { txn, newBalance } = await recordTransaction({
      wallet,
      type: 'debit',
      category: 'order_payment',
      amount: parseFloat(order.total_amount),
      referenceId: order.id,
      referenceType: 'Order',
      paymentMethod: 'wallet',
      description: `Payment for order #${order.order_number}`,
    }, t);

    // Mark order as paid
    await order.update({
      payment_status: 'paid',
      payment_method: 'wallet',
    }, { transaction: t });

    await t.commit();

    return successResponse(res, {
      transactionId: txn.id,
      orderId: order.id,
      orderNumber: order.order_number,
      amountPaid: parseFloat(order.total_amount),
      walletBalanceAfter: newBalance,
      paymentStatus: 'paid',
      paymentMethod: 'wallet',
      message: `KES ${order.total_amount} paid successfully from your AfyaBridge wallet.`,
    }, 'Payment successful');
  } catch (error) {
    await t.rollback();
    return errorResponse(res, error.message, 500, 'PAY_FROM_WALLET_ERROR');
  }
};

// GET /wallet/transactions
// Returns paginated transaction history for the patient's wallet

const getTransactionHistory = async (req, res) => {
  try {
    const { type, category, status, page = 1, limit = 20 } = req.query;

    const wallet = await Wallet.findOne({ where: { user_id: req.user.id } });
    if (!wallet) return successResponse(res, { transactions: [], pagination: { total: 0 } });

    const where = { wallet_id: wallet.id };
    if (type) where.type = type;
    if (category) where.category = category;
    if (status) where.status = status;

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order: [['transacted_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return successResponse(res, {
      walletBalance: parseFloat(wallet.balance),
      transactions: rows.map((txn) => ({
        id: txn.id,
        type: txn.type,
        category: txn.category,
        amount: parseFloat(txn.amount),
        status: txn.status,
        paymentMethod: txn.payment_method,
        mpesaRef: txn.mpesa_ref,
        referenceId: txn.reference_id,
        referenceType: txn.reference_type,
        balanceAfter: parseFloat(txn.balance_after),
        description: txn.description,
        transactedAt: txn.transacted_at,
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_TRANSACTIONS_ERROR');
  }
};

// GET /wallet/transactions/:transactionId
// Returns a single transaction detail

const getTransactionDetail = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ where: { user_id: req.user.id } });
    if (!wallet) return errorResponse(res, 'Wallet not found', 404, 'NOT_FOUND');

    const txn = await Transaction.findOne({
      where: { id: req.params.transactionId, wallet_id: wallet.id },
    });
    if (!txn) return errorResponse(res, 'Transaction not found', 404, 'NOT_FOUND');

    // If this is an order payment, attach order info
    let orderInfo = null;
    if (txn.reference_type === 'Order' && txn.reference_id) {
      const order = await Order.findByPk(txn.reference_id);
      if (order) {
        orderInfo = {
          orderId: order.id,
          orderNumber: order.order_number,
          status: order.status,
        };
      }
    }

    return successResponse(res, {
      id: txn.id,
      type: txn.type,
      category: txn.category,
      amount: parseFloat(txn.amount),
      status: txn.status,
      paymentMethod: txn.payment_method,
      mpesaRef: txn.mpesa_ref,
      balanceAfter: parseFloat(txn.balance_after),
      description: txn.description,
      transactedAt: txn.transacted_at,
      order: orderInfo,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_TRANSACTION_DETAIL_ERROR');
  }
};

// PUT /wallet/payout-method
// Patient sets their preferred payout method (for refunds)

const setPayoutMethod = async (req, res) => {
  try {
    const { payoutMethod, payoutAccount } = req.body;

    if (!['mpesa', 'bank'].includes(payoutMethod))
      return errorResponse(res, 'Invalid payout method. Use mpesa or bank.', 400, 'INVALID_PAYOUT_METHOD');

    const wallet = await getOrCreateWallet(req.user.id);
    await wallet.update({ payout_method: payoutMethod, payout_account: payoutAccount });

    return successResponse(res, {
      payoutMethod: wallet.payout_method,
      payoutAccount: wallet.payout_account,
    }, 'Payout method updated');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SET_PAYOUT_METHOD_ERROR');
  }
};

module.exports = {
  getWallet,
  depositViaMpesa,
  mpesaDepositCallback,
  getDepositStatus,
  payFromWallet,
  getTransactionHistory,
  getTransactionDetail,
  setPayoutMethod,
};