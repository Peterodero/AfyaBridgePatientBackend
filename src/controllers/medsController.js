const { Op } = require('sequelize');
const { models: {PatientMedication, Prescription, User} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_CONFIG = {
  Morning:   { time: '08:00 AM', order: 0 },
  Afternoon: { time: '01:00 PM', order: 1 },
  Evening:   { time: '06:00 PM', order: 2 },
  Bedtime:   { time: '09:00 PM', order: 3 },
};

function timeToSlot(timeStr) {
  if (!timeStr) return 'Morning';
  const [h] = timeStr.split(':').map(Number);
  if (h >= 5  && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Bedtime';
}

function dosesPerDay(med) {
  if (med.times_per_day) return med.times_per_day;
  if (med.dosage_timing && med.dosage_timing.length) return med.dosage_timing.length;
  const f = (med.frequency || '').toLowerCase();
  if (f.includes('twice daily'))                         return 2;
  if (f.includes('three times') || f.includes('thrice')) return 3;
  if (f.includes('four times'))                          return 4;
  if (f.includes('every 6'))                             return 4;
  if (f.includes('every 8'))                             return 3;
  if (f.includes('every 12'))                            return 2;
  return 1;
}

function currentSlot() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Bedtime';
}

// Returns the slots a medication belongs to based on dosage_timing
// e.g. ["08:00","13:00"] → ["Morning","Afternoon"]
function getSlotsForMed(med) {
  if (med.dosage_timing && med.dosage_timing.length) {
    return [...new Set(med.dosage_timing.map(timeToSlot))];
  }
  // No timings — distribute by doses per day
  const count = dosesPerDay(med);
  const all   = ['Morning', 'Afternoon', 'Evening', 'Bedtime'];
  return all.slice(0, count);
}

// Recalculate adherence_percentage from daily_log across all days since start_date
function recalcAdherence(med, updatedLog) {
  const log = updatedLog || med.daily_log || {};
  const dates = Object.keys(log);
  if (!dates.length) return 0;

  let totalExpected = 0;
  let totalTaken    = 0;

  for (const date of dates) {
    const daySlots = log[date];
    for (const slotStatus of Object.values(daySlots)) {
      totalExpected++;
      if (slotStatus === 'taken') totalTaken++;
    }
  }

  return totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;
}

// ─── GET /meds/dashboard ──────────────────────────────────────────────────────
const getMedsDashboard = async (req, res) => {
  try {
    const user     = req.user;
    const today    = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const activeMeds = await PatientMedication.findAll({
      where: {
        patient_id: user.id,
        status:     'active',
        start_date: { [Op.lte]: todayStr },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: todayStr } }],
      },
    });

    // ── Ensure today's slots exist in daily_log for every med ────────────────
    // If a med has no entry for today yet, initialise all its slots as 'pending'
    for (const med of activeMeds) {
      const log = med.daily_log || {};
      if (!log[todayStr]) {
        const slots      = getSlotsForMed(med);
        log[todayStr]    = {};
        for (const slot of slots) log[todayStr][slot] = 'pending';
        await med.update({ daily_log: log });
      }
    }

    // ── Build slot map from daily_log ────────────────────────────────────────
    // slotMap: { Morning: { meds: [...], allTaken: bool }, ... }
    const slotMap = {};

    for (const med of activeMeds) {
      const log      = med.daily_log || {};
      const todayLog = log[todayStr] || {};
      const slots    = getSlotsForMed(med);

      for (const slotName of slots) {
        if (!slotMap[slotName]) slotMap[slotName] = { meds: [], allTaken: true };
        const doseStatus = todayLog[slotName] || 'pending';
        slotMap[slotName].meds.push({ med, doseStatus });
        if (doseStatus !== 'taken') slotMap[slotName].allTaken = false;
      }
    }

    // ── Adherence — sum across all meds for today ────────────────────────────
    let totalDoses = 0, takenDoses = 0;
    for (const { meds } of Object.values(slotMap)) {
      for (const { doseStatus } of meds) {
        totalDoses++;
        if (doseStatus === 'taken') takenDoses++;
      }
    }
    const adherencePct = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

    // ── Build time_slots array ───────────────────────────────────────────────
    const nowSlot  = currentSlot();
    const timeSlots = Object.keys(SLOT_CONFIG)
      .sort((a, b) => SLOT_CONFIG[a].order - SLOT_CONFIG[b].order)
      .filter(name => slotMap[name])
      .map(slotName => {
        const entry  = slotMap[slotName];
        const slotId = `${slotName.toLowerCase()}_${todayStr.replace(/-/g, '')}`;

        let slotStatus = 'upcoming';
        if (entry.allTaken) {
          slotStatus = 'taken';
        } else if (slotName === nowSlot) {
          slotStatus = 'now';
        } else if (SLOT_CONFIG[slotName].order < SLOT_CONFIG[nowSlot].order) {
          const anySkipped = entry.meds.some(m => m.doseStatus === 'skipped');
          slotStatus = anySkipped ? 'skipped' : 'pending';
        }

        return {
          slot_id:        slotId,
          slot_name:      slotName,
          scheduled_time: SLOT_CONFIG[slotName].time,
          slot_status:    slotStatus,
          medications: entry.meds.map(({ med, doseStatus }) => ({
            medication_id: med.id,
            name:          med.drug_name,
            dosage:        med.dosage,
            dosage_form:   med.dosage_form,
            instructions:  med.instructions,
            dose_status:   doseStatus,
          })),
        };
      });

    // ── Low-stock alerts ─────────────────────────────────────────────────────
    const alerts = [];
    for (const med of activeMeds) {
      const daily     = dosesPerDay(med);
      const remaining = med.quantity_remaining || 0;
      const daysLeft  = daily > 0 ? Math.floor(remaining / daily) : null;
      if (daysLeft !== null && daysLeft <= 3) {
        alerts.push({ type: 'low_stock', name: med.drug_name, days_left: daysLeft });
      }
    }

    // ── Days remaining on treatment ──────────────────────────────────────────
    let daysRemainingToTake = null, daysTotalDuration = null;
    const withEnd = activeMeds.filter(m => m.end_date);
    if (withEnd.length) {
      const furthest      = withEnd.sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];
      daysRemainingToTake = Math.max(0, Math.ceil((new Date(furthest.end_date) - today) / 86400000));
      daysTotalDuration   = furthest.duration_days || null;
    }

    return successResponse(res, {
      user_metadata: {
        user_name:    user.full_name.split(' ')[0],
        today_date:   todayStr,
        day_of_week:  dayNames[today.getDay()],
        days_remaining_to_take_medication:      daysRemainingToTake,
        days_total_duration_to_take_medication: daysTotalDuration,
      },
      adherence_summary: {
        percentage:  adherencePct,
        doses_taken: takenDoses,
        total_doses: totalDoses,
      },
      alerts,
      time_slots: timeSlots,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MEDS_DASHBOARD_ERROR');
  }
};

// ─── PATCH /meds/schedule/slot-update ────────────────────────────────────────
const bulkSlotUpdate = async (req, res) => {
  try {
    const { slot_id, status, action_timestamp } = req.body;

    if (!slot_id || !status)
      return errorResponse(res, 'slot_id and status are required', 400, 'MISSING_FIELDS');

    if (!['taken', 'skipped', 'snoozed', 'pending'].includes(status))
      return errorResponse(res, 'status must be taken, skipped, snoozed, or pending', 400, 'INVALID_STATUS');

    // Parse "morning_20260404" → slotName="Morning", date="2026-04-04"
    const parts = slot_id.match(/^([a-z]+)_(\d{4})(\d{2})(\d{2})$/i);
    if (!parts)
      return errorResponse(res, 'Invalid slot_id. Expected e.g. morning_20260404', 400, 'INVALID_SLOT_ID');

    const slotName      = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
    const scheduledDate = `${parts[2]}-${parts[3]}-${parts[4]}`;
    const actionTs      = action_timestamp ? new Date(action_timestamp) : new Date();

    // Find all active meds that belong to this slot
    const meds = await PatientMedication.findAll({
      where: {
        patient_id: req.user.id,
        status:     'active',
      },
    });

    const medsInSlot = meds.filter(med => getSlotsForMed(med).includes(slotName));

    if (!medsInSlot.length)
      return errorResponse(res, `No medications found for slot ${slot_id}`, 404, 'SLOT_NOT_FOUND');

    // Update daily_log[date][slot] on each med + decrement stock if taken
    await Promise.all(medsInSlot.map(async (med) => {
      const log = med.daily_log || {};
      if (!log[scheduledDate]) log[scheduledDate] = {};
      log[scheduledDate][slotName] = status;

      const newAdherence = recalcAdherence(med, log);

      const updates = {
        daily_log:            log,
        adherence_percentage: newAdherence,
      };

      if (status === 'taken') {
        updates.last_taken_at       = actionTs;
        updates.quantity_remaining  = Math.max(0, (med.quantity_remaining || 0) - 1);
      }

      await med.update(updates);
    }));

    // Adherence for today across ALL meds (for the response)
    const refreshed = await PatientMedication.findAll({
      where: { patient_id: req.user.id, status: 'active' },
      attributes: ['daily_log'],
    });

    let total = 0, taken = 0;
    for (const m of refreshed) {
      const todaySlots = (m.daily_log || {})[scheduledDate] || {};
      for (const s of Object.values(todaySlots)) {
        total++;
        if (s === 'taken') taken++;
      }
    }
    const newAdherencePct = total > 0 ? Math.round((taken / total) * 100) : 0;

    return successResponse(res, {
      slot_id,
      updated_status:           status,
      medications_updated:      medsInSlot.length,
      new_adherence_percentage: newAdherencePct,
      last_updated:             actionTs.toISOString(),
    }, `All ${slotName.toLowerCase()} medications marked as ${status}`);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SLOT_UPDATE_ERROR');
  }
};

// ─── GET /meds/inventory ──────────────────────────────────────────────────────
const getInventory = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const meds = await PatientMedication.findAll({
      where: {
        patient_id: req.user.id,
        status:     'active',
        start_date: { [Op.lte]: todayStr },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: todayStr } }],
      },
      attributes: ['id','drug_name','dosage','dosage_form','quantity_remaining',
                   'times_per_day','dosage_timing','frequency','next_refill_date',
                   'is_chronic','prescription_id'],
    });

    const inventory = meds.map(med => {
      const pillsPerDay = dosesPerDay(med);
      const remaining   = med.quantity_remaining || 0;
      const daysLeft    = pillsPerDay > 0 ? Math.floor(remaining / pillsPerDay) : null;
      return {
        medication_id:    med.id,
        name:             med.drug_name,
        dosage:           med.dosage,
        dosage_form:      med.dosage_form,
        stock_remaining:  remaining,
        pills_per_day:    pillsPerDay,
        days_left:        daysLeft,
        is_low_stock:     daysLeft !== null && daysLeft <= 3,
        next_refill_date: med.next_refill_date,
        is_chronic:       med.is_chronic,
        prescription_id:  med.prescription_id,
        unit:             'pills',
      };
    });

    return successResponse(res, {
      inventory,
      summary: {
        total:        inventory.length,
        low_stock:    inventory.filter(i => i.is_low_stock).length,
        needs_refill: inventory.filter(i => i.days_left !== null && i.days_left <= 5).length,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'INVENTORY_ERROR');
  }
};

// ─── POST /meds/inventory/refill ─────────────────────────────────────────────
const triggerRefill = async (req, res) => {
  try {
    const { medication_id, pharmacy_id, fulfillment_type, payment_method } = req.body;

    if (!medication_id)
      return errorResponse(res, 'medication_id is required', 400, 'MISSING_FIELD');

    const med = await PatientMedication.findOne({
      where: { id: medication_id, patient_id: req.user.id, status: 'active' },
    });
    if (!med) return errorResponse(res, 'Medication not found or inactive', 404, 'NOT_FOUND');

    if (med.prescription_id) {
      const result = await serviceClient('pharmacy', 'POST', '/orders/create', {
        patientId:       req.user.id,
        patientName:     req.user.full_name,
        patientPhone:    req.user.phone_number,
        prescriptionIds: [med.prescription_id],
        pharmacyId:      pharmacy_id || med.pharmacy_id,
        fulfillmentType: fulfillment_type || 'home_delivery',
        paymentMethod:   payment_method  || 'mpesa',
        refill:          true,
        medicationId:    medication_id,
      });

      if (!result.success)
        return errorResponse(res, 'Pharmacy service unavailable. Please try again later.', 503, 'PHARMACY_SERVICE_UNAVAILABLE');

      return successResponse(res, {
        medication_id,
        drug_name:    med.drug_name,
        refill_order: result.data,
      }, `Refill for ${med.drug_name} submitted`, 201);
    }

    // OTC — no prescription linked
    return successResponse(res, {
      medication_id,
      drug_name: med.drug_name,
      is_otc:    med.is_otc,
      action:    'visit_pharmacy',
      message:   `${med.drug_name} is over-the-counter. Visit a nearby pharmacy to refill.`,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'REFILL_ERROR');
  }
};

// ─── Existing prescription-based endpoints ────────────────────────────────────

const getRefillableMeds = async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: {
        patient_id:  req.user.id,
        status:      { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: new Date() },
      },
      include: [{ model: User, as: 'doctor', attributes: ['id', 'full_name'] }],
    });

    const meds = prescriptions
      .filter(p => p.items && p.items.some(i => (i.quantity || 0) > 0))
      .map(p => ({
        id:                 p.id,
        prescriptionNumber: p.prescription_number,
        diagnosis:          p.diagnosis,
        issueDate:          p.issue_date,
        expiryDate:         p.expiry_date,
        doctor:             p.doctor?.full_name,
        items: (p.items || []).filter(i => (i.quantity || 0) > 0).map(i => ({
          drugName:  i.drug_name,
          dosage:    i.dosage,
          quantity:  i.quantity,
          frequency: i.frequency,
          unitPrice: i.unit_price,
        })),
        selected: false,
      }));

    return successResponse(res, {
      instructions:  'Select the prescriptions you need refilled.',
      medications:   meds,
      selectedCount: 0,
      summary:       { subtotal: 0, deliveryFee: 150, total: 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_REFILLABLE_ERROR');
  }
};

const selectMedication = async (req, res) => {
  try {
    const { prescriptionId, selected } = req.body;
    const prescription = await Prescription.findOne({
      where: {
        id:          prescriptionId,
        patient_id:  req.user.id,
        status:      { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: new Date() },
      },
    });
    if (!prescription)
      return errorResponse(res, 'Prescription not found or expired', 404, 'NOT_FOUND');

    const active = (prescription.items || []).filter(i => (i.quantity || 0) > 0);
    if (!active.length)
      return errorResponse(res, 'No remaining medications', 400, 'NO_QUANTITY');

    const subtotal = selected
      ? active.reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 1), 0)
      : 0;

    return successResponse(res, {
      selectedCount: selected ? 1 : 0,
      selectedItems: selected
        ? [{ id: prescription.id, prescriptionNumber: prescription.prescription_number, items: active, subtotal }]
        : [],
      summary: { subtotal, deliveryFee: 150, total: subtotal + 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SELECT_MED_ERROR');
  }
};

const submitRefill = async (req, res) => {
  try {
    const { selectedPrescriptions, pharmacyId, fulfillmentType, paymentMethod } = req.body;
    if (!selectedPrescriptions?.length)
      return errorResponse(res, 'No prescriptions selected', 400, 'NO_PRESCRIPTIONS');

    const prescriptions = await Prescription.findAll({
      where: {
        id:          { [Op.in]: selectedPrescriptions },
        patient_id:  req.user.id,
        status:      { [Op.in]: ['dispensed', 'delivered'] },
        expiry_date: { [Op.gte]: new Date() },
      },
    });
    if (!prescriptions.length)
      return errorResponse(res, 'No valid prescriptions', 400, 'INVALID_PRESCRIPTIONS');

    const result = await serviceClient('pharmacy', 'POST', '/orders/create', {
      patientId:       req.user.id,
      patientName:     req.user.full_name,
      patientPhone:    req.user.phone_number,
      prescriptionIds: prescriptions.map(p => p.id),
      pharmacyId,
      fulfillmentType,
      paymentMethod,
    });
    if (!result.success)
      return errorResponse(res, 'Pharmacy service unavailable.', 503, 'PHARMACY_SERVICE_UNAVAILABLE');

    return successResponse(res, result.data, 'Refill request submitted', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SUBMIT_REFILL_ERROR');
  }
};

const searchMedicines = async (req, res) => {
  try {
    const { q } = req.query;
    const todayStr = new Date().toISOString().split('T')[0];

    const meds = await PatientMedication.findAll({
      where: {
        patient_id: req.user.id,
        status:     'active',
        ...(q ? { drug_name: { [Op.like]: `%${q}%` } } : {}),
        start_date: { [Op.lte]: todayStr },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: todayStr } }],
      },
      limit:      10,
      attributes: ['id','drug_name','dosage','dosage_form','frequency','quantity_remaining'],
    });

    return successResponse(res, {
      query:   q || null,
      results: meds.map(m => ({
        medication_id: m.id,
        drug_name:     m.drug_name,
        dosage:        m.dosage,
        dosage_form:   m.dosage_form,
        frequency:     m.frequency,
        stock:         m.quantity_remaining,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_MEDICINES_ERROR');
  }
};

module.exports = {
  getMedsDashboard,
  bulkSlotUpdate,
  getInventory,
  triggerRefill,
  getRefillableMeds,
  selectMedication,
  submitRefill,
  searchMedicines,
};