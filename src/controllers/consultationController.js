const { Consultation, Appointment, Message } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');

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
      status:         consultation.status,
      meetingUrl:     consultation.meeting_url,
      startTime:      consultation.start_time,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'START_CONSULTATION_ERROR');
  }
};

// POST /consultations/:appointmentId/chat
const sendConsultationMessage = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { message }       = req.body;

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
      sender_id:       req.user.id,
      receiver_id:     appointment.doctor_id,
      consultation_id: consultation.id,
      content:         message,
      type:            'text',
      is_read:         false,
    });

    return successResponse(res, {
      messageId:      msg.id,
      consultationId: consultation.id,
      content:        msg.content,
      sentAt:         msg.created_at,
    }, 'Message sent', 201);
  } catch (error) {
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
      status:         'completed',
      endTime:        consultation.end_time,
    }, 'Consultation ended');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'END_CONSULTATION_ERROR');
  }
};

module.exports = { startConsultation, sendConsultationMessage, endConsultation };