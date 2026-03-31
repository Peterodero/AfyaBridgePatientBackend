// const { Prescription, User, Pharmacy } = require('../models');
// const { successResponse, errorResponse } = require('../utils/response');
// const serviceClient = require('../utils/serviceClients');
// const { Op } = require('sequelize');

// // GET /meds/dashboard
// const getMedsDashboard = async (req, res) => {
//   try {
//     const user = req.user;
//     const today = new Date();
//     const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

//     // Active prescriptions: status = pending, validated, or dispensed (not yet delivered)
//     const activePrescriptions = await Prescription.findAll({
//       where: {
//         patient_id: user.id,
//         status: { [Op.in]: ['pending', 'validated', 'dispensed'] },
//       },
//     });

//     return successResponse(res, {
//       date: { day: dayNames[today.getDay()], date: today.getDate() },
//       greeting: `Hello, ${user.full_name.split(' ')[0]}.`,
//       adherence: {
//         percentage: 75,
//         completed: 3,
//         total: activePrescriptions.length || 0,
//         message: "You are almost done with today's meds.",
//       },
//       quickOrder: { enabled: true, message: 'Tap to start making medicine order' },
//       activePrescriptions: activePrescriptions.length,
//     });
//   } catch (error) {
//     return errorResponse(res, error.message, 500, 'MEDS_DASHBOARD_ERROR');
//   }
// };

// // GET /prescriptions/refillable
// // Prescriptions that are dispensed and eligible for refill
// const getRefillableMeds = async (req, res) => {
//   try {
//     const prescriptions = await Prescription.findAll({
//       where: {
//         patient_id: req.user.id,
//         status: 'dispensed', // Already dispensed = eligible for refill
//       },
//     });

//     const formattedMeds = prescriptions.map((p) => ({
//       id: p.id,
//       prescriptionNumber: p.prescription_number,
//       diagnosis: p.diagnosis,
//       issueDate: p.issue_date,
//       expiryDate: p.expiry_date,
//       // items is a JSON array: [{drug_name, dosage, quantity, ...}]
//       items: p.items || [],
//       selected: false,
//     }));

//     return successResponse(res, {
//       instructions: 'Select the prescriptions you need refilled and choose your preferred pickup or delivery option.',
//       medications: formattedMeds,
//       selectedCount: 0,
//       summary: { subtotal: 0, deliveryFee: 150, total: 150 },
//     });
//   } catch (error) {
//     return errorResponse(res, error.message, 500, 'GET_REFILLABLE_ERROR');
//   }
// };

// // POST /prescriptions/select
// const selectMedication = async (req, res) => {
//   try {
//     const { prescriptionId, selected } = req.body;

//     const prescription = await Prescription.findOne({
//       where: { id: prescriptionId, patient_id: req.user.id },
//     });
//     if (!prescription) return errorResponse(res, 'Prescription not found', 404, 'NOT_FOUND');

//     // Calculate subtotal from items JSON
//     const subtotal = selected
//       ? (prescription.items || []).reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
//       : 0;

//     return successResponse(res, {
//       selectedCount: selected ? 1 : 0,
//       selectedItems: selected ? [{ id: prescription.id, prescriptionNumber: prescription.prescription_number, items: prescription.items }] : [],
//       summary: { subtotal, deliveryFee: 150, total: subtotal + 150 },
//     });
//   } catch (error) {
//     return errorResponse(res, error.message, 500, 'SELECT_MED_ERROR');
//   }
// };

// // POST /prescriptions/refill
// // Delegates to pharmacy backend — pharmacy backend creates the Order record
// const submitRefill = async (req, res) => {
//   try {
//     const { selectedPrescriptions, pharmacyId, fulfillmentType, pharmacistNotes, paymentMethod } = req.body;

//     if (!selectedPrescriptions || selectedPrescriptions.length === 0)
//       return errorResponse(res, 'No prescriptions selected', 400, 'NO_PRESCRIPTIONS');

//     // Verify all prescriptions belong to this patient
//     const prescriptions = await Prescription.findAll({
//       where: { id: { [Op.in]: selectedPrescriptions }, patient_id: req.user.id },
//     });

//     if (prescriptions.length === 0)
//       return errorResponse(res, 'No valid prescriptions found', 400, 'INVALID_PRESCRIPTIONS');

//     // Forward to pharmacy backend — pharmacy backend creates Order record
//     const result = await serviceClient('pharmacy', 'POST', '/orders/create', {
//       patientId: req.user.id,
//       patientName: req.user.full_name,
//       patientPhone: req.user.phone_number,
//       prescriptionIds: selectedPrescriptions,
//       pharmacyId,
//       fulfillmentType,
//       pharmacistNotes,
//       paymentMethod,
//     });

//     if (!result.success) {
//       return errorResponse(res, 'Pharmacy service is currently unavailable. Please try again later.', 503, 'PHARMACY_SERVICE_UNAVAILABLE');
//     }

//     return successResponse(res, result.data, 'Refill request submitted', 201);
//   } catch (error) {
//     return errorResponse(res, error.message, 500, 'SUBMIT_REFILL_ERROR');
//   }
// };

// // GET /medicines/search
// const searchMedicines = async (req, res) => {
//   try {
//     const { q } = req.query;

//     const prescriptions = await Prescription.findAll({
//       where: {
//         patient_id: req.user.id,
//         status: { [Op.in]: ['pending', 'validated', 'dispensed'] },
//       },
//       limit: 10,
//     });

//     // Search within items JSON array
//     const matchingItems = [];
//     prescriptions.forEach((p) => {
//       (p.items || []).forEach((item) => {
//         if (!q || item.name?.toLowerCase().includes(q.toLowerCase())) {
//           matchingItems.push({
//             prescriptionId: p.id,
//             name: item.name,
//             dosage: item.dosage,
//             frequency: item.frequency,
//             issueDate: p.issue_date,
//           });
//         }
//       });
//     });

//     return successResponse(res, {
//       query: q,
//       results: matchingItems.slice(0, 10),
//       manualAdd: { enabled: true, fields: ['medicineName', 'dosage', 'quantity'] },
//     });
//   } catch (error) {
//     return errorResponse(res, error.message, 500, 'SEARCH_MEDICINES_ERROR');
//   }
// };

// module.exports = {
//   getMedsDashboard,
//   getRefillableMeds,
//   selectMedication,
//   submitRefill,
//   searchMedicines,
// };


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

    // Fetch ONLY valid prescriptions:
    // - Status: dispensed or delivered
    // - Not expired (expiry_date >= today)
    // - Has items with quantity > 0
    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: user.id,
        status: { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: today }, // Not expired
      },
      include: [
        { model: User, as: 'doctor', attributes: ['id', 'full_name', 'specialty'] },
        { model: Pharmacy, attributes: ['id', 'name', 'phone'] },
      ],
      order: [['expiry_date', 'ASC']], // Most urgent first
    });

    // Filter out prescriptions with no items or zero quantity
    const validPrescriptions = prescriptions.filter((p) => {
      if (!p.items || p.items.length === 0) return false;
      // Check if ANY item has quantity left
      return p.items.some((item) => (item.quantity || 0) > 0);
    });

    // Count total active medications across all valid prescriptions
    let totalActiveMedications = 0;
    validPrescriptions.forEach((p) => {
      totalActiveMedications += p.items.length;
    });

    // Calculate adherence (can be enhanced later with actual tracking)
    const adherencePercentage = totalActiveMedications > 0 ? 75 : 0; // Mock data
    const completedDoses = Math.floor(totalActiveMedications * 0.75);

    return successResponse(res, {
      date: {
        day: dayNames[today.getDay()],
        date: today.getDate(),
      },
      greeting: `Good Morning, ${user.full_name.split(' ')[0]}.`,
      adherence: {
        percentage: adherencePercentage,
        completed: completedDoses,
        total: totalActiveMedications,
        message: `You are ${adherencePercentage}% done with today's meds.`,
      },
      quickOrder: {
        enabled: validPrescriptions.length > 0, // Only enable if there are valid prescriptions
        message: 'Tap to start making medicine order',
      },
      activePrescriptions: validPrescriptions.length,
      
      // ─── Active Prescriptions with details ───────────────────
      prescriptions: validPrescriptions.map((p) => {
        // Filter items with quantity > 0
        const activeItems = (p.items || []).filter((item) => (item.quantity || 0) > 0);
        
        return {
          id: p.id,
          prescriptionNumber: p.prescription_number,
          diagnosis: p.diagnosis,
          issueDate: p.issue_date,
          expiryDate: p.expiry_date,
          status: p.status,
          daysRemaining: calculateDaysRemaining(p.expiry_date),
          doctor: {
            name: p.doctor?.full_name,
            specialty: p.doctor?.specialty,
          },
          pharmacy: p.pharmacy ? {
            id: p.pharmacy.id,
            name: p.pharmacy.name,
            phone: p.pharmacy.phone,
          } : null,
          items: activeItems.map((item) => ({
            drugName: item.drug_name,
            dosage: item.dosage,
            quantity: item.quantity,
            frequency: item.frequency,
            instructions: item.instructions,
            route: item.route,
            warnings: item.warnings,
            unitPrice: item.unit_price,
            durationDays: item.duration_days,
            quantityPerDay: calculateQuantityPerDay(item.frequency, item.quantity),
          })),
        };
      }),

      // ─── Summary for refill urgency ──────────────────────────
      refillSummary: calculateRefillUrgency(validPrescriptions),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MEDS_DASHBOARD_ERROR');
  }
};

/**
 * Calculate days remaining until prescription expires
 */
function calculateDaysRemaining(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 ? daysLeft : 0;
}

/**
 * Calculate how many doses per day based on frequency
 * "Twice daily" → 2
 * "Once daily" → 1
 * "Every 8 hours" → 3
 */
function calculateQuantityPerDay(frequency) {
  if (!frequency) return 1;

  const freqLower = frequency.toLowerCase();

  if (freqLower.includes('once daily') || freqLower === 'daily') return 1;
  if (freqLower.includes('twice daily')) return 2;
  if (freqLower.includes('three times daily') || freqLower.includes('thrice daily')) return 3;
  if (freqLower.includes('four times daily')) return 4;
  if (freqLower.includes('every 4 hours')) return 6;
  if (freqLower.includes('every 6 hours')) return 4;
  if (freqLower.includes('every 8 hours')) return 3;
  if (freqLower.includes('every 12 hours')) return 2;

  return 1; // Default
}

/**
 * Calculate refill urgency based on quantity and consumption rate
 * Returns items that need refilling soon
 */
function calculateRefillUrgency(prescriptions) {
  const urgentItems = [];

  prescriptions.forEach((p) => {
    (p.items || []).forEach((item) => {
      if ((item.quantity || 0) <= 0) return; // Skip empty items

      const quantityPerDay = calculateQuantityPerDay(item.frequency);
      const daysLeft = Math.floor((item.quantity || 0) / quantityPerDay);

      // Flag if less than 3 days of medication left
      if (daysLeft <= 3) {
        urgentItems.push({
          prescriptionId: p.id,
          prescriptionNumber: p.prescription_number,
          drugName: item.drug_name,
          dosage: item.dosage,
          quantity: item.quantity,
          daysLeft: daysLeft,
          urgency: daysLeft === 0 ? 'critical' : daysLeft <= 1 ? 'high' : 'medium',
        });
      }
    });
  });

  return {
    hasUrgent: urgentItems.length > 0,
    count: urgentItems.length,
    items: urgentItems.sort((a, b) => a.daysLeft - b.daysLeft), // Most urgent first
  };
}

// GET /prescriptions/refillable
// Prescriptions that are dispensed and eligible for refill
const getRefillableMeds = async (req, res) => {
  try {
    const today = new Date();
    
    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
        status: { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: today }, // Not expired
      },
      include: [
        { model: User, as: 'doctor', attributes: ['id', 'full_name'] },
      ],
    });

    // Filter prescriptions with remaining quantity
    const refillableMeds = prescriptions
      .filter((p) => p.items && p.items.some((item) => (item.quantity || 0) > 0))
      .map((p) => ({
        id: p.id,
        prescriptionNumber: p.prescription_number,
        diagnosis: p.diagnosis,
        issueDate: p.issue_date,
        expiryDate: p.expiry_date,
        daysRemaining: calculateDaysRemaining(p.expiry_date),
        doctor: p.doctor?.full_name,
        items: (p.items || [])
          .filter((item) => (item.quantity || 0) > 0)
          .map((item) => ({
            drugName: item.drug_name,
            dosage: item.dosage,
            quantity: item.quantity,
            frequency: item.frequency,
            unitPrice: item.unit_price,
            quantityPerDay: calculateQuantityPerDay(item.frequency),
          })),
        selected: false,
      }));

    // Calculate total if all are selected
    const totalSubtotal = refillableMeds.reduce((sum, med) => {
      const medSubtotal = med.items.reduce((itemSum, item) => itemSum + (item.unitPrice || 0) * (item.quantity || 1), 0);
      return sum + medSubtotal;
    }, 0);

    return successResponse(res, {
      instructions: 'Select the prescriptions you need refilled and choose your preferred pickup or delivery option.',
      medications: refillableMeds,
      selectedCount: 0,
      summary: {
        subtotal: 0,
        deliveryFee: 150,
        total: 150,
      },
      maxPossibleSubtotal: totalSubtotal,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_REFILLABLE_ERROR');
  }
};

// POST /prescriptions/select
const selectMedication = async (req, res) => {
  try {
    const { prescriptionId, selected } = req.body;
    const today = new Date();

    const prescription = await Prescription.findOne({
      where: {
        id: prescriptionId,
        patient_id: req.user.id,
        status: { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: today }, // Not expired
      },
    });

    if (!prescription) {
      return errorResponse(res, 'Prescription not found or has expired', 404, 'NOT_FOUND');
    }

    // Only count items with quantity > 0
    const activeItems = (prescription.items || []).filter((item) => (item.quantity || 0) > 0);

    if (activeItems.length === 0) {
      return errorResponse(res, 'This prescription has no remaining medications', 400, 'NO_QUANTITY');
    }

    // Calculate subtotal from active items only
    const subtotal = selected
      ? activeItems.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0)
      : 0;

    return successResponse(res, {
      selectedCount: selected ? 1 : 0,
      selectedItems: selected
        ? [
            {
              id: prescription.id,
              prescriptionNumber: prescription.prescription_number,
              items: activeItems,
              subtotal: subtotal,
            },
          ]
        : [],
      summary: {
        subtotal,
        deliveryFee: 150,
        total: subtotal + 150,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SELECT_MED_ERROR');
  }
};

// POST /prescriptions/refill
// Delegates to pharmacy backend
const submitRefill = async (req, res) => {
  try {
    const { selectedPrescriptions, pharmacyId, fulfillmentType, pharmacistNotes, paymentMethod } = req.body;
    const today = new Date();

    if (!selectedPrescriptions || selectedPrescriptions.length === 0) {
      return errorResponse(res, 'No prescriptions selected', 400, 'NO_PRESCRIPTIONS');
    }

    // Verify all prescriptions are valid and not expired
    const prescriptions = await Prescription.findAll({
      where: {
        id: { [Op.in]: selectedPrescriptions },
        patient_id: req.user.id,
        status: { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: today },
      },
    });

    if (prescriptions.length === 0) {
      return errorResponse(res, 'No valid prescriptions found', 400, 'INVALID_PRESCRIPTIONS');
    }

    // Verify all selected prescriptions have remaining quantity
    const validPrescriptions = prescriptions.filter((p) =>
      p.items && p.items.some((item) => (item.quantity || 0) > 0)
    );

    if (validPrescriptions.length !== prescriptions.length) {
      return errorResponse(res, 'Some selected prescriptions have no remaining medications', 400, 'INSUFFICIENT_QUANTITY');
    }

    // Forward to pharmacy backend
    const result = await serviceClient('pharmacy', 'POST', '/orders/create', {
      patientId: req.user.id,
      patientName: req.user.full_name,
      patientPhone: req.user.phone_number,
      prescriptionIds: validPrescriptions.map((p) => p.id),
      pharmacyId,
      fulfillmentType,
      pharmacistNotes,
      paymentMethod,
    });

    if (!result.success) {
      return errorResponse(
        res,
        'Pharmacy service is currently unavailable. Please try again later.',
        503,
        'PHARMACY_SERVICE_UNAVAILABLE'
      );
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
    const today = new Date();

    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
        status: { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: today },
      },
      limit: 10,
    });

    const matchingItems = [];
    prescriptions.forEach((p) => {
      (p.items || [])
        .filter((item) => (item.quantity || 0) > 0) // Only active items
        .forEach((item) => {
          if (!q || item.drug_name?.toLowerCase().includes(q.toLowerCase())) {
            matchingItems.push({
              prescriptionId: p.id,
              drugName: item.drug_name,
              dosage: item.dosage,
              frequency: item.frequency,
              quantity: item.quantity,
              issueDate: p.issue_date,
              quantityPerDay: calculateQuantityPerDay(item.frequency),
            });
          }
        });
    });

    return successResponse(res, {
      query: q,
      results: matchingItems.slice(0, 10),
      manualAdd: {
        enabled: true,
        fields: ['medicineName', 'dosage', 'quantity'],
      },
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