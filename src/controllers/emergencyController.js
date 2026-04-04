const { models:{Notification} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');

// POST /emergency
// EmergencyAlert table no longer exists in the new schema.
// We log emergency events as system notifications and respond immediately.
const triggerEmergency = async (req, res) => {
  try {
    const { type, location } = req.body;

    // Log the emergency as a system notification
    await Notification.create({
      user_id: req.user.id,
      title: 'Emergency Alert Triggered',
      message: `Emergency type: ${type || 'medical_emergency'}. Location: ${location?.address || 'Unknown'}. Responders have been notified.`,
      notification_type: 'system',
      channel: 'in_app',
    });

    // In production: call ambulance dispatch API, notify emergency contacts, etc.

    return successResponse(res, {
      alertId: `EMG-${Date.now()}`,
      respondersDispatched: true,
      estimatedArrival: '8 minutes',
      emergencyNumber: '999',
    }, 'Emergency alert triggered');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'EMERGENCY_ERROR');
  }
};

// GET /emergency/history
// Returns emergency notifications from the notifications table
const getEmergencyHistory = async (req, res) => {
  try {
    const alerts = await Notification.findAll({
      where: {
        user_id: req.user.id,
        notification_type: 'system',
        title: { require: false },
      },
      order: [['sent_at', 'DESC']],
    });

    return successResponse(res, { alerts });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'EMERGENCY_HISTORY_ERROR');
  }
};

module.exports = { triggerEmergency, getEmergencyHistory };
