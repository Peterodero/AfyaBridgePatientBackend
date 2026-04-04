const { models: {User, AppointmentSlot, Appointment, Wallet, Transaction} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

// ─── Helper: normalize any time input to HH:MM:SS ────────────────────────────
// Handles: "9:30", "09:30", "9.30", "09:30:00", "9:30:00"
const normalizeTime = (raw) => {
  if (!raw) return '00:00:00';
  // Replace any dots with colons first: "9.30" → "9:30"
  const cleaned = String(raw).replace(/\./g, ':');
  const parts = cleaned.split(':');
  const h = (parts[0] || '0').padStart(2, '0');
  const m = (parts[1] || '00').padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  return `${h}:${m}:${s}`;
};

// GET /specialists
const getSpecialists = async (req, res) => {
  try {
    const { specialty, page = 1, limit = 20 } = req.query;
    const where = { role: 'doctor', is_active: true, account_status: 'active' };
    if (specialty) where.specialty = { [Op.like]: `%${specialty}%` };

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return successResponse(res, {
      specialists: rows.map((d) => ({
        id: d.id,
        name: d.full_name,
        specialty: d.specialty,
        hospital: d.hospital,
        rating: d.rating,
        consultationFee: d.consultation_fee,
        allowVideo: d.allow_video_consultations,
        allowInPerson: d.allow_in_person_consultations,
      })),
      filters: { specialties: ['Cardiology', 'Dentist', 'General', 'Neurologist', 'Optician'] },
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SPECIALISTS_ERROR');
  }
};

// GET /specialists/recommended
const getRecommendedSpecialists = async (req, res) => {
  try {
    const doctors = await User.findAll({
      where: { role: 'doctor', is_active: true, account_status: 'active' },
      order: [['rating', 'DESC']],
      limit: 5,
      attributes: { exclude: ['password_hash'] },
    });

    return successResponse(res, {
      recommendations: doctors.map((d) => ({
        id: d.id,
        name: d.full_name,
        specialty: d.specialty,
        hospital: d.hospital,
        consultationFee: d.consultation_fee,
        rating: d.rating,
        matchReason: 'Highly rated specialist',
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'RECOMMENDED_SPECIALISTS_ERROR');
  }
};

// GET /specialists/search
const searchSpecialists = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return errorResponse(res, 'Search query required', 400, 'MISSING_QUERY');

    const results = await User.findAll({
      where: {
        role: 'doctor',
        is_active: true,
        [Op.or]: [
          { full_name: { [Op.like]: `%${q}%` } },
          { specialty: { [Op.like]: `%${q}%` } },
          { hospital: { [Op.like]: `%${q}%` } },
        ],
      },
      attributes: ['id', 'full_name', 'specialty', 'hospital', 'rating', 'consultation_fee'],
      limit: 20,
    });

    return successResponse(res, {
      results: results.map((d) => ({
        id: d.id,
        name: d.full_name,
        specialty: d.specialty,
        hospital: d.hospital,
        consultationFee: d.consultation_fee,
        rating: d.rating,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_SPECIALISTS_ERROR');
  }
};

// GET /specialists/:id
const getSpecialistById = async (req, res) => {
  try {
    const doctor = await User.findOne({
      where: { id: req.params.id, role: 'doctor' },
      attributes: { exclude: ['password_hash'] },
    });
    if (!doctor) return errorResponse(res, 'Doctor not found', 404, 'NOT_FOUND');

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [todaySlots, tomorrowSlots] = await Promise.all([
      AppointmentSlot.findAll({ where: { doctor_id: doctor.id, date: today, is_available: true } }),
      AppointmentSlot.findAll({ where: { doctor_id: doctor.id, date: tomorrow, is_available: true } }),
    ]);

    return successResponse(res, {
      id: doctor.id,
      name: doctor.full_name,
      specialty: doctor.specialty,
      hospital: doctor.hospital,
      bio: doctor.bio,
      consultationFee: doctor.consultation_fee,
      allowVideo: doctor.allow_video_consultations,
      allowInPerson: doctor.allow_in_person_consultations,
      rating: doctor.rating,
      totalReviews: doctor.total_reviews,
      availableSlots: {
        today: todaySlots.map((s) => ({ id: s.id, time: s.time })),
        tomorrow: tomorrowSlots.map((s) => ({ id: s.id, time: s.time })),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SPECIALIST_ERROR');
  }
};

// GET /specialists/:id/slots?date=YYYY-MM-DD
const getAvailableSlots = async (req, res) => {
  try {
    const { id } = req.params;   // ← matches route /:id/slots
    const { date } = req.query;

    const targetDate = date || new Date().toISOString().split('T')[0];

    const slots = await AppointmentSlot.findAll({
      where: { doctor_id: id, date: targetDate },
      order: [['time', 'ASC']],
    });

    const dateObj = new Date(targetDate + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    return successResponse(res, {
      doctorId: id,
      date: dateLabel,
      slots: slots.map((s) => ({
        id: s.id,
        time: s.time,
        available: s.is_available,   // frontend shows booked/available clearly
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SLOTS_ERROR');
  }
};

// POST /appointments/book
const bookAppointment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { doctorId, date, time, reason, type, priority, paymentMethod = 'wallet', phoneNumber } = req.body;

    const normalizedTime = normalizeTime(time);

    // Validate the normalized time looks correct
    if (!/^\d{2}:\d{2}:\d{2}$/.test(normalizedTime)) {
      await t.rollback();
      return errorResponse(res, `Invalid time format: "${time}". Use HH:MM e.g. "09:30"`, 400, 'INVALID_TIME');
    }

    // 1. Verify doctor exists and is active
    const doctor = await User.findOne({
      where: { id: doctorId, role: 'doctor', is_active: true },
      transaction: t,
    });
    if (!doctor) {
      await t.rollback();
      return errorResponse(res, 'Doctor not found or unavailable', 404, 'DOCTOR_NOT_FOUND');
    }

    // 2. Check slot availability
    // DB may store times as "09:00" or "09:00:00" — fetch all slots for doctor+date and compare normalized
    const allSlots = await AppointmentSlot.findAll({
      where: { doctor_id: doctorId, date },
      transaction: t,
    });
    const slot = allSlots.find((s) => normalizeTime(s.time) === normalizedTime) || null;

    // If slot exists and is already taken — reject
    if (slot && !slot.is_available) {
      await t.rollback();
      return errorResponse(res, 'This slot has already been booked. Please choose another time.', 409, 'SLOT_UNAVAILABLE');
    }

    // If slot does not exist at all — during testing/before doctor backend is live,
    // we allow booking freely. Slot row will be created after appointment is saved.

    // 3. Check for duplicate patient booking at same date+time
    const duplicate = await Appointment.findOne({
      where: {
        patient_id: req.user.id,
        date,
        time: normalizedTime,
        status: { [Op.notIn]: ['cancelled'] },
      },
      transaction: t,
    });
    if (duplicate) {
      await t.rollback();
      return errorResponse(res, 'You already have an appointment at this date and time.', 409, 'DUPLICATE_BOOKING');
    }

    const fee = parseFloat(doctor.consultation_fee || 0);

    // 4. Wallet payment — deduct fee atomically before confirming booking
    let walletTxn = null;
    if (paymentMethod === 'wallet' && fee > 0) {
      const wallet = await Wallet.findOne({ where: { user_id: req.user.id }, transaction: t });

      if (!wallet || !wallet.is_active) {
        await t.rollback();
        return errorResponse(res, 'Wallet not found. Please set up your wallet first.', 404, 'WALLET_NOT_FOUND');
      }

      if (parseFloat(wallet.balance) < fee) {
        await t.rollback();
        const shortfall = (fee - parseFloat(wallet.balance)).toFixed(2);
        return errorResponse(res,
          `Insufficient wallet balance. You need KES ${shortfall} more. Please top up your wallet.`,
          400, 'INSUFFICIENT_BALANCE'
        );
      }

      const newBalance = parseFloat(wallet.balance) - fee;
      await wallet.update({ balance: newBalance }, { transaction: t });

      walletTxn = await Transaction.create({
        wallet_id: wallet.id,
        user_id: req.user.id,
        amount: fee,
        type: 'debit',
        category: 'consultation_fee',
        status: 'completed',
        reference_type: 'Appointment',
        payment_method: 'wallet',
        balance_after: newBalance,
        description: `Consultation fee — Dr. ${doctor.full_name}`,
        transacted_at: new Date(),
      }, { transaction: t });
    }

    // 5. Create the appointment
    const appointment = await Appointment.create({
      doctor_id: doctorId,
      patient_id: req.user.id,
      date,
      time: normalizedTime,
      duration: doctor.slot_duration || 30,
      type: type || 'in_person',
      reason,
      priority: priority || 'normal',
      status: 'pending',
      charges: fee,
    }, { transaction: t });

    // Attach appointment ID to the wallet transaction now that we have it
    if (walletTxn) {
      await walletTxn.update({ reference_id: appointment.id }, { transaction: t });
    }

    // 6. Mark slot as unavailable — update if the row exists, create it if not
    //    Either way: exactly ONE row for this doctor/date/time, with is_available = false
    if (slot) {
      await slot.update({ is_available: false }, { transaction: t });
    } else {
      await AppointmentSlot.create({
        doctor_id: doctorId,
        date,
        time: normalizedTime,
        slot_duration: doctor.slot_duration || 30,
        is_available: false,
      }, { transaction: t });
    }

    await t.commit();

    // 7. Notify doctor backend (fire-and-forget — booking succeeds even if doctor backend is down)
    serviceClient('doctor', 'POST', '/appointments/notify', {
      appointmentId: appointment.id,
      patientId: req.user.id,
      doctorId,
      date,
      time: normalizedTime,
      type: appointment.type,
      reason,
    }).catch(() => {});

    return successResponse(res, {
      appointmentId: appointment.id,
      doctor: {
        id: doctor.id,
        name: doctor.full_name,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
      },
      date,
      time: normalizedTime,
      type: appointment.type,
      status: appointment.status,
      fee,
      paymentMethod: fee > 0 ? paymentMethod : 'free',
      walletTransactionId: walletTxn?.id || null,
      message: `Appointment booked with Dr. ${doctor.full_name} on ${date} at ${normalizedTime}.`,
    }, 'Appointment booked successfully', 201);
  } catch (error) {
    await t.rollback();
    return errorResponse(res, error.message, 500, 'BOOK_APPOINTMENT_ERROR');
  }
};

// GET /appointments
const getMyAppointments = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = { patient_id: req.user.id };
    if (status) where.status = status;

    const { count, rows } = await Appointment.findAndCountAll({
      where,
      order: [['date', 'DESC'], ['time', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    const doctorIds = [...new Set(rows.map((a) => a.doctor_id))];
    const doctors = await User.findAll({
      where: { id: doctorIds },
      attributes: ['id', 'full_name', 'specialty', 'hospital', 'profile_image'],
    });
    const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d]));

    return successResponse(res, {
      appointments: rows.map((a) => {
        const doc = doctorMap[a.doctor_id];
        return {
          id: a.id,
          date: a.date,
          time: a.time,
          type: a.type,
          status: a.status,
          reason: a.reason,
          priority: a.priority,
          charges: a.charges,
          doctor: doc ? {
            id: doc.id,
            name: doc.full_name,
            specialty: doc.specialty,
            hospital: doc.hospital,
            profileImage: doc.profile_image,
          } : null,
        };
      }),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_APPOINTMENTS_ERROR');
  }
};

// GET /appointments/:appointmentId
const getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      where: { id: req.params.appointmentId, patient_id: req.user.id },
    });
    console.log(req.user.id)
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    const doctor = await User.findByPk(appointment.doctor_id, {
      attributes: ['id', 'full_name', 'specialty', 'hospital', 'profile_image', 'phone_number'],
    });

    return successResponse(res, {
      id: appointment.id,
      date: appointment.date,
      time: appointment.time,
      duration: appointment.duration,
      type: appointment.type,
      status: appointment.status,
      reason: appointment.reason,
      priority: appointment.priority,
      charges: appointment.charges,
      doctor: doctor ? {
        id: doctor.id,
        name: doctor.full_name,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        profileImage: doctor.profile_image,
        phone: doctor.phone_number,
      } : null,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_APPOINTMENT_ERROR');
  }
};

// DELETE /appointments/:appointmentId/cancel
const cancelAppointment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const appointment = await Appointment.findOne({
      where: { id: req.params.appointmentId, patient_id: req.user.id },
      transaction: t,
    });
    if (!appointment) {
      await t.rollback();
      return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');
    }

    if (['completed', 'cancelled'].includes(appointment.status)) {
      await t.rollback();
      return errorResponse(res, `Cannot cancel an appointment that is already ${appointment.status}`, 400, 'INVALID_STATUS');
    }

    await appointment.update({ status: 'cancelled' }, { transaction: t });

    // Re-open the slot so another patient can book it
    const cancelledSlots = await AppointmentSlot.findAll({
      where: { doctor_id: appointment.doctor_id, date: appointment.date },
      transaction: t,
    });
    const slotToReopen = cancelledSlots.find((s) => normalizeTime(s.time) === normalizeTime(appointment.time));
    if (slotToReopen) {
      await slotToReopen.update({ is_available: true }, { transaction: t });
    }

    // Refund wallet if fee was paid
    if (appointment.charges && parseFloat(appointment.charges) > 0) {
      const wallet = await Wallet.findOne({ where: { user_id: req.user.id }, transaction: t });
      if (wallet) {
        const newBalance = parseFloat(wallet.balance) + parseFloat(appointment.charges);
        await wallet.update({ balance: newBalance }, { transaction: t });

        await Transaction.create({
          wallet_id: wallet.id,
          user_id: req.user.id,
          amount: parseFloat(appointment.charges),
          type: 'credit',
          category: 'refund',
          status: 'completed',
          reference_id: appointment.id,
          reference_type: 'Appointment',
          payment_method: 'wallet',
          balance_after: newBalance,
          description: `Refund — cancelled appointment`,
          transacted_at: new Date(),
        }, { transaction: t });
      }
    }

    await t.commit();

    return successResponse(res, {
      appointmentId: appointment.id,
      status: 'cancelled',
      refunded: parseFloat(appointment.charges || 0) > 0,
      refundAmount: parseFloat(appointment.charges || 0),
    }, 'Appointment cancelled successfully');
  } catch (error) {
    await t.rollback();
    return errorResponse(res, error.message, 500, 'CANCEL_APPOINTMENT_ERROR');
  }
};

module.exports = {
  getSpecialists,
  getRecommendedSpecialists,
  searchSpecialists,
  getSpecialistById,
  getAvailableSlots,
  bookAppointment,
  getMyAppointments,
  getAppointmentById,
  cancelAppointment,
};