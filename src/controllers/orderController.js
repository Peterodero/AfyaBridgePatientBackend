const { Order, Delivery, Prescription, Wallet, Transaction } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const { sequelize } = require('../config/database');
const serviceClient = require('../utils/serviceClients');

// ─── Internal: debit wallet and mark order paid (used within a DB transaction) ─
const payOrderFromWallet = async (order, wallet, t) => {
  const newBalance = parseFloat(wallet.balance) - parseFloat(order.total_amount);

  await wallet.update({ balance: newBalance }, { transaction: t });

  const txn = await Transaction.create({
    wallet_id: wallet.id,
    user_id: wallet.user_id,
    amount: parseFloat(order.total_amount),
    type: 'debit',
    category: 'order_payment',
    status: 'completed',
    reference_id: order.id,
    reference_type: 'Order',
    payment_method: 'wallet',
    balance_after: newBalance,
    description: `Payment for order #${order.order_number}`,
    transacted_at: new Date(),
  }, { transaction: t });

  await order.update({ payment_status: 'paid', payment_method: 'wallet' }, { transaction: t });

  return { txn, newBalance };
};

// GET /orders/:orderId/summary
const getOrderSummary = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    let items = [];
    if (order.prescription_id) {
      const prescription = await Prescription.findByPk(order.prescription_id);
      items = (prescription?.items || []).map((item) => ({
        drugName: item.drug_name,
        dosage: item.dosage,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      }));
    }

    // Check wallet balance for the patient
    const wallet = await Wallet.findOne({ where: { user_id: req.user.id } });
    const walletBalance = parseFloat(wallet?.balance || 0);
    const canPayFromWallet = walletBalance >= parseFloat(order.total_amount || 0);

    return successResponse(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      serviceType: order.delivery_type === 'home_delivery' ? 'Delivery' : 'Pickup',
      status: order.status,
      items,
      paymentBreakdown: {
        total: parseFloat(order.total_amount),
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
      },
      walletBalance,
      canPayFromWallet,
      topUpRequired: canPayFromWallet ? 0 : Math.max(0, parseFloat(order.total_amount || 0) - walletBalance),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ORDER_SUMMARY_ERROR');
  }
};

// POST /orders/:orderId/pay
// Supports two payment methods:
//   paymentMethod: "wallet"  → debit wallet immediately, order marked paid
//   paymentMethod: "mpesa"   → forward to pharmacy backend for STK push
const initiatePayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderId } = req.params;
    const { paymentMethod = 'wallet', phoneNumber } = req.body;

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id }, transaction: t });
    if (!order) { await t.rollback(); return errorResponse(res, 'Order not found', 404, 'NOT_FOUND'); }

    if (order.payment_status === 'paid') {
      await t.rollback();
      return errorResponse(res, 'This order has already been paid', 400, 'ALREADY_PAID');
    }

    if (!order.total_amount || parseFloat(order.total_amount) <= 0) {
      await t.rollback();
      return errorResponse(res, 'Order amount is not set yet. Please wait for pharmacy to confirm pricing.', 400, 'AMOUNT_NOT_SET');
    }

    // ── Wallet payment ───────────────────────────────────────────
    if (paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ where: { user_id: req.user.id }, transaction: t });

      if (!wallet || !wallet.is_active) {
        await t.rollback();
        return errorResponse(res, 'Wallet not found. Please set up your wallet first.', 404, 'WALLET_NOT_FOUND');
      }

      if (parseFloat(wallet.balance) < parseFloat(order.total_amount)) {
        await t.rollback();
        const shortfall = (parseFloat(order.total_amount) - parseFloat(wallet.balance)).toFixed(2);
        return errorResponse(res,
          `Insufficient wallet balance. You need KES ${shortfall} more. Please top up your wallet.`,
          400, 'INSUFFICIENT_BALANCE'
        );
      }

      const { txn, newBalance } = await payOrderFromWallet(order, wallet, t);
      await t.commit();

      return successResponse(res, {
        paymentMethod: 'wallet',
        transactionId: txn.id,
        orderId: order.id,
        orderNumber: order.order_number,
        amountPaid: parseFloat(order.total_amount),
        walletBalanceAfter: newBalance,
        paymentStatus: 'paid',
        message: `KES ${order.total_amount} paid from your AfyaBridge wallet.`,
      }, 'Payment successful');
    }

    // ── M-Pesa payment (fallback) ────────────────────────────────
    if (paymentMethod === 'mpesa') {
      await t.rollback(); // No DB writes yet — pharmacy backend handles this

      const result = await serviceClient('pharmacy', 'POST', '/payments/initiate', {
        orderId,
        patientId: req.user.id,
        paymentMethod: 'mpesa',
        phoneNumber: phoneNumber || req.user.phone_number,
        amount: order.total_amount,
      });

      if (!result.success)
        return errorResponse(res, 'Payment service is currently unavailable. Please try again later.', 503, 'PAYMENT_SERVICE_UNAVAILABLE');

      return successResponse(res, result.data);
    }

    await t.rollback();
    return errorResponse(res, 'Invalid payment method. Use wallet or mpesa.', 400, 'INVALID_PAYMENT_METHOD');
  } catch (error) {
    await t.rollback();
    return errorResponse(res, error.message, 500, 'INITIATE_PAYMENT_ERROR');
  }
};

// GET /payments/:orderId/status
const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    // If paid via wallet, find the wallet transaction
    let walletTransaction = null;
    if (order.payment_method === 'wallet') {
      walletTransaction = await Transaction.findOne({
        where: { reference_id: order.id, reference_type: 'Order', category: 'order_payment' },
        order: [['created_at', 'DESC']],
      });
    }

    return successResponse(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      totalAmount: parseFloat(order.total_amount),
      mpesaRef: order.mpesa_ref,
      walletTransactionId: walletTransaction?.id || null,
      paidAt: walletTransaction?.transacted_at || null,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'PAYMENT_STATUS_ERROR');
  }
};

// GET /orders/:orderId/confirmation
const getOrderConfirmation = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    let items = [];
    if (order.prescription_id) {
      const prescription = await Prescription.findByPk(order.prescription_id);
      items = prescription?.items || [];
    }

    return successResponse(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      deliveryType: order.delivery_type,
      items,
      totalAmount: parseFloat(order.total_amount),
      nextSteps: 'Your order has been confirmed and is being processed.',
      actions: [
        { label: 'Track Order', action: 'track_order', endpoint: `/orders/${order.id}/track` },
        { label: 'Back to Home', action: 'home' },
      ],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ORDER_CONFIRMATION_ERROR');
  }
};

// GET /orders/:orderId/track
const trackDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    const delivery = await Delivery.findOne({ where: { order_id: orderId } });

    const timeline = [
      { status: 'Order Confirmed', description: 'Your order has been confirmed', completed: true },
      { status: 'Picked Up', description: 'Rider picked up order from pharmacy', completed: ['out_for_delivery', 'delivered'].includes(delivery?.status) },
      { status: 'Out for Delivery', description: 'Your order is on the way', completed: delivery?.status === 'delivered', active: delivery?.status === 'out_for_delivery' },
      { status: 'Delivered', description: 'Order delivered to you', completed: delivery?.status === 'delivered' },
    ];

    return successResponse(res, {
      orderId: order.id,
      orderStatus: order.status,
      deliveryStatus: delivery?.status || 'pending',
      estimatedArrival: delivery?.estimated_delivery_time || 'Calculating...',
      timeline,
      courier: delivery?.rider_id ? {
        phone: delivery.receiver_contact,
        pickupLocation: delivery.pickup_location,
        dropoffLocation: delivery.dropoff_location,
      } : null,
      mapData: delivery ? {
        pickup: { lat: delivery.pickup_lat, lng: delivery.pickup_lng },
        dropoff: { lat: delivery.dropoff_lat, lng: delivery.dropoff_lng },
      } : null,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'TRACK_DELIVERY_ERROR');
  }
};

// POST /orders/:orderId/courier/contact
const contactCourier = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { contactMethod } = req.body;

    const delivery = await Delivery.findOne({ where: { order_id: orderId } });
    if (!delivery) return errorResponse(res, 'Delivery not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      message: `Initiating ${contactMethod} to courier...`,
      phoneNumber: delivery.pickup_contact,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CONTACT_COURIER_ERROR');
  }
};

module.exports = {
  getOrderSummary,
  initiatePayment,
  getPaymentStatus,
  getOrderConfirmation,
  trackDelivery,
  contactCourier,
};