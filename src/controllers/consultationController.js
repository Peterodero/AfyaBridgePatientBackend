const { models: {Appointment} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const serviceClient = require('../utils/serviceClients');

// POST /consultations/:appointmentId/start
// Delegates to doctor backend — doctor backend creates Consultation record
const startConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patient_id: req.user.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    const result = await serviceClient('doctor', 'POST', `/consultations/${appointmentId}/start`, {
      patientId: req.user.id,
    });

    if (!result.success) {
      return errorResponse(res, 'Consultation service is currently unavailable.', 503, 'CONSULTATION_SERVICE_UNAVAILABLE');
    }

    return successResponse(res, result.data);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'START_CONSULTATION_ERROR');
  }
};

// POST /consultations/:appointmentId/chat
// Delegates to doctor backend — doctor backend owns ConsultationMessage records
const sendConsultationMessage = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { message } = req.body;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patient_id: req.user.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    const result = await serviceClient('doctor', 'POST', `/consultations/${appointmentId}/chat`, {
      patientId: req.user.id,
      message,
      sender: 'patient',
    });

    if (!result.success) {
      return errorResponse(res, 'Consultation service is currently unavailable.', 503, 'CONSULTATION_SERVICE_UNAVAILABLE');
    }

    return successResponse(res, result.data);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CONSULTATION_CHAT_ERROR');
  }
};

// POST /consultations/:appointmentId/end
// Delegates to doctor backend
const endConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patient_id: req.user.id },
    });
    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    const result = await serviceClient('doctor', 'POST', `/consultations/${appointmentId}/end`, {
      patientId: req.user.id,
    });

    if (!result.success) {
      return errorResponse(res, 'Consultation service is currently unavailable.', 503, 'CONSULTATION_SERVICE_UNAVAILABLE');
    }

    return successResponse(res, result.data, 'Consultation ended');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'END_CONSULTATION_ERROR');
  }
};

module.exports = { startConsultation, sendConsultationMessage, endConsultation };
