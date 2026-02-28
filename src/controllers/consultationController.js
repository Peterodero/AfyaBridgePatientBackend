const { Consultation, ConsultationMessage, Appointment } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const { v4: uuidv4 } = require('uuid');

// POST /consultations/:appointmentId/start
const startConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, patientId: req.patient.id },
      include: [{ model: require('../models').Specialist }],
    });

    if (!appointment) return errorResponse(res, 'Appointment not found', 404, 'NOT_FOUND');

    let consultation = await Consultation.findOne({ where: { appointmentId } });

    if (!consultation) {
      consultation = await Consultation.create({
        appointmentId,
        callToken: `video_token_${uuidv4()}`,
        meetingUrl: `https://meet.afyabridge.co.ke/${appointmentId}`,
        status: 'active',
        startedAt: new Date(),
      });
      await appointment.update({ status: 'confirmed' });
    }

    return successResponse(res, {
      appointmentId,
      doctor: {
        name: appointment.Specialist?.name,
        specialty: appointment.Specialist?.specialty,
      },
      callStatus: consultation.status,
      duration: '00:00',
      callToken: consultation.callToken,
      meetingUrl: consultation.meetingUrl,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'START_CONSULTATION_ERROR');
  }
};

// POST /consultations/:appointmentId/chat
const sendConsultationMessage = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { message } = req.body;

    const consultation = await Consultation.findOne({ where: { appointmentId } });
    if (!consultation) return errorResponse(res, 'Consultation not found', 404, 'NOT_FOUND');

    const chatMsg = await ConsultationMessage.create({
      consultationId: consultation.id,
      sender: 'patient',
      message,
    });

    return successResponse(res, {
      messageId: chatMsg.id,
      message: chatMsg.message,
      timestamp: chatMsg.sentAt,
      sender: 'patient',
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CONSULTATION_CHAT_ERROR');
  }
};

// POST /consultations/:appointmentId/end
const endConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const consultation = await Consultation.findOne({ where: { appointmentId } });
    if (!consultation) return errorResponse(res, 'Consultation not found', 404, 'NOT_FOUND');

    const endedAt = new Date();
    const startedAt = consultation.startedAt || endedAt;
    const durationMs = endedAt - startedAt;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const duration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    await consultation.update({ status: 'ended', endedAt, duration });
    await Appointment.update({ status: 'completed' }, { where: { id: appointmentId } });

    return successResponse(res, {
      duration,
      prescriptionAdded: consultation.prescriptionAdded,
      followUpRecommended: consultation.followUpRecommended,
    }, 'Consultation ended');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'END_CONSULTATION_ERROR');
  }
};

module.exports = { startConsultation, sendConsultationMessage, endConsultation };
