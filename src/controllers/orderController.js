const { RefillOrder, RefillOrderItem, Prescription, Payment, Delivery } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');

// GET /orders/:refillId/summary
const getOrderSummary = async (req, res) => {
  try {
    const { refillId } = req.params;

    const order = await RefillOrder.findOne({
      where: { id: refillId, patientId: req.patient.id },
      include: [{ model: RefillOrderItem, include: [{ model: Prescription }] }],
    });

    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      serviceType: order.fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup',
      deliveryAddress: order.deliveryAddress ? { name: 'Home', address: order.deliveryAddress } : null,
      items: order.RefillOrderItems?.map((item) => ({
        id: item.prescriptionId,
        name: item.Prescription?.name,
        description: '1 Qty',
        price: item.price,
      })),
      paymentBreakdown: {
        subtotal: order.subtotal,
        delivery: order.deliveryFee,
        total: order.total,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ORDER_SUMMARY_ERROR');
  }
};

// POST /orders/:refillId/pay
// Patient backend does NOT touch Daraja/M-Pesa directly.
// It delegates payment initiation to the pharmacy backend.
// The pharmacy backend owns M-Pesa STK push and the callback URL.
const initiatePayment = async (req, res) => {
  try {
    const { refillId } = req.params;
    const { paymentMethod, phoneNumber } = req.body;

    // Verify the order belongs to this patient
    const order = await RefillOrder.findOne({ where: { id: refillId, patientId: req.patient.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    if (order.paymentStatus === 'paid') {
      return errorResponse(res, 'This order has already been paid', 400, 'ALREADY_PAID');
    }

    // Forward payment request to pharmacy backend
    // Pharmacy backend will trigger M-Pesa STK push, create Payment record,
    // store checkoutRequestId, and handle the Safaricom callback
    const result = await serviceClient('pharmacy', 'POST', `/payments/initiate`, {
      refillOrderId: refillId,
      patientId: req.patient.id,
      paymentMethod,
      phoneNumber,
      amount: order.total,
    });

    if (!result.success) {
      return errorResponse(res, result.error, result.status, 'PAYMENT_SERVICE_ERROR');
    }

    return successResponse(res, result.data);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'INITIATE_PAYMENT_ERROR');
  }
};

// GET /payments/:transactionId/status
// Reads Payment record directly from shared DB — no service call needed
const getPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const payment = await Payment.findOne({ where: { id: transactionId, patientId: req.patient.id } });
    if (!payment) return errorResponse(res, 'Transaction not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      transactionId: payment.id,
      status: payment.status,
      paymentMethod: payment.method,
      amount: payment.amount,
      receiptNumber: payment.mpesaReceiptNumber,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'PAYMENT_STATUS_ERROR');
  }
};

// GET /orders/:refillId/confirmation
// Reads from shared DB directly — pharmacy backend already updated the order after payment
const getOrderConfirmation = async (req, res) => {
  try {
    const { refillId } = req.params;

    const order = await RefillOrder.findOne({
      where: { id: refillId, patientId: req.patient.id },
      include: [{ model: RefillOrderItem, include: [{ model: Prescription }] }],
    });

    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      orderId: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentType: order.fulfillmentType,
      items: order.RefillOrderItems?.map((item) => ({
        name: item.Prescription?.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: order.total,
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

// GET /orders/:refillId/track
// Reads Delivery record from shared DB — rider backend updates it as delivery progresses
const trackDelivery = async (req, res) => {
  try {
    const { refillId } = req.params;

    const order = await RefillOrder.findOne({ where: { id: refillId, patientId: req.patient.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    const delivery = await Delivery.findOne({ where: { refillOrderId: refillId } });

    const timeline = [
      { status: 'Order Confirmed', description: 'Your order has been confirmed', completed: true },
      { status: 'Picked Up', description: 'Rider picked up order from pharmacy', completed: ['out_for_delivery', 'delivered'].includes(order.status) },
      { status: 'Out for Delivery', description: 'Your order is on the way', completed: order.status === 'delivered', active: order.status === 'out_for_delivery' },
      { status: 'Delivered', description: 'Order delivered to you', completed: order.status === 'delivered' },
    ];

    return successResponse(res, {
      orderId: order.id,
      status: order.status,
      estimatedArrival: delivery?.estimatedArrival || 'Calculating...',
      lastUpdated: 'Updated 1 min ago',
      timeline,
      courier: delivery ? {
        name: delivery.courierName,
        rating: delivery.courierRating,
        phone: delivery.courierPhone,
      } : null,
      mapData: delivery ? {
        riderLocation: { lat: delivery.riderLat, lng: delivery.riderLng },
        destination: { lat: order.deliveryCoordinatesLat, lng: order.deliveryCoordinatesLng },
      } : null,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'TRACK_DELIVERY_ERROR');
  }
};

// POST /orders/:refillId/courier/contact
// Reads courier phone from shared DB then lets patient call/SMS directly
const contactCourier = async (req, res) => {
  try {
    const { refillId } = req.params;
    const { contactMethod } = req.body;

    const delivery = await Delivery.findOne({ where: { refillOrderId: refillId } });
    if (!delivery) return errorResponse(res, 'Delivery not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      message: `Initiating ${contactMethod} to courier...`,
      phoneNumber: delivery.courierPhone,
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