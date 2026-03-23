const { Prescription, User, Pharmacy } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');
const { Op } = require('sequelize');

// GET /meds/dashboard
const getMedsDashboard = async (req, res) => {
  try {
    const user = req.user;
    const today = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Active prescriptions: status = pending, validated, or dispensed (not yet delivered)
    const activePrescriptions = await Prescription.findAll({
      where: {
        patient_id: user.id,
        status: { [Op.in]: ['pending', 'validated', 'dispensed'] },
      },
    });

    return successResponse(res, {
      date: { day: dayNames[today.getDay()], date: today.getDate() },
      greeting: `Good Morning, ${user.full_name.split(' ')[0]}.`,
      adherence: {
        percentage: 75,
        completed: 3,
        total: activePrescriptions.length || 4,
        message: "You are 75% done with today's meds.",
      },
      quickOrder: { enabled: true, message: 'Tap to start making medicine order' },
      activePrescriptions: activePrescriptions.length,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MEDS_DASHBOARD_ERROR');
  }
};

// GET /prescriptions/refillable
// Prescriptions that are dispensed and eligible for refill
const getRefillableMeds = async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
        status: 'dispensed', // Already dispensed = eligible for refill
      },
    });

    const formattedMeds = prescriptions.map((p) => ({
      id: p.id,
      prescriptionNumber: p.prescription_number,
      diagnosis: p.diagnosis,
      issueDate: p.issue_date,
      expiryDate: p.expiry_date,
      // items is a JSON array: [{drug_name, dosage, quantity, ...}]
      items: p.items || [],
      selected: false,
    }));

    return successResponse(res, {
      instructions: 'Select the prescriptions you need refilled and choose your preferred pickup or delivery option.',
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

    const prescription = await Prescription.findOne({
      where: { id: prescriptionId, patient_id: req.user.id },
    });
    if (!prescription) return errorResponse(res, 'Prescription not found', 404, 'NOT_FOUND');

    // Calculate subtotal from items JSON
    const subtotal = selected
      ? (prescription.items || []).reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
      : 0;

    return successResponse(res, {
      selectedCount: selected ? 1 : 0,
      selectedItems: selected ? [{ id: prescription.id, prescriptionNumber: prescription.prescription_number, items: prescription.items }] : [],
      summary: { subtotal, deliveryFee: 150, total: subtotal + 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SELECT_MED_ERROR');
  }
};

// POST /prescriptions/refill
// Delegates to pharmacy backend — pharmacy backend creates the Order record
const submitRefill = async (req, res) => {
  try {
    const { selectedPrescriptions, pharmacyId, fulfillmentType, pharmacistNotes, paymentMethod } = req.body;

    if (!selectedPrescriptions || selectedPrescriptions.length === 0)
      return errorResponse(res, 'No prescriptions selected', 400, 'NO_PRESCRIPTIONS');

    // Verify all prescriptions belong to this patient
    const prescriptions = await Prescription.findAll({
      where: { id: { [Op.in]: selectedPrescriptions }, patient_id: req.user.id },
    });

    if (prescriptions.length === 0)
      return errorResponse(res, 'No valid prescriptions found', 400, 'INVALID_PRESCRIPTIONS');

    // Forward to pharmacy backend — pharmacy backend creates Order record
    const result = await serviceClient('pharmacy', 'POST', '/orders/create', {
      patientId: req.user.id,
      patientName: req.user.full_name,
      patientPhone: req.user.phone_number,
      prescriptionIds: selectedPrescriptions,
      pharmacyId,
      fulfillmentType,
      pharmacistNotes,
      paymentMethod,
    });

    if (!result.success) {
      return errorResponse(res, 'Pharmacy service is currently unavailable. Please try again later.', 503, 'PHARMACY_SERVICE_UNAVAILABLE');
    }

    return successResponse(res, result.data, 'Refill request submitted', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SUBMIT_REFILL_ERROR');
  }
};

// GET /medicines/search
const searchMedicines = async (req, res) => {
  try {
    const { q } = req.query;

    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
        status: { [Op.in]: ['pending', 'validated', 'dispensed'] },
      },
      limit: 10,
    });

    // Search within items JSON array
    const matchingItems = [];
    prescriptions.forEach((p) => {
      (p.items || []).forEach((item) => {
        if (!q || item.drug_name?.toLowerCase().includes(q.toLowerCase())) {
          matchingItems.push({
            prescriptionId: p.id,
            drugName: item.drug_name,
            dosage: item.dosage,
            frequency: item.frequency,
            issueDate: p.issue_date,
          });
        }
      });
    });

    return successResponse(res, {
      query: q,
      results: matchingItems.slice(0, 10),
      manualAdd: { enabled: true, fields: ['medicineName', 'dosage', 'quantity'] },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_MEDICINES_ERROR');
  }
};

module.exports = {
  getMedsDashboard,
  getRefillableMeds,
  selectMedication,
  submitRefill,
  searchMedicines,
};
