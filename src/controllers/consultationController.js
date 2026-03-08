const { Consultation, ConsultationMessage, Appointment, Specialist } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');

// POST /consultations/:appointmentId/start
// Patient backend delegates to doctor backend which owns consultations.
// Doctor backend creates the Consultation record, generates callToken and meetingUrl.
// Patient backend can then read the result from shared DB.
const startConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // Verify appointment belongs to this patient
    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patientId: req.patient.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    // Forward to doctor backend — it will create Consultation record and return call details
    const result = await serviceClient('doctor', 'POST', `/consultations/${appointmentId}/start`, {
      patientId: req.patient.id,
    });

    if (!result.success) {
      return errorResponse(res, result.error, result.status, 'CONSULTATION_SERVICE_ERROR');
    }

    return successResponse(res, result.data);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'START_CONSULTATION_ERROR');
  }
};

// POST /consultations/:appointmentId/chat
// Patient sends a message during the consultation.
// Doctor backend owns ConsultationMessage records.
const sendConsultationMessage = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { message } = req.body;

    // Verify appointment belongs to this patient
    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patientId: req.patient.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    // Forward message to doctor backend
    const result = await serviceClient('doctor', 'POST', `/consultations/${appointmentId}/chat`, {
      patientId: req.patient.id,
      message,
      sender: 'patient',
    });

    if (!result.success) {
      return errorResponse(res, result.error, result.status, 'CONSULTATION_SERVICE_ERROR');
    }

    return successResponse(res, result.data);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CONSULTATION_CHAT_ERROR');
  }
};

// POST /consultations/:appointmentId/end
// Patient ends the consultation.
// Doctor backend updates Consultation status, calculates duration, marks appointment complete.
const endConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // Verify appointment belongs to this patient
    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patientId: req.patient.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    // Forward to doctor backend
    const result = await serviceClient('doctor', 'POST', `/consultations/${appointmentId}/end`, {
      patientId: req.patient.id,
    });

    if (!result.success) {
      return errorResponse(res, result.error, result.status, 'CONSULTATION_SERVICE_ERROR');
    }

    return successResponse(res, result.data, 'Consultation ended');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'END_CONSULTATION_ERROR');
  }
};

module.exports = { startConsultation, sendConsultationMessage, endConsultation };