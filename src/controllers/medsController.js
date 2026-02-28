const { Prescription, Notification, ManualMedicine } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');

// GET /meds/dashboard
const getMedsDashboard = async (req, res) => {
  try {
    const patient = req.patient;
    const today = new Date();

    const activePrescriptions = await Prescription.findAll({
      where: { patientId: patient.id, isActive: true },
    });

    const lowStockAlerts = activePrescriptions
      .filter((p) => p.refillsRemaining <= 3)
      .map((p) => ({
        id: `ALERT-${p.id}`,
        medication: p.name,
        message: `${p.name} is running low`,
        details: `You have ${p.refillsRemaining} days left of your prescription`,
      }));

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return successResponse(res, {
      date: { day: dayNames[today.getDay()], date: today.getDate() },
      greeting: `Good Morning, ${patient.fullName.split(' ')[0]}.`,
      adherence: {
        percentage: 75,
        completed: 3,
        total: activePrescriptions.length || 4,
        message: 'You are 75% done with today meds.',
      },
      quickOrder: { enabled: true, message: 'Tap to start making medicine order' },
      alerts: lowStockAlerts,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MEDS_DASHBOARD_ERROR');
  }
};

// GET /prescriptions/refillable
const getRefillableMeds = async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: { patientId: req.patient.id, isActive: true, refillsRemaining: { [Op.gt]: 0 } },
    });

    const formattedMeds = prescriptions.map((p) => ({
      id: p.id,
      name: p.name,
      dosage: p.dosage,
      refillsRemaining: p.refillsRemaining,
      selected: false,
      price: p.price,
    }));

    return successResponse(res, {
      instructions: 'Select the medications you need refilled and choose your preferred pickup or delivery option.',
      medications: formattedMeds,
      selectedCount: 0,
      summary: { subtotal: 0, deliveryFee: 150, total: 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_REFILLABLE_ERROR');
  }
};

// POST /prescriptions/select
const selectMedication = async (req, res) => {
  try {
    const { prescriptionId, selected } = req.body;

    // In a real app, this would use a cart/session. Here we return the updated state.
    const prescription = await Prescription.findOne({ where: { id: prescriptionId, patientId: req.patient.id } });
    if (!prescription) return errorResponse(res, 'Prescription not found', 404, 'NOT_FOUND');

    const selectedItems = selected ? [{ id: prescription.id, name: prescription.name, price: prescription.price }] : [];
    const subtotal = selected ? parseFloat(prescription.price) : 0;

    return successResponse(res, {
      selectedCount: selected ? 1 : 0,
      selectedItems,
      summary: { subtotal, deliveryFee: 150, total: subtotal + 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SELECT_MED_ERROR');
  }
};

// POST /prescriptions/refill
const submitRefill = async (req, res) => {
  try {
    const { selectedPrescriptions, pharmacyId, fulfillmentType, pharmacistNotes, paymentMethod } = req.body;

    if (!selectedPrescriptions || selectedPrescriptions.length === 0) {
      return errorResponse(res, 'No prescriptions selected', 400, 'NO_PRESCRIPTIONS');
    }

    const { RefillOrder, RefillOrderItem } = require('../models');

    // Calculate total
    const prescriptions = await Prescription.findAll({
      where: { id: selectedPrescriptions, patientId: req.patient.id },
    });

    const subtotal = prescriptions.reduce((sum, p) => sum + parseFloat(p.price || 0), 0);
    const deliveryFee = fulfillmentType === 'delivery' ? 150 : 0;

    const refillOrder = await RefillOrder.create({
      patientId: req.patient.id,
      pharmacyId,
      fulfillmentType,
      pharmacistNotes,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      paymentMethod,
      estimatedReady: 'Today 4:30 PM',
    });

    // Create order items
    await Promise.all(prescriptions.map((p) =>
      RefillOrderItem.create({ refillOrderId: refillOrder.id, prescriptionId: p.id, price: p.price })
    ));

    return successResponse(res, {
      refillId: refillOrder.id,
      status: refillOrder.status,
      totalCost: refillOrder.total,
      paymentStatus: refillOrder.paymentStatus,
      estimatedReady: refillOrder.estimatedReady,
    }, 'Refill request submitted', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SUBMIT_REFILL_ERROR');
  }
};

// GET /medicines/search
const searchMedicines = async (req, res) => {
  try {
    const { q } = req.query;

    const recentPrescriptions = await Prescription.findAll({
      where: {
        patientId: req.patient.id,
        isActive: true,
        name: { [Op.like]: `%${q || ''}%` },
      },
      limit: 10,
    });

    return successResponse(res, {
      query: q,
      recentPrescriptions: recentPrescriptions.map((p) => ({
        id: p.id,
        name: p.name,
        manufacturer: 'Generic',
        prescribedDate: p.prescribedDate,
        selected: false,
      })),
      manualAdd: { enabled: true, fields: ['medicineName', 'dosage', 'quantity'] },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_MEDICINES_ERROR');
  }
};

// POST /medicines/manual
const addMedicineManually = async (req, res) => {
  try {
    const { name, dosage, quantity } = req.body;

    const medicine = await ManualMedicine.create({
      patientId: req.patient.id,
      name, dosage,
      quantity: quantity || 1,
    });

    return successResponse(res, {
      medicineId: medicine.id,
      name: medicine.name,
      dosage: medicine.dosage,
      quantity: medicine.quantity,
      selected: true,
    }, 'Medicine added', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ADD_MEDICINE_ERROR');
  }
};

module.exports = { getMedsDashboard, getRefillableMeds, selectMedication, submitRefill, searchMedicines, addMedicineManually };
