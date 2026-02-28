const { Specialist, Appointment, AppointmentSlot, Patient } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { Op } = require('sequelize');

// GET /specialists
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

    const specialists = rows.map((s) => ({
      id: s.id, name: s.name, specialty: s.specialty,
      hospital: s.hospitalName, rating: s.rating,
      consultationFee: s.consultationFee, availableToday: s.availableToday,
      nextAvailable: s.availableToday ? 'Today' : 'Tomorrow',
    }));

    return successResponse(res, {
      specialists,
      filters: { specialties: ['Cardiology', 'Dentist', 'General', 'Neurologist', 'Optician'] },
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SPECIALISTS_ERROR');
  }
};

// GET /specialists/recommended
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
      results: results.map((s) => ({ id: s.id, name: s.name, specialty: s.specialty, hospital: s.hospitalName, matchType: 'name_or_specialty' })),
      suggestions: ['Cardiology', 'Cardiologist'].filter((s) => s.toLowerCase().includes(q.toLowerCase())),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_SPECIALISTS_ERROR');
  }
};

// GET /specialists/:id
const getSpecialistById = async (req, res) => {
  try {
    const specialist = await Specialist.findByPk(req.params.specialistId || req.params.id);
    if (!specialist) return errorResponse(res, 'Specialist not found', 404, 'NOT_FOUND');

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const todaySlots = await AppointmentSlot.findAll({ where: { specialistId: specialist.id, date: today, isAvailable: true } });
    const tomorrowSlots = await AppointmentSlot.findAll({ where: { specialistId: specialist.id, date: tomorrow, isAvailable: true } });

    return successResponse(res, {
      id: specialist.id, name: specialist.name, specialty: specialist.specialty,
      hospital: { name: specialist.hospitalName, address: specialist.hospitalAddress, distance: '2.4 km' },
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
const getAvailableSlots = async (req, res) => {
  try {
    const { specialistId } = req.params;
    const { date } = req.query;

    const slots = await AppointmentSlot.findAll({
      where: { specialistId, date: date || new Date().toISOString().split('T')[0] },
    });

    const dateObj = date ? new Date(date) : new Date();
    const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

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
const bookAppointment = async (req, res) => {
  try {
    const { doctorId, date, time, symptoms, notes, paymentMethod } = req.body;

    const specialist = await Specialist.findByPk(doctorId);
    if (!specialist) return errorResponse(res, 'Specialist not found', 404, 'NOT_FOUND');

    // Mark slot as unavailable
    await AppointmentSlot.update({ isAvailable: false }, { where: { specialistId: doctorId, date, time } });

    const appointment = await Appointment.create({
      patientId: req.patient.id,
      specialistId: doctorId,
      date, time, symptoms, notes,
      type: specialist.specialty,
      paymentMethod,
      totalCost: specialist.consultationFee,
      status: 'pending',
    });

    return successResponse(res, {
      appointmentId: appointment.id,
      doctorName: specialist.name,
      hospital: specialist.hospitalName,
      date, time,
      totalCost: specialist.consultationFee,
      paymentStatus: 'pending',
    }, 'Appointment booked successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'BOOK_APPOINTMENT_ERROR');
  }
};

module.exports = { getSpecialists, getRecommendedSpecialists, searchSpecialists, getSpecialistById, getAvailableSlots, bookAppointment };
