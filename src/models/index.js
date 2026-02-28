const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

// PATIENT 
const Patient = sequelize.define('Patient', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `PAT-${Date.now()}` },
  fullName: { type: DataTypes.STRING(100), allowNull: false },
  phoneNumber: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(100), unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  dateOfBirth: DataTypes.DATEONLY,
  gender: DataTypes.ENUM('Male', 'Female', 'Other'),
  bloodType: DataTypes.STRING(5),
  bio: DataTypes.TEXT,
  profileImage: DataTypes.STRING(500),
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  twoFactorEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  twoFactorMethod: { type: DataTypes.ENUM('sms', 'email'), defaultValue: 'sms' },
  providerSharing: { type: DataTypes.BOOLEAN, defaultValue: true },
  researchOptIn: { type: DataTypes.BOOLEAN, defaultValue: false },
  lastPasswordChange: DataTypes.DATE,
}, {
  hooks: {
    beforeCreate: async (patient) => {
      if (patient.password) patient.password = await bcrypt.hash(patient.password, 12);
    },
    beforeUpdate: async (patient) => {
      if (patient.changed('password')) patient.password = await bcrypt.hash(patient.password, 12);
    },
  },
});

Patient.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

//  OTP 
const OTP = sequelize.define('OTP', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  phoneNumber: { type: DataTypes.STRING(20), allowNull: false },
  code: { type: DataTypes.STRING(6), allowNull: false },
  type: { type: DataTypes.ENUM('verification', 'reset', '2fa'), defaultValue: 'verification' },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  used: { type: DataTypes.BOOLEAN, defaultValue: false },
});

//  REFRESH TOKEN 
const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  token: { type: DataTypes.TEXT, allowNull: false },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  deviceId: DataTypes.STRING(100),
  platform: DataTypes.STRING(20),
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  revoked: { type: DataTypes.BOOLEAN, defaultValue: false },
});

// EMERGENCY CONTACT 
const EmergencyContact = sequelize.define('EmergencyContact', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  relationship: DataTypes.STRING(50),
  phone: { type: DataTypes.STRING(20), allowNull: false },
});

//  EMERGENCY ALERT 
const EmergencyAlert = sequelize.define('EmergencyAlert', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `EMG-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  type: { type: DataTypes.ENUM('medical_emergency', 'accident', 'other'), defaultValue: 'medical_emergency' },
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  address: DataTypes.STRING(255),
  status: { type: DataTypes.ENUM('triggered', 'dispatched', 'resolved'), defaultValue: 'triggered' },
  estimatedArrival: DataTypes.STRING(50),
});

//  ALLERGY 
const Allergy = sequelize.define('Allergy', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `ALG-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  allergen: { type: DataTypes.STRING(100), allowNull: false },
  reaction: DataTypes.STRING(255),
  severity: DataTypes.ENUM('mild', 'moderate', 'severe'),
  diagnosedDate: DataTypes.STRING(20),
});

//  CONDITION 
const Condition = sequelize.define('Condition', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `CON-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  condition: { type: DataTypes.STRING(100), allowNull: false },
  since: DataTypes.STRING(10),
  status: DataTypes.STRING(50),
  lastCheckup: DataTypes.DATE,
});

//  VITALS 
const Vital = sequelize.define('Vital', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  heartRate: DataTypes.INTEGER,
  bloodPressureSystolic: DataTypes.INTEGER,
  bloodPressureDiastolic: DataTypes.INTEGER,
  bloodGlucose: DataTypes.DECIMAL(5, 2),
  recordedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});


//  NOTIFICATION 
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `NOT-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  type: { type: DataTypes.ENUM('appointment', 'medication', 'lab', 'emergency', 'general'), defaultValue: 'general' },
  title: { type: DataTypes.STRING(150), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  icon: DataTypes.STRING(10),
  iconBg: DataTypes.STRING(10),
  read: { type: DataTypes.BOOLEAN, defaultValue: false },
  actionType: DataTypes.STRING(50),
  actionPayload: DataTypes.JSON,
});

//  SYMPTOM CHECKER SESSION 
const SymptomSession = sequelize.define('SymptomSession', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `SYM-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  status: { type: DataTypes.ENUM('active', 'ended'), defaultValue: 'active' },
  disclaimerAccepted: { type: DataTypes.BOOLEAN, defaultValue: false },
  consentToAIAnalysis: { type: DataTypes.BOOLEAN, defaultValue: false },
});

//  SYMPTOM MESSAGE 
const SymptomMessage = sequelize.define('SymptomMessage', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `MSG-${Date.now()}` },
  sessionId: { type: DataTypes.STRING(20), allowNull: false },
  sender: { type: DataTypes.ENUM('patient', 'ai'), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  suggestedActions: DataTypes.JSON,
});

//  SAVED LOCATION 
const SavedLocation = sequelize.define('SavedLocation', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `LOC-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  label: { type: DataTypes.ENUM('Home', 'Work', 'Other'), defaultValue: 'Home' },
  address: DataTypes.STRING(255),
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
});

//  MANUAL MEDICINE 
const ManualMedicine = sequelize.define('ManualMedicine', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `MED-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  name: { type: DataTypes.STRING(150), allowNull: false },
  dosage: DataTypes.STRING(100),
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  selected: { type: DataTypes.BOOLEAN, defaultValue: true },
});

//  DATA EXPORT REQUEST 
const DataExportRequest = sequelize.define('DataExportRequest', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `EXP-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  status: { type: DataTypes.ENUM('processing', 'ready', 'downloaded'), defaultValue: 'processing' },
  fileUrl: DataTypes.STRING(500),
  estimatedCompletion: DataTypes.STRING(50),
});

//  MEDICAL RECORD 
const MedicalRecord = sequelize.define('MedicalRecord', {
  id: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: () => `REC-${Date.now()}` },
  patientId: { type: DataTypes.STRING(20), allowNull: false },
  type: { type: DataTypes.ENUM('lab', 'vaccination', 'consultation', 'prescription', 'imaging'), allowNull: false },
  title: { type: DataTypes.STRING(150), allowNull: false },
  facility: DataTypes.STRING(150),
  fileUrl: DataTypes.STRING(500),
  date: DataTypes.DATEONLY,
});

// const TokenBlacklist = sequelize.define('TokenBlacklist', {
//   id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
//   token: { type: DataTypes.TEXT, allowNull: false },
//   patientId: { type: DataTypes.STRING(20), allowNull: false },
//   expiresAt: { type: DataTypes.DATE, allowNull: false },
// });

module.exports = {
  Patient, OTP, RefreshToken, EmergencyContact, EmergencyAlert,
  Allergy, Condition, Vital, Notification, SymptomSession, SymptomMessage,
  SavedLocation, ManualMedicine, DataExportRequest, MedicalRecord,
};

//  SPECIALIST (DOCTOR) 
// const Specialist = sequelize.define('Specialist', {
//   id: { type: DataTypes.STRING(15), primaryKey: true, defaultValue: () => `DOC-${Date.now()}` },
//   name: { type: DataTypes.STRING(100), allowNull: false },
//   specialty: { type: DataTypes.STRING(100), allowNull: false },
//   hospitalName: DataTypes.STRING(150),
//   hospitalAddress: DataTypes.STRING(255),
//   consultationFee: DataTypes.DECIMAL(10, 2),
//   rating: { type: DataTypes.DECIMAL(2, 1), defaultValue: 0.0 },
//   availableToday: { type: DataTypes.BOOLEAN, defaultValue: false },
//   profileImage: DataTypes.STRING(500),
//   isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
// });

//  APPOINTMENT SLOT 
// const AppointmentSlot = sequelize.define('AppointmentSlot', {
//   id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
//   specialistId: { type: DataTypes.STRING(15), allowNull: false },
//   date: { type: DataTypes.DATEONLY, allowNull: false },
//   time: { type: DataTypes.STRING(10), allowNull: false },
//   isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true },
// });

//  APPOINTMENT 
// const Appointment = sequelize.define('Appointment', {
//   id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: () => `APT-${Date.now()}` },
//   patientId: { type: DataTypes.STRING(20), allowNull: false },
//   specialistId: { type: DataTypes.STRING(15), allowNull: false },
//   slotId: DataTypes.INTEGER,
//   date: { type: DataTypes.DATEONLY, allowNull: false },
//   time: { type: DataTypes.STRING(10), allowNull: false },
//   type: DataTypes.STRING(100),
//   symptoms: DataTypes.TEXT,
//   notes: DataTypes.TEXT,
//   status: { type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed'), defaultValue: 'pending' },
//   paymentMethod: DataTypes.STRING(30),
//   paymentStatus: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), defaultValue: 'pending' },
//   totalCost: DataTypes.DECIMAL(10, 2),
// });

//  CONSULTATION 
// const Consultation = sequelize.define('Consultation', {
//   id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: () => `CON-${Date.now()}` },
//   appointmentId: { type: DataTypes.STRING(20), allowNull: false },
//   callToken: DataTypes.TEXT,
//   meetingUrl: DataTypes.STRING(500),
//   status: { type: DataTypes.ENUM('pending', 'active', 'ended'), defaultValue: 'pending' },
//   startedAt: DataTypes.DATE,
//   endedAt: DataTypes.DATE,
//   duration: DataTypes.STRING(10),
//   prescriptionAdded: { type: DataTypes.BOOLEAN, defaultValue: false },
//   followUpRecommended: { type: DataTypes.BOOLEAN, defaultValue: false },
// });

//  CONSULTATION MESSAGE 
// const ConsultationMessage = sequelize.define('ConsultationMessage', {
//   id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: () => `CHAT-${Date.now()}` },
//   consultationId: { type: DataTypes.STRING(20), allowNull: false },
//   sender: { type: DataTypes.ENUM('patient', 'doctor'), allowNull: false },
//   message: { type: DataTypes.TEXT, allowNull: false },
//   sentAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
// });

//  PRESCRIPTION 
// const Prescription = sequelize.define('Prescription', {
//   id: { type: DataTypes.STRING(15), primaryKey: true, defaultValue: () => `PRX-${Date.now()}` },
//   patientId: { type: DataTypes.STRING(20), allowNull: false },
//   specialistId: DataTypes.STRING(15),
//   appointmentId: DataTypes.STRING(20),
//   name: { type: DataTypes.STRING(150), allowNull: false },
//   dosage: DataTypes.STRING(100),
//   refillsRemaining: { type: DataTypes.INTEGER, defaultValue: 0 },
//   price: DataTypes.DECIMAL(10, 2),
//   isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
//   prescribedDate: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
// });

//  PHARMACY 
// const Pharmacy = sequelize.define('Pharmacy', {
//   id: { type: DataTypes.STRING(15), primaryKey: true, defaultValue: () => `PH-${Date.now()}` },
//   name: { type: DataTypes.STRING(100), allowNull: false },
//   branch: DataTypes.STRING(100),
//   address: DataTypes.STRING(255),
//   latitude: DataTypes.DECIMAL(10, 8),
//   longitude: DataTypes.DECIMAL(11, 8),
//   rating: { type: DataTypes.DECIMAL(2, 1), defaultValue: 0.0 },
//   openNow: { type: DataTypes.BOOLEAN, defaultValue: true },
//   phone: DataTypes.STRING(20),
//   isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
// });

//  REFILL ORDER 
// const RefillOrder = sequelize.define('RefillOrder', {
//   id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: () => `REF-${Date.now()}` },
//   patientId: { type: DataTypes.STRING(20), allowNull: false },
//   pharmacyId: DataTypes.STRING(15),
//   fulfillmentType: { type: DataTypes.ENUM('delivery', 'pickup'), defaultValue: 'delivery' },
//   pharmacistNotes: DataTypes.TEXT,
//   deliveryAddress: DataTypes.STRING(255),
//   deliveryCoordinatesLat: DataTypes.DECIMAL(10, 8),
//   deliveryCoordinatesLng: DataTypes.DECIMAL(11, 8),
//   deliveryInstructions: DataTypes.TEXT,
//   subtotal: DataTypes.DECIMAL(10, 2),
//   deliveryFee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 150.00 },
//   total: DataTypes.DECIMAL(10, 2),
//   status: { type: DataTypes.ENUM('pending', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'), defaultValue: 'pending' },
//   paymentMethod: DataTypes.STRING(30),
//   paymentStatus: { type: DataTypes.ENUM('pending', 'paid', 'failed'), defaultValue: 'pending' },
//   estimatedReady: DataTypes.STRING(50),
// });

//  REFILL ORDER ITEM 
// const RefillOrderItem = sequelize.define('RefillOrderItem', {
//   id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
//   refillOrderId: { type: DataTypes.STRING(20), allowNull: false },
//   prescriptionId: { type: DataTypes.STRING(15), allowNull: false },
//   quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
//   price: DataTypes.DECIMAL(10, 2),
// });

//  PAYMENT 
// const Payment = sequelize.define('Payment', {
//   id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: () => `TXN-${Date.now()}` },
//   patientId: { type: DataTypes.STRING(20), allowNull: false },
//   refillOrderId: DataTypes.STRING(20),
//   appointmentId: DataTypes.STRING(20),
//   method: { type: DataTypes.ENUM('m_pesa', 'cash', 'card'), defaultValue: 'm_pesa' },
//   phoneNumber: DataTypes.STRING(20),
//   amount: DataTypes.DECIMAL(10, 2),
//   status: { type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'), defaultValue: 'pending' },
//   receiptNumber: DataTypes.STRING(50),
//   mpesaReceiptNumber: DataTypes.STRING(50),
//   expiresAt: DataTypes.DATE,
// });

//  DELIVERY 
// const Delivery = sequelize.define('Delivery', {
//   id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
//   refillOrderId: { type: DataTypes.STRING(20), allowNull: false },
//   courierName: DataTypes.STRING(100),
//   courierPhone: DataTypes.STRING(20),
//   courierRating: DataTypes.DECIMAL(2, 1),
//   riderLat: DataTypes.DECIMAL(10, 8),
//   riderLng: DataTypes.DECIMAL(11, 8),
//   estimatedArrival: DataTypes.STRING(20),
//   status: { type: DataTypes.ENUM('assigned', 'picked_up', 'out_for_delivery', 'delivered'), defaultValue: 'assigned' },
// });