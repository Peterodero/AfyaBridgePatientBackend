const { sequelize } = require('../config/database');
const { Op } = require("sequelize");
const {
  models: { PatientMedication, Prescription, Order, User,Drug },
} = require("../models/index.js");
const { successResponse, errorResponse } = require("../utils/response");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_CONFIG = {
  Morning: { time: "08:00 AM", order: 0 },
  Afternoon: { time: "01:00 PM", order: 1 },
  Evening: { time: "06:00 PM", order: 2 },
  Bedtime: { time: "09:00 PM", order: 3 },
};

const ALL_SLOTS = ["Morning", "Afternoon", "Evening", "Bedtime"];

function timeToSlot(timeStr) {
  if (!timeStr) return "Morning";
  const [h] = timeStr.split(":").map(Number);
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 21) return "Evening";
  return "Bedtime";
}

function dosesPerDay(med) {
  if (med.times_per_day) return med.times_per_day;
  if (med.dosage_timing && med.dosage_timing.length)
    return med.dosage_timing.length;
  const f = (med.frequency || "").toLowerCase();
  if (f.includes("twice daily")) return 2;
  if (f.includes("three times") || f.includes("thrice")) return 3;
  if (f.includes("four times")) return 4;
  if (f.includes("every 6")) return 4;
  if (f.includes("every 8")) return 3;
  if (f.includes("every 12")) return 2;
  return 1;
}

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function getEATDate() {
  return new Date(Date.now() + EAT_OFFSET_MS);
}

function currentSlot() {
  const h = getEATDate().getUTCHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 21) return "Evening";
  return "Bedtime";
}

function getTodayLocal() {
  const eat = getEATDate();
  const year = eat.getUTCFullYear();
  const month = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const day = String(eat.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSlotsForMed(med) {
  if (med.dosage_timing && med.dosage_timing.length) {
    return [...new Set(med.dosage_timing.map(timeToSlot))];
  }
  const count = dosesPerDay(med);
  return ALL_SLOTS.slice(0, count);
}

// Recalculate adherence_percentage from daily_log across all days
function recalcAdherence(med, updatedLog) {
  const log = updatedLog || med.daily_log || {};
  const today = getTodayLocal();
  const startDate = med.start_date;

  const dates = Object.keys(log).filter((date) => {
    return date >= startDate && date <= today;
  });

  if (!dates.length) return 0;

  let totalExpected = 0;
  let totalTaken = 0;

  for (const date of dates) {
    const daySlots = log[date];
    for (const slotStatus of Object.values(daySlots)) {
      totalExpected++;
      if (slotStatus === "taken") totalTaken++;
    }
  }

  return totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;
}

// ─── GET /meds/dashboard ──────────────────────────────────────────────────────
const getMedsDashboard = async (req, res) => {
  try {
    const user = req.user;
    const today = getEATDate();
    const todayStr = getTodayLocal();
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayOfWeek = dayNames[today.getDay()];

    const activeMeds = await PatientMedication.findAll({
      where: {
        patient_id: user.id,
        status: "active",
        start_date: { [Op.lte]: todayStr },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: todayStr } }],
      },
    });

    // ── Ensure today's slots exist and NORMALIZE any mixed statuses ─────────
    for (const med of activeMeds) {
      const log =
        typeof med.daily_log === "string"
          ? JSON.parse(med.daily_log || "{}")
          : med.daily_log || {};

      if (!log[todayStr]) {
        const slots = getSlotsForMed(med);
        log[todayStr] = {};
        for (const slot of slots) log[todayStr][slot] = "pending";
        await med.update({ daily_log: log });
        med.daily_log = log;
      } else {
        med.daily_log = log;
      }
    }

    // ── NORMALIZE: Ensure all medications in same slot have same status ─────
    const slotNormalization = {};

    for (const med of activeMeds) {
      const log = med.daily_log || {};
      const slots = getSlotsForMed(med);

      for (const slotName of slots) {
        const status = log[todayStr]?.[slotName] || "pending";
        const key = `${todayStr}_${slotName}`;

        if (!slotNormalization[key]) {
          slotNormalization[key] = {};
        }

        if (status === "taken") slotNormalization[key].hasTaken = true;
        if (status === "skipped") slotNormalization[key].hasSkipped = true;
        slotNormalization[key][med.id] = status;
      }
    }

    for (const med of activeMeds) {
      const log = med.daily_log || {};
      let needsUpdate = false;

      const slots = getSlotsForMed(med);
      for (const slotName of slots) {
        const key = `${todayStr}_${slotName}`;
        const slotData = slotNormalization[key];

        if (slotData) {
          let newStatus = "pending";
          if (slotData.hasTaken) newStatus = "taken";
          else if (slotData.hasSkipped) newStatus = "skipped";

          const currentStatus = log[todayStr]?.[slotName] || "pending";
          if (currentStatus !== newStatus) {
            if (!log[todayStr]) log[todayStr] = {};
            log[todayStr][slotName] = newStatus;
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        await med.update({ daily_log: log });
        med.daily_log = log;
      }
    }

    // ── Build slot map from daily_log ────────────────────────────────────────
    const slotMap = {};

    for (const med of activeMeds) {
      const log = med.daily_log || {};
      const todayLog = log[todayStr] || {};
      const slots = getSlotsForMed(med);

      for (const slotName of slots) {
        if (!slotMap[slotName]) {
          slotMap[slotName] = { meds: [], allTaken: true, anySkipped: false };
        }
        const doseStatus = todayLog[slotName] || "pending";
        slotMap[slotName].meds.push({ med, doseStatus });
        if (doseStatus !== "taken") slotMap[slotName].allTaken = false;
        if (doseStatus === "skipped") slotMap[slotName].anySkipped = true;
      }
    }

    // ── Adherence Calculation: BOTH Option A AND Option B ────────────────────

    // Option A: Per-dose adherence (individual pill counting)
    let totalDoses = 0,
      takenDoses = 0;

    for (const med of activeMeds) {
      const log = med.daily_log || {};
      const startDate = med.start_date;

      for (const [date, slots] of Object.entries(log)) {
        if (date >= startDate && date <= todayStr) {
          for (const slotStatus of Object.values(slots)) {
            totalDoses++;
            if (slotStatus === "taken") takenDoses++;
          }
        }
      }
    }

    const doseAdherencePct =
      totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

    // Option B: Per-slot adherence (ALL or NOTHING approach)
    const slotCompletion = {};

    for (const med of activeMeds) {
      const log = med.daily_log || {};
      const startDate = med.start_date;
      const slotsForMed = getSlotsForMed(med);

      for (const [date, daySlots] of Object.entries(log)) {
        if (date >= startDate && date <= todayStr) {
          for (const slotName of slotsForMed) {
            const key = `${date}_${slotName}`;
            if (!slotCompletion[key]) {
              slotCompletion[key] = {
                date,
                slotName,
                totalMeds: 0,
                takenMeds: 0,
              };
            }

            slotCompletion[key].totalMeds++;
            if (daySlots[slotName] === "taken") {
              slotCompletion[key].takenMeds++;
            }
          }
        }
      }
    }

    let totalSlots = 0;
    let completedSlots = 0;

    for (const slot of Object.values(slotCompletion)) {
      totalSlots++;
      if (slot.takenMeds === slot.totalMeds) {
        completedSlots++;
      }
    }

    const slotAdherencePct =
      totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;

    // ── Build time_slots array ───────────────────────────────────────────────
    const nowSlot = currentSlot();
    const timeSlots = Object.keys(SLOT_CONFIG)
      .sort((a, b) => SLOT_CONFIG[a].order - SLOT_CONFIG[b].order)
      .filter((name) => slotMap[name])
      .map((slotName) => {
        const entry = slotMap[slotName];
        const slotId = `${slotName.toLowerCase()}_${todayStr.replace(/-/g, "")}`;

        let slotStatus = "upcoming";

        if (entry.allTaken) {
          slotStatus = "taken";
        } else if (slotName === nowSlot) {
          slotStatus = "now";
        } else if (SLOT_CONFIG[slotName].order < SLOT_CONFIG[nowSlot].order) {
          slotStatus = entry.anySkipped ? "skipped" : "upcoming";
        }

        return {
          slot_id: slotId,
          slot_name: slotName,
          scheduled_time: SLOT_CONFIG[slotName].time,
          slot_status: slotStatus,
          medications: entry.meds.map(({ med, doseStatus }) => ({
            medication_id: med.id,
            name: med.drug_name,
            dosage: med.dosage,
            dosage_form: med.dosage_form,
            instructions: med.instructions,
            dose_status: doseStatus,
          })),
        };
      });

    // ── Low-stock alerts ─────────────────────────────────────────────────────
    const alerts = [];
    for (const med of activeMeds) {
      const daily = dosesPerDay(med);
      const remaining = med.quantity_remaining || 0;
      const daysLeft = daily > 0 ? Math.floor(remaining / daily) : null;
      if (daysLeft !== null && daysLeft <= 3) {
        alerts.push({
          type: "low_stock",
          name: med.drug_name,
          days_left: daysLeft,
        });
      }
    }

    // ── Days remaining on treatment ──────────────────────────────────────────
    let daysRemainingToTake = null,
      daysTotalDuration = null;
    const withEnd = activeMeds.filter((m) => m.end_date);
    if (withEnd.length) {
      const furthest = withEnd.sort(
        (a, b) => new Date(b.end_date) - new Date(a.end_date),
      )[0];
      daysRemainingToTake = Math.max(
        0,
        Math.ceil((new Date(furthest.end_date) - today) / 86400000),
      );
      daysTotalDuration = furthest.duration_days || null;
    }

    return successResponse(res, {
      user_metadata: {
        user_name: user.full_name.split(" ")[0],
        today_date: todayStr,
        day_of_week: dayOfWeek,
        days_remaining_to_take_medication: daysRemainingToTake,
        days_total_duration_to_take_medication: daysTotalDuration,
      },
      adherence_summary: {
        dose_adherence: {
          percentage: doseAdherencePct,
          doses_taken: takenDoses,
          total_doses: totalDoses,
        },
        slot_adherence: {
          percentage: slotAdherencePct,
          slots_completed: completedSlots,
          total_slots: totalSlots,
        },
      },
      alerts,
      time_slots: timeSlots,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "MEDS_DASHBOARD_ERROR");
  }
};

// ─── PATCH /meds/schedule/slot-update ────────────────────────────────────────
const bulkSlotUpdate = async (req, res) => {
  try {
    const { slot_id, status } = req.body;

    if (!slot_id || !status)
      return errorResponse(
        res,
        "slot_id and status are required",
        400,
        "MISSING_FIELDS",
      );

    if (!["taken", "skipped", "snoozed", "pending"].includes(status))
      return errorResponse(
        res,
        "status must be taken, skipped, snoozed, or pending",
        400,
        "INVALID_STATUS",
      );

    const parts = slot_id.match(/^([a-z]+)_(\d{4})(\d{2})(\d{2})$/i);
    if (!parts)
      return errorResponse(
        res,
        "Invalid slot_id. Expected e.g. morning_20260405",
        400,
        "INVALID_SLOT_ID",
      );

    const slotName =
      parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
    const scheduledDate = `${parts[2]}-${parts[3]}-${parts[4]}`;
    const actionTs = new Date();

    const meds = await PatientMedication.findAll({
      where: {
        patient_id: req.user.id,
        status: "active",
      },
    });

    const medsInSlot = meds.filter((med) =>
      getSlotsForMed(med).includes(slotName),
    );

    if (!medsInSlot.length)
      return errorResponse(
        res,
        `No medications found for slot ${slot_id}`,
        404,
        "SLOT_NOT_FOUND",
      );

    const updateResults = [];
    for (const med of medsInSlot) {
      let log;
      if (typeof med.daily_log === "string") {
        log = JSON.parse(med.daily_log || "{}");
      } else if (med.daily_log && typeof med.daily_log === "object") {
        log = JSON.parse(JSON.stringify(med.daily_log));
      } else {
        log = {};
      }

      if (!log[scheduledDate]) {
        log[scheduledDate] = {};
      }

      log[scheduledDate][slotName] = status;

      const updates = {
        daily_log: log,
      };

      const newAdherence = recalcAdherence(med, log);
      updates.adherence_percentage = newAdherence;

      if (status === "taken") {
        updates.last_taken_at = actionTs;
        const newQuantity = Math.max(0, (med.quantity_remaining || 0) - 1);
        updates.quantity_remaining = newQuantity;
      }

      await med.update(updates);

      updateResults.push({
        id: med.id,
        name: med.drug_name,
        status: status,
      });
    }

    return successResponse(
      res,
      {
        slot_id,
        updated_status: status,
        medications_updated: medsInSlot.length,
        update_details: updateResults,
        last_updated: actionTs.toISOString(),
      },
      `All ${slotName.toLowerCase()} medications marked as ${status}`,
    );
  } catch (error) {
    console.error("Slot update error:", error);
    return errorResponse(res, error.message, 500, "SLOT_UPDATE_ERROR");
  }
};

// ─── GET /meds/inventory ──────────────────────────────────────────────────────
const getInventory = async (req, res) => {
  try {
    const todayStr = getTodayLocal();

    const meds = await PatientMedication.findAll({
      where: {
        patient_id: req.user.id,
        status: "active",
        start_date: { [Op.lte]: todayStr },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: todayStr } }],
      },
      attributes: [
        "id",
        "drug_name",
        "dosage",
        "dosage_form",
        "quantity_remaining",
        "times_per_day",
        "dosage_timing",
        "frequency",
        "next_refill_date",
        "is_chronic",
        "prescription_id",
        "refills_allowed",
        "refills_used",
        "quantity_dispensed",
      ],
    });

    const inventory = meds.map((med) => {
      const pillsPerDay = dosesPerDay(med);
      const remaining = med.quantity_remaining || 0;
      const daysLeft =
        pillsPerDay > 0 ? Math.floor(remaining / pillsPerDay) : null;
      return {
        medication_id: med.id,
        name: med.drug_name,
        dosage: med.dosage,
        dosage_form: med.dosage_form,
        stock_remaining: remaining,
        pills_per_day: pillsPerDay,
        days_left: daysLeft,
        is_low_stock: daysLeft !== null && daysLeft <= 3,
        next_refill_date: med.next_refill_date,
        is_chronic: med.is_chronic,
        prescription_id: med.prescription_id,
        refills_remaining: med.refills_allowed ? med.refills_allowed - (med.refills_used || 0) : null,
        unit: "pills",
      };
    });

    return successResponse(res, {
      inventory,
      summary: {
        total: inventory.length,
        low_stock: inventory.filter((i) => i.is_low_stock).length,
        needs_refill: inventory.filter(
          (i) => i.days_left !== null && i.days_left <= 5,
        ).length,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "INVENTORY_ERROR");
  }
};

// ─── POST /meds/inventory/refill ─────────────────────────────────────────────
const triggerRefill = async (req, res) => {
  try {
    const { medication_id, pharmacy_id, fulfillment_type, payment_method } = req.body;

    if (!medication_id)
      return errorResponse(res, "medication_id is required", 400, "MISSING_FIELD");

    const med = await PatientMedication.findOne({
      where: { id: medication_id, patient_id: req.user.id, status: "active" },
    });
    
    if (!med)
      return errorResponse(res, "Medication not found or inactive", 404, "NOT_FOUND");

    // Check if refills are available
    if (med.refills_allowed !== null && med.refills_allowed > 0 && med.refills_used >= med.refills_allowed) {
      return errorResponse(res, "No refills remaining for this medication", 400, "NO_REFILLS_LEFT");
    }

    if (med.prescription_id) {
      const order = await Order.create({
        order_number: `ORD-${Date.now()}`,
        prescription_id: med.prescription_id,
        pharmacy_id: pharmacy_id || med.pharmacy_id,
        patient_id: req.user.id,
        patient_name: req.user.full_name,
        patient_phone: req.user.phone_number,
        patient_address: req.user.address,
        delivery_type: fulfillment_type || "home_delivery",
        payment_method: payment_method || "mpesa",
        status: "pending",
        payment_status: "unpaid",
      });

      // Increment refills used
      const newRefillsUsed = (med.refills_used || 0) + 1;
      await med.update({ 
        refills_used: newRefillsUsed,
        quantity_remaining: med.quantity_dispensed || med.quantity_remaining
      });

      return successResponse(res, {
        medication_id,
        drug_name: med.drug_name,
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        refills_remaining: med.refills_allowed ? med.refills_allowed - newRefillsUsed : null,
      }, `Refill for ${med.drug_name} submitted`, 201);
    }

    return successResponse(res, {
      medication_id,
      drug_name: med.drug_name,
      is_otc: med.is_otc,
      action: "visit_pharmacy",
      message: `${med.drug_name} is over-the-counter. Visit a nearby pharmacy to refill.`,
    });
  } catch (error) {
    console.error("Refill error:", error);
    return errorResponse(res, error.message, 500, "REFILL_ERROR");
  }
};

// ─── POST /meds/inventory/refill-bulk ─────────────────────────────────────────
const bulkRefill = async (req, res) => {
  try {
    const { medication_ids, pharmacy_id, fulfillment_type, payment_method } = req.body;

    if (!medication_ids || !medication_ids.length) {
      return errorResponse(res, 'medication_ids array is required', 400, 'MISSING_FIELD');
    }

    const results = [];
    const errors = [];

    for (const medication_id of medication_ids) {
      try {
        const med = await PatientMedication.findOne({
          where: { id: medication_id, patient_id: req.user.id, status: "active" },
        });

        if (!med) {
          errors.push({ medication_id, error: "Medication not found or inactive" });
          continue;
        }

        // Check if refills are available
        if (med.refills_allowed !== null && med.refills_allowed > 0 && med.refills_used >= med.refills_allowed) {
          errors.push({ medication_id, drug_name: med.drug_name, error: "No refills remaining" });
          continue;
        }

        if (med.prescription_id) {
          const order = await Order.create({
            order_number: `ORD-${Date.now()}-${medication_id.slice(0, 4)}`,
            prescription_id: med.prescription_id,
            pharmacy_id: pharmacy_id || med.pharmacy_id,
            patient_id: req.user.id,
            patient_name: req.user.full_name,
            patient_phone: req.user.phone_number,
            patient_address: req.user.address,
            delivery_type: fulfillment_type || "home_delivery",
            payment_method: payment_method || "mpesa",
            status: "pending",
            payment_status: "unpaid",
          });

          await med.update({ 
            refills_used: (med.refills_used || 0) + 1,
            quantity_remaining: med.quantity_dispensed || med.quantity_remaining
          });

          results.push({
            medication_id,
            drug_name: med.drug_name,
            order_id: order.id,
            order_number: order.order_number,
            status: order.status,
          });
        } else {
          results.push({
            medication_id,
            drug_name: med.drug_name,
            is_otc: med.is_otc,
            action: "visit_pharmacy",
            message: `${med.drug_name} is over-the-counter. Visit a nearby pharmacy to refill.`,
          });
        }
      } catch (err) {
        errors.push({ medication_id, error: err.message });
      }
    }

    return successResponse(res, {
      summary: {
        total_requested: medication_ids.length,
        successful: results.length,
        failed: errors.length,
      },
      results,
      errors: errors.length ? errors : undefined,
    }, `${results.length} of ${medication_ids.length} medications processed successfully`);

  } catch (error) {
    console.error("Bulk refill error:", error);
    return errorResponse(res, error.message, 500, "BULK_REFILL_ERROR");
  }
};

// ─── Existing prescription-based endpoints ────────────────────────────────────

const getRefillableMeds = async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
        status: { [Op.in]: ["dispensed", "delivered"] },
        expiry_date: { [Op.gte]: new Date() },
      },
      include: [{ model: User, as: "doctor", attributes: ["id", "full_name"] }],
    });

    const meds = prescriptions
      .filter((p) => p.items && p.items.some((i) => (i.quantity || 0) > 0))
      .map((p) => ({
        id: p.id,
        prescriptionNumber: p.prescription_number,
        diagnosis: p.diagnosis,
        issueDate: p.issue_date,
        expiryDate: p.expiry_date,
        doctor: p.doctor?.full_name,
        items: (p.items || [])
          .filter((i) => (i.quantity || 0) > 0)
          .map((i) => ({
            drugName: i.drug_name,
            dosage: i.dosage,
            quantity: i.quantity,
            frequency: i.frequency,
            unitPrice: i.unit_price,
          })),
        selected: false,
      }));

    return successResponse(res, {
      instructions: "Select the prescriptions you need refilled.",
      medications: meds,
      selectedCount: 0,
      summary: { subtotal: 0, deliveryFee: 150, total: 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_REFILLABLE_ERROR");
  }
};

const selectMedication = async (req, res) => {
  try {
    const { prescriptionId, selected } = req.body;
    const prescription = await Prescription.findOne({
      where: {
        id: prescriptionId,
        patient_id: req.user.id,
        status: { [Op.in]: ["dispensed", "delivered"] },
        expiry_date: { [Op.gte]: new Date() },
      },
    });
    if (!prescription)
      return errorResponse(
        res,
        "Prescription not found or expired",
        404,
        "NOT_FOUND",
      );

    const active = (prescription.items || []).filter(
      (i) => (i.quantity || 0) > 0,
    );
    if (!active.length)
      return errorResponse(res, "No remaining medications", 400, "NO_QUANTITY");

    const subtotal = selected
      ? active.reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 1), 0)
      : 0;

    return successResponse(res, {
      selectedCount: selected ? 1 : 0,
      selectedItems: selected
        ? [
            {
              id: prescription.id,
              prescriptionNumber: prescription.prescription_number,
              items: active,
              subtotal,
            },
          ]
        : [],
      summary: { subtotal, deliveryFee: 150, total: subtotal + 150 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "SELECT_MED_ERROR");
  }
};

const submitRefill = async (req, res) => {
  try {
    const {
      selectedPrescriptions,
      pharmacyId,
      fulfillmentType,
      paymentMethod,
    } = req.body;
    if (!selectedPrescriptions?.length)
      return errorResponse(
        res,
        "No prescriptions selected",
        400,
        "NO_PRESCRIPTIONS",
      );

    const prescriptions = await Prescription.findAll({
      where: {
        id: { [Op.in]: selectedPrescriptions },
        patient_id: req.user.id,
        status: { [Op.in]: ["dispensed", "delivered"] },
        expiry_date: { [Op.gte]: new Date() },
      },
    });
    if (!prescriptions.length)
      return errorResponse(
        res,
        "No valid prescriptions",
        400,
        "INVALID_PRESCRIPTIONS",
      );

    const orders = await Promise.all(
      prescriptions.map((p) =>
        Order.create({
          order_number: `ORD-${Date.now()}-${p.id.slice(0, 4)}`,
          prescription_id: p.id,
          pharmacy_id: pharmacyId,
          patient_id: req.user.id,
          patient_name: req.user.full_name,
          patient_phone: req.user.phone_number,
          delivery_type: fulfillmentType || "home_delivery",
          payment_method: paymentMethod || "mpesa",
          status: "pending",
          payment_status: "unpaid",
        }),
      ),
    );

    return successResponse(
      res,
      {
        orders: orders.map((o) => ({
          order_id: o.id,
          order_number: o.order_number,
          status: o.status,
        })),
      },
      "Refill request submitted",
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "SUBMIT_REFILL_ERROR");
  }
};

const searchMedicines = async (req, res) => {
  try {
    const { q } = req.query;
    const todayStr = getTodayLocal();

    const meds = await PatientMedication.findAll({
      where: {
        patient_id: req.user.id,
        status: "active",
        ...(q ? { drug_name: { [Op.like]: `%${q}%` } } : {}),
        start_date: { [Op.lte]: todayStr },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: todayStr } }],
      },
      limit: 10,
      attributes: [
        "id",
        "drug_name",
        "dosage",
        "dosage_form",
        "frequency",
        "quantity_remaining",
      ],
    });

    return successResponse(res, {
      query: q || null,
      results: meds.map((m) => ({
        medication_id: m.id,
        drug_name: m.drug_name,
        dosage: m.dosage,
        dosage_form: m.dosage_form,
        frequency: m.frequency,
        stock: m.quantity_remaining,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "SEARCH_MEDICINES_ERROR");
  }
};

// ─── GET /meds/prescriptions ──────────────────────────────────────────────
const getMyPrescriptions = async (req, res) => {
  try {
    const { pharmacy_id } = req.query; // Optional pharmacy_id for pricing
    const todayStr = getTodayLocal();

    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
      },
      include: [
        {
          model: User,
          as: "doctor",
          attributes: ["id", "full_name", "specialty"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    // If pharmacy_id provided, fetch drug prices for that pharmacy
    let drugPriceMap = new Map(); // key: drug_name, value: unit_price
    if (pharmacy_id) {
      // Collect all unique drug names from all prescriptions
      const drugNames = new Set();
      for (const p of prescriptions) {
        for (const item of p.items || []) {
          if (item.name) drugNames.add(item.name);
        }
      }

      if (drugNames.size > 0) {
        const drugs = await Drug.findAll({
          where: {
            pharmacy_id: pharmacy_id,
            drug_name: { [Op.in]: Array.from(drugNames) },
            is_active: true,
          },
          attributes: ["drug_name", "unit_price"],
        });
        for (const drug of drugs) {
          drugPriceMap.set(drug.drug_name, parseFloat(drug.unit_price));
        }
      }
    }

    const formattedPrescriptions = prescriptions.map((p) => {
      const itemsWithPrices = (p.items || []).map((item) => {
        let unit_price = null;
        let total_price = null;

        if (pharmacy_id) {
          unit_price = drugPriceMap.get(item.name) || 0;
          total_price = unit_price * (item.quantity || 0);
        }

        return {
          drug_name: item.name,
          dosage: item.dosage,
          dosage_form: item.dosage_form,
          quantity: item.quantity,
          unit_price: unit_price,
          total_price: total_price,
          instructions: item.instructions,
          frequency: item.frequency,
          duration: item.duration,
        };
      });

      // Calculate total amount for the prescription if pharmacy selected
      let total_amount = 0;
      if (pharmacy_id) {
        total_amount = itemsWithPrices.reduce(
          (sum, item) => sum + (item.total_price || 0),
          0
        );
      }

      return {
        id: p.id,
        prescription_number: p.prescription_number,
        issue_date: p.issue_date,
        expiry_date: p.expiry_date,
        diagnosis: p.diagnosis,
        doctor_name: p.doctor?.full_name,
        doctor_specialization: p.doctor?.specialty,
        status: p.status,
        items: itemsWithPrices,
        total_amount: total_amount,
        is_refillable: ["dispensed", "delivered"].includes(p.status) && 
                       (p.items || []).some(item => (item.quantity || 0) > 0),
        is_expired: p.expiry_date && p.expiry_date < todayStr,
      };
    });

    // Summary statistics
    const summary = {
      total: formattedPrescriptions.length,
      pending: formattedPrescriptions.filter(p => p.status === 'pending').length,
      dispensed: formattedPrescriptions.filter(p => p.status === 'dispensed').length,
      delivered: formattedPrescriptions.filter(p => p.status === 'delivered').length,
      expired: formattedPrescriptions.filter(p => p.is_expired).length,
      refillable: formattedPrescriptions.filter(p => p.is_refillable).length,
    };

    return successResponse(res, {
      prescriptions: formattedPrescriptions,
      summary,
      pharmacy_id_used: pharmacy_id || null,
      message: pharmacy_id 
        ? "Prices shown for selected pharmacy" 
        : "Select a pharmacy to see current drug prices",
    });
  } catch (error) {
    console.error("Get prescriptions error:", error);
    return errorResponse(res, error.message, 500, "GET_PRESCRIPTIONS_ERROR");
  }
};

// ─── GET /meds/prescriptions/refillable ──────────────────────────────────────
// Optional query param: ?pharmacy_id=... to get prices from a specific pharmacy
const getRefillablePrescriptions = async (req, res) => {
  try {
    const todayStr = getTodayLocal();
    const { pharmacy_id } = req.query; // optional

    // Fetch prescriptions eligible for refill
    const prescriptions = await Prescription.findAll({
      where: {
        patient_id: req.user.id,
        status: { [Op.in]: ["dispensed", "delivered"] },
        expiry_date: { [Op.gte]: todayStr },
      },
      include: [
        {
          model: User,
          as: "doctor",
          attributes: ["id", "full_name", "specialty"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    // If pharmacy_id provided, fetch all relevant drug prices for that pharmacy
    let drugPriceMap = new Map(); // key: drug_name, value: unit_price
    if (pharmacy_id) {
      const drugNames = new Set();
      for (const p of prescriptions) {
        for (const item of p.items || []) {
          if (item.drug_name) drugNames.add(item.drug_name);
        }
      }
      if (drugNames.size > 0) {
        const drugs = await Drug.findAll({
          where: {
            pharmacy_id: pharmacy_id,
            drug_name: { [Op.in]: Array.from(drugNames) },
            is_active: true,
          },
          attributes: ["drug_name", "unit_price"],
        });
        for (const drug of drugs) {
          drugPriceMap.set(drug.drug_name, parseFloat(drug.unit_price));
        }
      }
    }

    // Build response with prices (or defaults)
    const refillablePrescriptions = prescriptions.filter((p) => {
      const items = p.items || [];
      return items.some((item) => (item.quantity || 0) > 0);
    });

    const formattedPrescriptions = refillablePrescriptions.map((p) => {
      const itemsWithPrices = (p.items || [])
        .filter((item) => (item.quantity || 0) > 0)
        .map((item) => {
          let unit_price = drugPriceMap.get(item.drug_name);
          let priceAvailable = !!unit_price;
          if (!priceAvailable && pharmacy_id) {
            // If pharmacy was specified but price missing, default to 0 and mark as unavailable
            unit_price = 0;
          } else if (!pharmacy_id) {
            // No pharmacy selected, don't show prices
            unit_price = null;
          }
          const total_price = (unit_price || 0) * (item.quantity || 0);
          return {
            drug_name: item.drug_name,
            dosage: item.dosage,
            dosage_form: item.dosage_form,
            quantity: item.quantity,
            unit_price: unit_price,
            total_price: total_price,
            instructions: item.instructions,
            frequency: item.frequency,
            duration_days: item.duration_days,
            price_available: priceAvailable,
          };
        });

      // Calculate total amount only if prices are available
      let total_amount = 0;
      if (pharmacy_id) {
        total_amount = itemsWithPrices.reduce(
          (sum, item) => sum + (item.total_price || 0),
          0
        );
      }

      return {
        id: p.id,
        prescription_number: p.prescription_number,
        issue_date: p.issue_date,
        expiry_date: p.expiry_date,
        diagnosis: p.diagnosis,
        doctor_name: p.doctor?.full_name,
        doctor_specialization: p.doctor?.specialty,
        items: itemsWithPrices,
        total_amount: total_amount,
        status: p.status,
        requires_pharmacy_selection: !pharmacy_id, // flag for frontend
      };
    });

    return successResponse(res, {
      prescriptions: formattedPrescriptions,
      summary: {
        total: formattedPrescriptions.length,
        total_amount: formattedPrescriptions.reduce(
          (sum, p) => sum + p.total_amount,
          0
        ),
      },
      pharmacy_id_used: pharmacy_id || null,
      message: pharmacy_id
        ? "Prices shown for selected pharmacy"
        : "Select a pharmacy to see current drug prices",
    });
  } catch (error) {
    console.error("Get refillable prescriptions error:", error);
    return errorResponse(
      res,
      error.message,
      500,
      "GET_REFILLABLE_PRESCRIPTIONS_ERROR"
    );
  }
};

// ─── POST /meds/order/create ────────────────────────────────────────────────
const createOrderFromPrescription = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { prescription_id, pharmacy_id, delivery_type, payment_method, patient_address } = req.body;

    if (!prescription_id) {
      await t.rollback();
      return errorResponse(res, 'prescription_id is required', 400, 'MISSING_FIELD');
    }

    const prescription = await Prescription.findOne({
      where: {
        id: prescription_id,
        patient_id: req.user.id,
      },
      transaction: t,
    });

    if (!prescription) {
      await t.rollback();
      return errorResponse(res, 'Prescription not found', 404, 'NOT_FOUND');
    }

    const todayStr = getTodayLocal();
    if (prescription.expiry_date && prescription.expiry_date < todayStr) {
      await t.rollback();
      return errorResponse(res, 'Prescription has expired', 400, 'PRESCRIPTION_EXPIRED');
    }

    if (!["dispensed", "delivered"].includes(prescription.status)) {
      await t.rollback();
      return errorResponse(res, 'Prescription is not available for refill', 400, 'INVALID_STATUS');
    }

    const items = prescription.items || [];
    const validItems = items.filter(item => (item.quantity || 0) > 0);
    
    if (validItems.length === 0) {
      await t.rollback();
      return errorResponse(res, 'No remaining medications in this prescription', 400, 'NO_REMAINING_ITEMS');
    }

    const total_amount = validItems.reduce((sum, item) => 
      sum + ((item.quantity || 0) * (item.unit_price || 0)), 0
    );

    const order = await Order.create({
      order_number: `ORD-${Date.now()}-${prescription_id.slice(0, 4)}`,
      prescription_id: prescription.id,
      pharmacy_id: pharmacy_id || prescription.pharmacy_id,
      patient_id: req.user.id,
      patient_name: req.user.full_name,
      patient_phone: req.user.phone_number,
      patient_address: patient_address || req.user.address,
      delivery_type: delivery_type || 'home_delivery',
      payment_method: payment_method || 'mpesa',
      total_amount: total_amount,
      status: 'pending',
      payment_status: 'unpaid',
    }, { transaction: t });

    const updatedItems = items.map(item => ({
      ...item,
      quantity: 0
    }));
    
    await prescription.update({ 
      items: updatedItems
    }, { transaction: t });

    await t.commit();

    return successResponse(res, {
      order_id: order.id,
      order_number: order.order_number,
      prescription_number: prescription.prescription_number,
      total_amount: total_amount,
      status: order.status,
      payment_status: order.payment_status,
      message: 'Order created successfully. Proceed to payment.',
    }, 'Order created successfully', 201);

  } catch (error) {
    await t.rollback();
    console.error('Create order error:', error);
    return errorResponse(res, error.message, 500, 'CREATE_ORDER_ERROR');
  }
};

// ─── POST /meds/orders/create-bulk ─────────────────────────────────────────
const createOrdersFromPrescriptions = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { prescription_ids, pharmacy_id, delivery_type, payment_method, patient_address } = req.body;

    if (!prescription_ids || !prescription_ids.length) {
      await t.rollback();
      return errorResponse(res, 'prescription_ids array is required', 400, 'MISSING_FIELD');
    }

    const orders = [];
    const errors = [];

    for (const prescription_id of prescription_ids) {
      try {
        const prescription = await Prescription.findOne({
          where: {
            id: prescription_id,
            patient_id: req.user.id,
          },
          transaction: t,
        });

        if (!prescription) {
          errors.push({ prescription_id, error: 'Prescription not found' });
          continue;
        }

        const todayStr = getTodayLocal();
        if (prescription.expiry_date && prescription.expiry_date < todayStr) {
          errors.push({ 
            prescription_id, 
            prescription_number: prescription.prescription_number,
            error: 'Prescription has expired' 
          });
          continue;
        }

        if (!["dispensed", "delivered"].includes(prescription.status)) {
          errors.push({ 
            prescription_id, 
            prescription_number: prescription.prescription_number,
            error: 'Prescription not available for refill' 
          });
          continue;
        }

        const items = prescription.items || [];
        const validItems = items.filter(item => (item.quantity || 0) > 0);
        
        if (validItems.length === 0) {
          errors.push({ 
            prescription_id, 
            prescription_number: prescription.prescription_number,
            error: 'No remaining medications' 
          });
          continue;
        }

        const total_amount = validItems.reduce((sum, item) => 
          sum + ((item.quantity || 0) * (item.unit_price || 0)), 0
        );

        const order = await Order.create({
          order_number: `ORD-${Date.now()}-${prescription_id.slice(0, 4)}`,
          prescription_id: prescription.id,
          pharmacy_id: pharmacy_id || prescription.pharmacy_id,
          patient_id: req.user.id,
          patient_name: req.user.full_name,
          patient_phone: req.user.phone_number,
          patient_address: patient_address || req.user.address,
          delivery_type: delivery_type || 'home_delivery',
          payment_method: payment_method || 'mpesa',
          total_amount: total_amount,
          status: 'pending',
          payment_status: 'unpaid',
        }, { transaction: t });

        const updatedItems = items.map(item => ({
          ...item,
          quantity: 0
        }));
        
        await prescription.update({ 
          items: updatedItems
        }, { transaction: t });

        orders.push({
          order_id: order.id,
          order_number: order.order_number,
          prescription_number: prescription.prescription_number,
          total_amount: total_amount,
        });

      } catch (err) {
        errors.push({ prescription_id, error: err.message });
      }
    }

    await t.commit();

    return successResponse(res, {
      summary: {
        total_requested: prescription_ids.length,
        successful: orders.length,
        failed: errors.length,
      },
      orders: orders,
      total_amount: orders.reduce((sum, o) => sum + o.total_amount, 0),
      errors: errors.length ? errors : undefined,
      message: `${orders.length} of ${prescription_ids.length} order(s) created successfully. Proceed to payment.`,
    }, 'Orders processed successfully', 201);

  } catch (error) {
    await t.rollback();
    console.error('Create multiple orders error:', error);
    return errorResponse(res, error.message, 500, 'CREATE_ORDERS_ERROR');
  }
};

module.exports = {
  getMedsDashboard,
  bulkSlotUpdate,
  getInventory,
  triggerRefill,
  bulkRefill,
  getMyPrescriptions,
  getRefillableMeds,
  selectMedication,
  submitRefill,
  searchMedicines,
  getRefillablePrescriptions,
  createOrderFromPrescription,
  createOrdersFromPrescriptions,
};