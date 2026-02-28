const { SymptomSession, SymptomMessage } = require("../models");
const { successResponse, errorResponse } = require("../utils/response");

// POST /symptom-checker/start
const startSession = async (req, res) => {
  try {
    const { consentToAIAnalysis } = req.body;

    const session = await SymptomSession.create({
      patientId: req.patient.id,
      consentToAIAnalysis: consentToAIAnalysis || false,
    });

    return successResponse(res, {
      sessionId: session.id,
      status: session.status,
      disclaimer:
        "This tool provides information, not medical advice. In an emergency, call 999 immediately.",
      disclaimerAccepted: false,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "START_SESSION_ERROR");
  }
};

// POST /symptom-checker/disclaimer/accept
const acceptDisclaimer = async (req, res) => {
  try {
    const { sessionId, accepted } = req.body;

    const session = await SymptomSession.findOne({
      where: { id: sessionId, patientId: req.patient.id },
    });
    if (!session)
      return errorResponse(res, "Session not found", 404, "NOT_FOUND");

    await session.update({ disclaimerAccepted: accepted });

    return successResponse(res, {
      disclaimerAccepted: accepted,
      nextStep: "chat",
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "DISCLAIMER_ERROR");
  }
};

// POST /symptom-checker/chat
const sendMessage = async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    const session = await SymptomSession.findOne({
      where: { id: sessionId, patientId: req.patient.id },
    });
    if (!session)
      return errorResponse(res, "Session not found", 404, "NOT_FOUND");
    if (!session.disclaimerAccepted)
      return errorResponse(
        res,
        "Please accept the disclaimer first",
        400,
        "DISCLAIMER_NOT_ACCEPTED",
      );

    // Save patient message
    await SymptomMessage.create({ sessionId, sender: "patient", message });

    // Generate AI response (mock — replace with OpenAI/Gemini API in production)
    const aiResponse = generateAIResponse(message);
    const suggestedActions = getSuggestedActions(message);

    const aiMsg = await SymptomMessage.create({
      sessionId,
      sender: "ai",
      message: aiResponse,
      suggestedActions,
    });

    return successResponse(res, {
      messageId: aiMsg.id,
      aiResponse,
      timestamp: aiMsg.createdAt,
      suggestedActions,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "CHAT_ERROR");
  }
};

// GET /symptom-checker/:sessionId/history
const getChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await SymptomSession.findOne({
      where: { id: sessionId, patientId: req.patient.id },
    });
    if (!session)
      return errorResponse(res, "Session not found", 404, "NOT_FOUND");

    const messages = await SymptomMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "ASC"]],
    });

    return successResponse(res, {
      sessionId,
      status: session.status,
      disclaimerAccepted: session.disclaimerAccepted,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        message: m.message,
        suggestedActions: m.suggestedActions,
        timestamp: m.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_CHAT_HISTORY_ERROR");
  }
};

// POST /symptom-checker/:sessionId/end
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await SymptomSession.findOne({
      where: { id: sessionId, patientId: req.patient.id },
    });
    if (!session)
      return errorResponse(res, "Session not found", 404, "NOT_FOUND");

    await session.update({ status: "ended" });

    return successResponse(
      res,
      {
        sessionId,
        status: "ended",
      },
      "Session ended successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "END_SESSION_ERROR");
  }
};

// Simple keyword-based mock AI response (replace with real AI in production)
const generateAIResponse = (message) => {
  const msg = message.toLowerCase();
  if (msg.includes("chest pain") || msg.includes("shortness of breath")) {
    return "I understand your concern. Chest pain combined with shortness of breath requires immediate medical attention. Please consider calling emergency services or visiting the nearest hospital.";
  }
  if (msg.includes("headache") || msg.includes("fever")) {
    return "Headaches with fever could indicate various conditions. How long have you been experiencing these symptoms? Please monitor your temperature and rest.";
  }
  return "Thank you for sharing your symptoms. Can you provide more details about when they started and their severity?";
};

const getSuggestedActions = (message) => {
  const msg = message.toLowerCase();
  if (msg.includes("chest pain") || msg.includes("emergency")) {
    return [
      {
        label: "Book Cardiologist",
        action: "book_appointment",
        specialty: "cardiology",
      },
      { label: "Emergency", action: "emergency" },
    ];
  }
  return [{ label: "Book Appointment", action: "book_appointment" }];
};

module.exports = {
  startSession,
  acceptDisclaimer,
  sendMessage,
  startSession,
  acceptDisclaimer,
  sendMessage,
  getChatHistory,
  endSession,
};
