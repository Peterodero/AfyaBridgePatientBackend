const { models: { Consultation, Appointment, Message } } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');

// ─── GET /consultations ──────────────────────────────────────────────────────
// Get all consultations for the logged-in patient
const getConsultations = async (req, res) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;

    // Build where clause
    const whereClause = {
      patient_id: req.user.id,
    };
    
    if (status) {
      whereClause.status = status;
    }

    const consultations = await Consultation.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Appointment,
          attributes: ['id', 'date', 'time', 'type', 'status', 'doctor_id'],
          required: true,
        },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const formattedConsultations = consultations.rows.map((consultation) => ({
      id: consultation.id,
      appointment_id: consultation.appointment_id,
      doctor_id: consultation.doctor_id,
      patient_id: consultation.patient_id,
      status: consultation.status,
      meeting_url: consultation.meeting_url,
      start_time: consultation.start_time,
      end_time: consultation.end_time,
      symptoms: consultation.symptoms,
      controls: consultation.controls,
      appointment: consultation.Appointment ? {
        id: consultation.Appointment.id,
        date: consultation.Appointment.date,
        time: consultation.Appointment.time,
        type: consultation.Appointment.type,
        status: consultation.Appointment.status,
      } : null,
      created_at: consultation.created_at,
      updated_at: consultation.updated_at,
    }));

    return successResponse(res, {
      consultations: formattedConsultations,
      pagination: {
        total: consultations.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        totalPages: Math.ceil(consultations.count / limit),
      },
    });
  } catch (error) {
    console.error('Get consultations error:', error);
    return errorResponse(res, error.message, 500, 'GET_CONSULTATIONS_ERROR');
  }
};

// ─── GET /consultations/:consultationId ──────────────────────────────────────
// Get a single consultation by ID with full details
const getConsultationById = async (req, res) => {
  try {
    const { consultationId } = req.params;

    const consultation = await Consultation.findOne({
      where: {
        id: consultationId,
        patient_id: req.user.id,
      },
      include: [
        {
          model: Appointment,
          attributes: ['id', 'date', 'time', 'type', 'status', 'doctor_id'],
        },
      ],
    });

    if (!consultation) {
      return errorResponse(res, 'Consultation not found', 404, 'NOT_FOUND');
    }

    // Get messages for this consultation
    const messages = await Message.findAll({
      where: {
        consultation_id: consultationId,
        [Op.or]: [
          { sender_id: req.user.id },
          { receiver_id: req.user.id },
        ],
      },
      order: [['created_at', 'ASC']],
      attributes: ['id', 'sender_id', 'receiver_id', 'content', 'type', 'is_read', 'created_at'],
    });

    const formattedConsultation = {
      id: consultation.id,
      appointment_id: consultation.appointment_id,
      doctor_id: consultation.doctor_id,
      patient_id: consultation.patient_id,
      status: consultation.status,
      meeting_url: consultation.meeting_url,
      start_time: consultation.start_time,
      end_time: consultation.end_time,
      symptoms: consultation.symptoms,
      controls: consultation.controls,
      appointment: consultation.Appointment ? {
        id: consultation.Appointment.id,
        date: consultation.Appointment.date,
        time: consultation.Appointment.time,
        type: consultation.Appointment.type,
        status: consultation.Appointment.status,
      } : null,
      messages: messages.map((msg) => ({
        id: msg.id,
        sender_id: msg.sender_id,
        receiver_id: msg.receiver_id,
        content: msg.content,
        type: msg.type,
        is_read: msg.is_read,
        sent_at: msg.created_at,
      })),
      created_at: consultation.created_at,
      updated_at: consultation.updated_at,
    };

    return successResponse(res, {
      consultation: formattedConsultation,
    });
  } catch (error) {
    console.error('Get consultation by ID error:', error);
    return errorResponse(res, error.message, 500, 'GET_CONSULTATION_ERROR');
  }
};

// ─── GET /consultations/upcoming ─────────────────────────────────────────────
// Get upcoming consultations (active or scheduled)
const getUpcomingConsultations = async (req, res) => {
  try {
    const consultations = await Consultation.findAll({
      where: {
        patient_id: req.user.id,
        status: 'active',
        start_time: { [Op.gte]: new Date() },
      },
      include: [
        {
          model: Appointment,
          attributes: ['id', 'date', 'time', 'type', 'status', 'doctor_id'],
        },
      ],
      order: [['start_time', 'ASC']],
      limit: 5,
    });

    const formattedConsultations = consultations.map((consultation) => ({
      id: consultation.id,
      appointment_id: consultation.appointment_id,
      doctor_id: consultation.doctor_id,
      status: consultation.status,
      meeting_url: consultation.meeting_url,
      start_time: consultation.start_time,
      appointment: consultation.Appointment ? {
        id: consultation.Appointment.id,
        date: consultation.Appointment.date,
        time: consultation.Appointment.time,
        type: consultation.Appointment.type,
      } : null,
    }));

    return successResponse(res, {
      upcoming: formattedConsultations,
      count: formattedConsultations.length,
    });
  } catch (error) {
    console.error('Get upcoming consultations error:', error);
    return errorResponse(res, error.message, 500, 'GET_UPCOMING_CONSULTATIONS_ERROR');
  }
};

// ─── GET /consultations/history ──────────────────────────────────────────────
// Get completed consultation history
const getConsultationHistory = async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    const consultations = await Consultation.findAndCountAll({
      where: {
        patient_id: req.user.id,
        status: { [Op.in]: ['completed', 'abandoned'] },
      },
      include: [
        {
          model: Appointment,
          attributes: ['id', 'date', 'time', 'type', 'status', 'doctor_id'],
        },
      ],
      order: [['end_time', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const formattedConsultations = consultations.rows.map((consultation) => ({
      id: consultation.id,
      appointment_id: consultation.appointment_id,
      doctor_id: consultation.doctor_id,
      status: consultation.status,
      start_time: consultation.start_time,
      end_time: consultation.end_time,
      appointment: consultation.Appointment ? {
        id: consultation.Appointment.id,
        date: consultation.Appointment.date,
        time: consultation.Appointment.time,
        type: consultation.Appointment.type,
      } : null,
    }));

    return successResponse(res, {
      history: formattedConsultations,
      pagination: {
        total: consultations.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        totalPages: Math.ceil(consultations.count / limit),
      },
    });
  } catch (error) {
    console.error('Get consultation history error:', error);
    return errorResponse(res, error.message, 500, 'GET_CONSULTATION_HISTORY_ERROR');
  }
};

// POST /consultations/:appointmentId/start
// Patient presses "Start Consultation" — fetches the meeting URL
// already saved by the doctor backend into Consultation / Appointment.
const startConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patient_id: req.user.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    if (appointment.status !== 'confirmed')
      return errorResponse(res, 'Appointment is not confirmed yet', 400, 'APPOINTMENT_NOT_CONFIRMED');

    const consultation = await Consultation.findOne({
      where: { appointment_id: appointmentId },
    });

    // Doctor has not started the consultation yet — no link available
    if (!consultation || !consultation.meeting_url) {
      return errorResponse(
        res,
        'The doctor has not started the consultation yet. Please wait.',
        404,
        'CONSULTATION_NOT_STARTED'
      );
    }

    return successResponse(res, {
      consultationId: consultation.id,
      status: consultation.status,
      meetingUrl: consultation.meeting_url,
      startTime: consultation.start_time,
    });
  } catch (error) {
    console.error('Start consultation error:', error);
    return errorResponse(res, error.message, 500, 'START_CONSULTATION_ERROR');
  }
};

// POST /consultations/:appointmentId/chat
const sendConsultationMessage = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { message } = req.body;

    if (!message) return errorResponse(res, 'Message is required', 400, 'MISSING_FIELD');

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patient_id: req.user.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    const consultation = await Consultation.findOne({
      where: { appointment_id: appointmentId, status: 'active' },
    });
    if (!consultation)
      return errorResponse(res, 'No active consultation for this appointment', 404, 'NO_ACTIVE_CONSULTATION');

    const msg = await Message.create({
      sender_id: req.user.id,
      receiver_id: appointment.doctor_id,
      consultation_id: consultation.id,
      content: message,
      type: 'text',
      is_read: false,
    });

    return successResponse(res, {
      messageId: msg.id,
      consultationId: consultation.id,
      content: msg.content,
      sentAt: msg.created_at,
    }, 'Message sent', 201);
  } catch (error) {
    console.error('Send consultation message error:', error);
    return errorResponse(res, error.message, 500, 'CONSULTATION_CHAT_ERROR');
  }
};

// POST /consultations/:appointmentId/end
const endConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patient_id: req.user.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    const consultation = await Consultation.findOne({
      where: { appointment_id: appointmentId, status: 'active' },
    });
    if (!consultation)
      return errorResponse(res, 'No active consultation found', 404, 'NO_ACTIVE_CONSULTATION');

    await consultation.update({ status: 'completed', end_time: new Date() });
    await appointment.update({ status: 'completed' });

    return successResponse(res, {
      consultationId: consultation.id,
      status: 'completed',
      endTime: consultation.end_time,
    }, 'Consultation ended');
  } catch (error) {
    console.error('End consultation error:', error);
    return errorResponse(res, error.message, 500, 'END_CONSULTATION_ERROR');
  }
};

module.exports = {
  getConsultations,
  getConsultationById,
  getUpcomingConsultations,
  getConsultationHistory,
  startConsultation,
  sendConsultationMessage,
  endConsultation,
};