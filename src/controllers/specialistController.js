const { Specialist, AppointmentSlot, Appointment, Payment } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');
const { Op } = require('sequelize');

// GET /specialists
// Reads from shared DB directly — doctor backend populates these records
const getSpecialists = async (req, res) => {
  try {
    const { specialty, page = 1, limit = 20 } = req.query;
    const where = { isActive: true };
    if (specialty) where.specialty = { [Op.like]: `%${specialty}%` };

    const { count, rows } = await Specialist.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return successResponse(res, {
      specialists: rows.map((s) => ({
        id: s.id, name: s.name, specialty: s.specialty,
        hospital: s.hospitalName, rating: s.rating,
        consultationFee: s.consultationFee, availableToday: s.availableToday,
        nextAvailable: s.availableToday ? 'Today' : 'Tomorrow',
      })),
      filters: { specialties: ['Cardiology', 'Dentist', 'General', 'Neurologist', 'Optician'] },
      pagination: {
        total: count, page: parseInt(page),
        limit: parseInt(limit), totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SPECIALISTS_ERROR');
  }
};

// GET /specialists/recommended
// Reads from shared DB directly
const getRecommendedSpecialists = async (req, res) => {
  try {
    const specialists = await Specialist.findAll({
      where: { isActive: true, availableToday: true },
      order: [['rating', 'DESC']],
      limit: 5,
    });

    return successResponse(res, {
      recommendations: specialists.map((s) => ({
        id: s.id, name: s.name, specialty: s.specialty,
        hospital: s.hospitalName, consultationFee: s.consultationFee,
        availableToday: s.availableToday, matchReason: 'Highly rated specialist',
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'RECOMMENDED_SPECIALISTS_ERROR');
  }
};

// GET /specialists/search
// Reads from shared DB directly
const searchSpecialists = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return errorResponse(res, 'Search query required', 400, 'MISSING_QUERY');

    const results = await Specialist.findAll({
      where: {
        isActive: true,
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { specialty: { [Op.like]: `%${q}%` } },
        ],
      },
      limit: 20,
    });

    return successResponse(res, {
      results: results.map((s) => ({
        id: s.id, name: s.name, specialty: s.specialty, hospital: s.hospitalName,
      })),
      suggestions: ['Cardiology', 'Cardiologist'].filter((s) =>
        s.toLowerCase().includes(q.toLowerCase())
      ),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_SPECIALISTS_ERROR');
  }
};

// GET /specialists/:id
// Reads from shared DB directly
const getSpecialistById = async (req, res) => {
  try {
    const specialist = await Specialist.findByPk(req.params.specialistId || req.params.id);
    if (!specialist) return errorResponse(res, 'Specialist not found', 404, 'NOT_FOUND');

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const todaySlots = await AppointmentSlot.findAll({
      where: { specialistId: specialist.id, date: today, isAvailable: true },
    });
    const tomorrowSlots = await AppointmentSlot.findAll({
      where: { specialistId: specialist.id, date: tomorrow, isAvailable: true },
    });

    return successResponse(res, {
      id: specialist.id, name: specialist.name, specialty: specialist.specialty,
      hospital: { name: specialist.hospitalName, address: specialist.hospitalAddress },
      consultationFee: specialist.consultationFee,
      availableSlots: {
        today: todaySlots.map((s) => s.time),
        tomorrow: tomorrowSlots.map((s) => s.time),
      },
      rating: specialist.rating,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SPECIALIST_ERROR');
  }
};

// GET /specialists/:specialistId/slots
// Reads from shared DB directly
const getAvailableSlots = async (req, res) => {
  try {
    const { specialistId } = req.params;
    const { date } = req.query;

    const slots = await AppointmentSlot.findAll({
      where: { specialistId, date: date || new Date().toISOString().split('T')[0] },
    });

    const dateObj = date ? new Date(date) : new Date();
    const dateLabel = dateObj.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
    });

    return successResponse(res, {
      doctorId: specialistId,
      date: dateLabel,
      slots: slots.map((s) => ({ time: s.time, available: s.isAvailable })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SLOTS_ERROR');
  }
};

// POST /appointments/book
// Patient backend does NOT write to Appointment or mark slots directly.
// It delegates to the doctor backend which owns appointments and slots.
// Doctor backend will also trigger M-Pesa STK push for appointment payment.
const bookAppointment = async (req, res) => {
  try {
    const { doctorId, date, time, symptoms, notes, paymentMethod, phoneNumber } = req.body;

    // Forward booking request to doctor backend
    // Doctor backend will:
    // 1. Verify the slot is still available
    // 2. Create the Appointment record in shared DB
    // 3. Mark the slot as unavailable
    // 4. Trigger M-Pesa STK push if paymentMethod is m_pesa
    // 5. Create Payment record with checkoutRequestId
    const result = await serviceClient('doctor', 'POST', '/appointments/book', {
      patientId: req.patient.id,
      doctorId,
      date,
      time,
      symptoms,
      notes,
      paymentMethod,
      phoneNumber,
    });

    if (!result.success) {
      return errorResponse(res, result.error, result.status, 'BOOKING_SERVICE_ERROR');
    }

    return successResponse(res, result.data, 'Appointment booked successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'BOOK_APPOINTMENT_ERROR');
  }
};

module.exports = {
  getSpecialists,
  getRecommendedSpecialists,
  searchSpecialists,
  getSpecialistById,
  getAvailableSlots,
  bookAppointment,
};