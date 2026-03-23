
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { errorHandler } = require('./middleware/errorHandler');

// Import all routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const {
  patientRouter, emergencyRouter, symptomRouter,
  specialistRouter, appointmentRouter, medsRouter,
  prescriptionRouter, pharmacyRouter, orderRouter,
  paymentRouter, notificationRouter, consultationRouter,
  locationRouter, medicineRouter,
  walletRouter, chatRouter,
} = require('./routes/index');

const app = express();
const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;

//  SECURITY MIDDLEWARE 
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://afyabridge.co.ke', 'https://app.afyabridge.co.ke']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

//  RATE LIMITING 
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' } } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth attempts, please try again later.' } } });

app.use(globalLimiter);

//  BODY PARSING 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

//  HEALTH CHECK 
app.get('/health', (req, res) => {
  res.json({ status: 'OK', version: process.env.API_VERSION || 'v1', timestamp: new Date().toISOString() });
});

//  ROUTES 
app.use(`${API_PREFIX}/auth`, authLimiter, authRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/patient`, patientRouter);
app.use(`${API_PREFIX}/emergency`, emergencyRouter);
app.use(`${API_PREFIX}/symptom-checker`, symptomRouter);
app.use(`${API_PREFIX}/doctors`, specialistRouter);
app.use(`${API_PREFIX}/appointments`, appointmentRouter);
app.use(`${API_PREFIX}/meds`, medsRouter);
app.use(`${API_PREFIX}/prescriptions`, prescriptionRouter);
app.use(`${API_PREFIX}/pharmacies`, pharmacyRouter);
app.use(`${API_PREFIX}/orders`, orderRouter);
app.use(`${API_PREFIX}/payments`, paymentRouter);
app.use(`${API_PREFIX}/wallet`, walletRouter);
app.use(`${API_PREFIX}/notifications`, notificationRouter);
app.use(`${API_PREFIX}/consultations`, consultationRouter);
app.use(`${API_PREFIX}/locations`, locationRouter);
app.use(`${API_PREFIX}/medicines`, medicineRouter);
app.use(`${API_PREFIX}/chat`, chatRouter);

//  404 HANDLER 
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, timestamp: new Date().toISOString() } });
});

//  ERROR HANDLER 
app.use(errorHandler);


module.exports = app;
