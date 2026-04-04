const axios = require('axios');
const { models:{SymptomSession, SymptomMessage} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');

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

const callGroqAI = async (conversationHistory) => {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      max_tokens: 600,
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.choices[0].message.content;
};

const parseAIResponse = (rawText) => {
  const actionMarker = 'ACTIONS:';
  const markerIndex = rawText.indexOf(actionMarker);

  if (markerIndex === -1) {
    return {
      message: rawText.trim(),
      suggestedActions: [{ label: 'Book Appointment', action: 'book_appointment', specialty: 'general' }],
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
      suggestedActions: [{ label: 'Book Appointment', action: 'book_appointment', specialty: 'general' }],
    };
  }
};

// POST /symptom-checker/start
// Creates a new SymptomSession in the DB
const startSession = async (req, res) => {
  try {
    const session = await SymptomSession.create({
      user_id: req.user.id,
      status: 'active',
    });

    return successResponse(res, {
      sessionId: session.id,
      status: session.status,
      disclaimer: 'This tool provides health information only, not a medical diagnosis. In an emergency, call 999 immediately.',
      disclaimerAccepted: false,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'START_SESSION_ERROR');
  }
};

// POST /symptom-checker/disclaimer/accept
// Stateless — client records disclaimer acceptance; session already created
const acceptDisclaimer = async (req, res) => {
  try {
    const { sessionId, accepted } = req.body;
    return successResponse(res, { sessionId, disclaimerAccepted: accepted, nextStep: 'chat' });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DISCLAIMER_ERROR');
  }
};

// POST /symptom-checker/chat
// Saves user + assistant messages to DB; session is identified by sessionId
const sendMessage = async (req, res) => {
  try {
    const { sessionId, message } = req.body;
 
    // Validate session belongs to this patient
    const session = await SymptomSession.findOne({
      where: { id: sessionId, user_id: req.user.id, status: 'active' },
    });
    if (!session)
      return errorResponse(res, 'Session not found or already closed', 404, 'SESSION_NOT_FOUND');
 
    // Auto-title: use first user message as session title
    if (!session.title) {
      const shortTitle = message.length > 80 ? message.slice(0, 77) + '...' : message;
      await session.update({ title: shortTitle });
    }
 
    // Load full conversation history from DB for context
    const previousMessages = await SymptomMessage.findAll({
      where: { session_id: sessionId },
      order: [['createdAt', 'ASC']],
    });
 
    // Map DB columns (sender/message) → Groq API format (role/content)
    const conversationHistory = previousMessages.map((m) => ({
      role: m.sender === 'patient' ? 'user' : 'assistant',
      content: m.message,
    }));
 
    // Add current user message
    conversationHistory.push({ role: 'user', content: message });
 
    // Save user message to DB
    await SymptomMessage.create({
      session_id: sessionId,
      sender: 'patient',
      message,
    });
 
    // Call Groq AI
    const rawAIResponse = await callGroqAI(conversationHistory);
    const { message: aiMessage, suggestedActions } = parseAIResponse(rawAIResponse);
 
    // Save assistant message to DB
    const assistantMsg = await SymptomMessage.create({
      session_id: sessionId,
      sender: 'ai',
      message: aiMessage,
      suggested_actions: suggestedActions,
    });
 
    return successResponse(res, {
      messageId: assistantMsg.id,
      aiResponse: aiMessage,
      timestamp: assistantMsg.created_at,
      suggestedActions,
    });
  } catch (error) {
    if (error.response?.status === 401)
      return errorResponse(res, 'AI service not configured. Check GROQ_API_KEY.', 503, 'AI_UNAVAILABLE');
    if (error.response?.status === 429)
      return errorResponse(res, 'AI service is busy, please try again in a moment.', 429, 'RATE_LIMITED');
    return errorResponse(res, error.message, 500, 'CHAT_ERROR');
  }
};
 
// GET /symptom-checker/:sessionId/history
// Returns all messages for a session from the DB
const getChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
 
    const session = await SymptomSession.findOne({
      where: { id: sessionId, user_id: req.user.id },
    });
     console.log(sessionId)
    if (!session) return errorResponse(res, 'Session not found', 404, 'SESSION_NOT_FOUND');
 
    const messages = await SymptomMessage.findAll({
      where: { session_id: sessionId },
      order: [['createdAt', 'ASC']],
    });
 
    return successResponse(res, {
      sessionId: session.id,
      status: session.status,
      disclaimerAccepted: session.disclaimer_accepted,
      createdAt: session.created_at,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        message: m.message,
        suggestedActions: m.suggested_actions || [],
        sentAt: m.created_at,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_CHAT_HISTORY_ERROR');
  }
};
 
// GET /symptom-checker/sessions
const getSessions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = { user_id: req.user.id };
    if (status) where.status = status;
 
    const { count, rows } = await SymptomSession.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
 
    return successResponse(res, {
      sessions: rows.map((s) => ({
        id: s.id,
        status: s.status,
        disclaimerAccepted: s.disclaimer_accepted,
        createdAt: s.created_at,
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SESSIONS_ERROR');
  }
};
 
// POST /symptom-checker/:sessionId/end
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
 
    const session = await SymptomSession.findOne({
      where: { id: sessionId, user_id: req.user.id },
    });
    if (!session) return errorResponse(res, 'Session not found', 404, 'SESSION_NOT_FOUND');
 
    await session.update({ status: 'ended' });
 
    return successResponse(res, { sessionId: session.id, status: 'ended' }, 'Session ended successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'END_SESSION_ERROR');
  }
};
 
module.exports = { startSession, acceptDisclaimer, sendMessage, getChatHistory, getSessions, endSession };
 