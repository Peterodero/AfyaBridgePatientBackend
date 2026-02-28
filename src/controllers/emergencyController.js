const { EmergencyAlert } = require("../models");
const { successResponse, errorResponse } = require("../utils/response");

// POST /emergency
const triggerEmergency = async (req, res) => {
  try {
    const { type, location, emergencyContact, ambulance } = req.body;

    const alert = await EmergencyAlert.create({
      patientId: req.patient.id,
      type: type || "medical_emergency",
      latitude: location?.latitude,
      longitude: location?.longitude,
      address: location?.address,
      status: "dispatched",
      estimatedArrival: "8 minutes",
    });

    // In production: notify emergency contacts, dispatch ambulance via API, etc.
    console.log(`🚨 Emergency alert triggered for patient ${req.patient.id}`);

    return successResponse(
      res,
      {
        alertId: alert.id,
        respondersDispatched: true,
        estimatedArrival: alert.estimatedArrival,
        emergencyNumber: "999",
      },
      "Emergency alert triggered",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "EMERGENCY_ERROR");
  }
};

// GET /emergency/history
const getEmergencyHistory = async (req, res) => {
  try {
    const alerts = await EmergencyAlert.findAll({
      where: { patientId: req.patient.id },
      order: [["createdAt", "DESC"]],
    });
    return successResponse(res, { alerts });
  } catch (error) {
    return errorResponse(res, error.message, 500, "EMERGENCY_HISTORY_ERROR");
  }
};

module.exports = { triggerEmergency, getEmergencyHistory };