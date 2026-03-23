const { Message, User, Appointment } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const { getIO, isUserOnline } = require('../config/socket');
const { Op } = require('sequelize');

// ─── Helper: patient must have an appointment with doctor ────────────────────
const verifyRelationship = async (patientId, doctorId) => {
  const appt = await Appointment.findOne({
    where: { patient_id: patientId, doctor_id: doctorId, status: { [Op.notIn]: ['cancelled'] } },
  });
  return !!appt;
};

// GET /chat/conversations
// WhatsApp-style inbox — one row per unique doctor, last message + unread count
const getConversations = async (req, res) => {
  try {
    const patientId = req.user.id;

    const messages = await Message.findAll({
      where: { patient_id: patientId },
      order: [['created_at', 'DESC']],
    });

    // Group by doctor — keep only the latest message per doctor
    const conversationMap = new Map();
    for (const msg of messages) {
      if (!conversationMap.has(msg.doctor_id)) conversationMap.set(msg.doctor_id, msg);
    }

    // Unread counts per doctor
    const unreadRows = await Message.findAll({
      where: { patient_id: patientId, receiver_id: patientId, is_read: false },
      attributes: ['doctor_id'],
    });
    const unreadMap = {};
    for (const m of unreadRows) unreadMap[m.doctor_id] = (unreadMap[m.doctor_id] || 0) + 1;

    // Fetch doctor profiles
    const doctorIds = [...conversationMap.keys()];
    const doctors = await User.findAll({
      where: { id: doctorIds },
      attributes: ['id', 'full_name', 'specialty', 'profile_image'],
    });
    const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d]));

    const conversations = doctorIds.map((doctorId) => {
      const lastMsg = conversationMap.get(doctorId);
      const doctor  = doctorMap[doctorId];
      return {
        doctorId,
        doctorName:         doctor?.full_name    || 'Unknown',
        doctorSpecialty:    doctor?.specialty    || null,
        doctorProfileImage: doctor?.profile_image || null,
        isOnline:           isUserOnline(doctorId),
        lastMessage: {
          id:       lastMsg.id,
          content:  lastMsg.message_type === 'text' ? lastMsg.content : `📎 ${lastMsg.message_type}`,
          sentAt:   lastMsg.created_at,
          sentByMe: lastMsg.sender_id === patientId,
        },
        unreadCount: unreadMap[doctorId] || 0,
      };
    });

    conversations.sort((a, b) => new Date(b.lastMessage.sentAt) - new Date(a.lastMessage.sentAt));

    return successResponse(res, { conversations });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_CONVERSATIONS_ERROR');
  }
};

// GET /chat/:doctorId/messages?page=1&limit=30
// Load message history + auto-mark as read
const getMessages = async (req, res) => {
  try {
    const patientId       = req.user.id;
    const { doctorId }    = req.params;
    const { page = 1, limit = 30 } = req.query;

    const doctor = await User.findOne({
      where: { id: doctorId, role: 'doctor' },
      attributes: ['id', 'full_name', 'specialty', 'profile_image'],
    });
    if (!doctor) return errorResponse(res, 'Doctor not found', 404, 'NOT_FOUND');

    const { count, rows } = await Message.findAndCountAll({
      where: { patient_id: patientId, doctor_id: doctorId },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    // Mark doctor's messages to this patient as read
    await Message.update(
      { is_read: true, read_at: new Date() },
      { where: { patient_id: patientId, doctor_id: doctorId, receiver_id: patientId, is_read: false } }
    );

    // Notify doctor via socket that messages were read
    try {
      getIO().to(doctorId).emit('messages_read', { byUserId: patientId, readAt: new Date() });
    } catch (_) {}

    return successResponse(res, {
      doctor: {
        id:           doctor.id,
        name:         doctor.full_name,
        specialty:    doctor.specialty,
        profileImage: doctor.profile_image,
        isOnline:     isUserOnline(doctorId),
      },
      messages: rows.map((m) => ({
        id:          m.id,
        content:     m.content,
        messageType: m.message_type,
        fileUrl:     m.file_url,
        sentByMe:    m.sender_id === patientId,
        isRead:      m.is_read,
        readAt:      m.read_at,
        sentAt:      m.created_at,
      })),
      pagination: {
        total:      count,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_MESSAGES_ERROR');
  }
};

// POST /chat/:doctorId/send
// REST fallback for sending — also pushes via socket if doctor is online
const sendMessage = async (req, res) => {
  try {
    const patientId        = req.user.id;
    const { doctorId }     = req.params;
    const { content, messageType = 'text', fileUrl } = req.body;

    const doctor = await User.findOne({
      where: { id: doctorId, role: 'doctor' },
      attributes: ['id', 'full_name'],
    });
    if (!doctor) return errorResponse(res, 'Doctor not found', 404, 'DOCTOR_NOT_FOUND');

    const hasRelationship = await verifyRelationship(patientId, doctorId);
    if (!hasRelationship)
      return errorResponse(res, 'You can only message doctors you have an appointment with.', 403, 'NO_RELATIONSHIP');

    if (!content && !fileUrl)
      return errorResponse(res, 'Message content is required', 400, 'MISSING_CONTENT');

    const message = await Message.create({
      sender_id:    patientId,
      receiver_id:  doctorId,
      patient_id:   patientId,
      doctor_id:    doctorId,
      content:      content || '',
      message_type: messageType,
      file_url:     fileUrl || null,
      is_read:      false,
    });

    const payload = {
      id:          message.id,
      senderId:    patientId,
      senderName:  req.user.full_name,
      content:     message.content,
      messageType: message.message_type,
      fileUrl:     message.file_url,
      isRead:      false,
      sentAt:      message.created_at,
    };

    // Push to doctor in real-time if they are connected
    try {
      getIO().to(doctorId).emit('new_message', payload);
    } catch (_) {}

    return successResponse(res, payload, 'Message sent', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEND_MESSAGE_ERROR');
  }
};

// PATCH /chat/:doctorId/read
const markAsRead = async (req, res) => {
  try {
    const patientId    = req.user.id;
    const { doctorId } = req.params;

    const [updated] = await Message.update(
      { is_read: true, read_at: new Date() },
      { where: { patient_id: patientId, doctor_id: doctorId, receiver_id: patientId, is_read: false } }
    );

    try { getIO().to(doctorId).emit('messages_read', { byUserId: patientId, readAt: new Date() }); } catch (_) {}

    return successResponse(res, { markedRead: updated });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MARK_READ_ERROR');
  }
};

// GET /chat/unread/count
const getUnreadCount = async (req, res) => {
  try {
    const count = await Message.count({
      where: { receiver_id: req.user.id, is_read: false },
    });
    return successResponse(res, { unreadCount: count });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_UNREAD_COUNT_ERROR');
  }
};

// DELETE /chat/message/:messageId
const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findOne({
      where: { id: req.params.messageId, sender_id: req.user.id },
    });
    if (!message) return errorResponse(res, 'Message not found', 404, 'NOT_FOUND');

    await message.destroy();

    // Notify receiver the message was deleted
    try { getIO().to(message.receiver_id).emit('message_deleted', { messageId: message.id }); } catch (_) {}

    return successResponse(res, null, 'Message deleted');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_MESSAGE_ERROR');
  }
};

module.exports = { getConversations, getMessages, sendMessage, markAsRead, getUnreadCount, deleteMessage };
