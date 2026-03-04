const axios = require("axios");
const { SymptomSession, SymptomMessage } = require("../models");
const { successResponse, errorResponse } = require("../utils/response");

//  System prompt for the AI symptom checker 
const SYSTEM_PROMPT = `You are AfyaBridge's medical symptom checker assistant, helping patients in Kenya understand their symptoms and decide on next steps.

Your role:
- Ask clear, focused follow-up questions to understand the patient's symptoms better
- Provide helpful, accurate health information in plain language
- Always recommend professional medical care for anything beyond very mild symptoms
- Be aware of common health conditions in Kenya (malaria, typhoid, TB, hypertension, diabetes, etc.)
- Be empathetic and calm, especially with anxious patients

Rules you must always follow:
- NEVER diagnose. You can describe possible causes but always frame them as possibilities, not certainties
- ALWAYS recommend emergency services (999 or nearest hospital) for life-threatening symptoms
- Keep responses concise — 2 to 4 sentences for simple cases, slightly longer only when explaining serious situations
- Do not suggest specific prescription medications
- If a patient mentions suicidal thoughts or self-harm, prioritize their mental safety above all else

At the end of every response, you must output a JSON block with suggested actions for the app UI. Format it exactly like this, with no extra text after it:

ACTIONS:{"actions":[{"label":"Book Appointment","action":"book_appointment","specialty":"general"},{"label":"Emergency","action":"emergency"}]}

Only include actions that are genuinely appropriate. Available action types:
- {"label":"Book Appointment","action":"book_appointment","specialty":"general|cardiology|neurology|pediatrics|gynecology|dermatology|orthopedics|psychiatry|ophthalmology|ent|urology"}
- {"label":"Call Emergency (999)","action":"emergency"}
- {"label":"Go to Nearest Hospital","action":"nearest_hospital"}
- {"label":"Buy OTC Medication","action":"otc_medication","suggestion":"e.g. paracetamol for mild fever"}
- {"label":"Monitor at Home","action":"monitor"}`;

//  Call Groq API (free — Llama 3.3 70B) 
const callGroqAI = async (conversationHistory) => {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      max_tokens: 600,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory,
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content;
};

//  Parse AI response into message + suggested actions 
const parseAIResponse = (rawText) => {
  const actionMarker = "ACTIONS:";
  const markerIndex = rawText.indexOf(actionMarker);

  if (markerIndex === -1) {
    return {
      message: rawText.trim(),
      suggestedActions: [{ label: "Book Appointment", action: "book_appointment", specialty: "general" }],
    };
  }

  const message = rawText.slice(0, markerIndex).trim();
  const jsonStr = rawText.slice(markerIndex + actionMarker.length).trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return { message, suggestedActions: parsed.actions || [] };
  } catch {
    return {
      message,
      suggestedActions: [{ label: "Book Appointment", action: "book_appointment", specialty: "general" }],
    };
  }
};

//  POST /symptom-checker/start 
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
        "This tool provides health information only, not a medical diagnosis. In an emergency, call 999 immediately.",
      disclaimerAccepted: false,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "START_SESSION_ERROR");
  }
};

//  POST /symptom-checker/disclaimer/accept 
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

//  POST /symptom-checker/chat 
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
        "DISCLAIMER_NOT_ACCEPTED"
      );

    // Save patient's message first
    await SymptomMessage.create({ sessionId, sender: "patient", message });

    // Fetch full conversation history to give AI full context
    const previousMessages = await SymptomMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "ASC"]],
    });

    // Map to OpenAI-compatible format (patient=user, ai=assistant)
    const conversationHistory = previousMessages.map((m) => ({
      role: m.sender === "patient" ? "user" : "assistant",
      content:
        m.sender === "ai"
          ? `${m.message}\n\nACTIONS:${JSON.stringify({ actions: m.suggestedActions || [] })}`
          : m.message,
    }));

    // Call Groq AI with full conversation context
    const rawAIResponse = await callGroqAI(conversationHistory);
    const { message: aiMessage, suggestedActions } = parseAIResponse(rawAIResponse);

    // Save AI response to DB
    const aiMsg = await SymptomMessage.create({
      sessionId,
      sender: "ai",
      message: aiMessage,
      suggestedActions,
    });

    return successResponse(res, {
      messageId: aiMsg.id,
      aiResponse: aiMessage,
      timestamp: aiMsg.createdAt,
      suggestedActions,
    });
  } catch (error) {
    if (error.response?.status === 401) {
      return errorResponse(res, "AI service not configured. Check GROQ_API_KEY.", 503, "AI_UNAVAILABLE");
    }
    if (error.response?.status === 429) {
      return errorResponse(res, "AI service is busy, please try again in a moment.", 429, "RATE_LIMITED");
    }
    return errorResponse(res, error.message, 500, "CHAT_ERROR");
  }
};

//  GET /symptom-checker/:sessionId/history 
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

//  POST /symptom-checker/:sessionId/end 
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
      { sessionId, status: "ended" },
      "Session ended successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "END_SESSION_ERROR");
  }
};

module.exports = {
  startSession,
  acceptDisclaimer,
  sendMessage,
  getChatHistory,
  endSession,
};