const { RefillOrder, RefillOrderItem, Prescription, Payment, Delivery } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');

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
        description: `1 Qty`,
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
const initiatePayment = async (req, res) => {
  try {
    const { refillId } = req.params;
    const { paymentMethod, phoneNumber } = req.body;

    const order = await RefillOrder.findOne({ where: { id: refillId, patientId: req.patient.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    const payment = await Payment.create({
      patientId: req.patient.id,
      refillOrderId: refillId,
      method: paymentMethod,
      phoneNumber,
      amount: order.total,
      expiresAt: new Date(Date.now() + 60 * 1000),
    });

    // In production: trigger M-Pesa STK push via Daraja API here
    if (process.env.NODE_ENV === 'development') {
      console.log(`💳 M-Pesa STK push to ${phoneNumber} for KES ${order.total}`);
    }

    return successResponse(res, {
      transactionId: payment.id,
      status: payment.status,
      message: 'Please check your phone and enter M-Pesa PIN',
      amount: payment.amount,
      expiresIn: 60,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'INITIATE_PAYMENT_ERROR');
  }
};

// GET /payments/:transactionId/status
const getPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const payment = await Payment.findOne({ where: { id: transactionId, patientId: req.patient.id } });
    if (!payment) return errorResponse(res, 'Transaction not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      transactionId: payment.id,
      status: payment.status,
      paymentMethod: 'M-Pesa',
      amount: payment.amount,
      receiptNumber: payment.mpesaReceiptNumber || payment.receiptNumber,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'PAYMENT_STATUS_ERROR');
  }
};

// POST /payments/mpesa/callback  (M-Pesa Daraja callback)
const mpesaCallback = async (req, res) => {
  try {
    const { Body } = req.body;
    const stkCallback = Body?.stkCallback;

    if (!stkCallback) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const resultCode = stkCallback.ResultCode;
    const checkoutRequestId = stkCallback.CheckoutRequestID;

    // Find payment by the Daraja CheckoutRequestID (store when initiating STK)
    const payment = await Payment.findOne({ where: { id: checkoutRequestId } });

    if (payment) {
      if (resultCode === 0) {
        const metadata = stkCallback.CallbackMetadata?.Item || [];
        const getVal = (name) => metadata.find((i) => i.Name === name)?.Value;

        await payment.update({
          status: 'completed',
          mpesaReceiptNumber: getVal('MpesaReceiptNumber'),
        });

        // Update order status
        await RefillOrder.update({ paymentStatus: 'paid', status: 'processing' }, { where: { id: payment.refillOrderId } });
      } else {
        await payment.update({ status: 'failed' });
      }
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Always return 200 to Safaricom
  }
};

// GET /orders/:refillId/confirmation
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
      paymentMethod: 'M-Pesa',
      amount: order.total,
      items: order.RefillOrderItems?.map((item) => ({
        name: item.Prescription?.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: order.total,
      nextSteps: 'Your order has been confirmed and is being processed.',
      actions: [
        { label: 'View Order Status', action: 'track_order', endpoint: `/orders/${order.id}/track` },
        { label: 'Back to Home', action: 'home' },
      ],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ORDER_CONFIRMATION_ERROR');
  }
};

// GET /orders/:refillId/track
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
      estimatedArrival: delivery?.estimatedArrival || '12 min',
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

module.exports = { getOrderSummary, initiatePayment, getPaymentStatus, mpesaCallback, getOrderConfirmation, trackDelivery, contactCourier };
