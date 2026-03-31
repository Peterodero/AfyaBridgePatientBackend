const { DataTypes, UUIDV4 } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

// USER
// Single table for all user types: patient, doctor, rider,
// pharmacist, admin. Role-specific fields are nullable.
const User = sequelize.define('User', {
  id:                           { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  role:                         { type: DataTypes.ENUM('patient','doctor','pharmacist','rider','admin'), allowNull: false },
  full_name:                    { type: DataTypes.STRING(255), allowNull: false },
  email:                        { type: DataTypes.STRING(255), unique: true, allowNull: false },
  password_hash:                { type: DataTypes.STRING(255), allowNull: false },
  phone_number:                 { type: DataTypes.STRING(20), unique: true },
  profile_image:                { type: DataTypes.STRING(500) },
  initials:                     { type: DataTypes.STRING(10) },
  is_active:                    { type: DataTypes.BOOLEAN, defaultValue: true },
  is_verified:                  { type: DataTypes.BOOLEAN, defaultValue: false },
  two_factor_enabled:           { type: DataTypes.BOOLEAN, defaultValue: false },
  two_factor_method:            { type: DataTypes.ENUM('sms','email','app'), defaultValue: 'sms' },
  two_factor_phone:             { type: DataTypes.STRING(20) },
  last_password_change:         { type: DataTypes.DATE },
  last_login:                   { type: DataTypes.DATE },
  account_status:               { type: DataTypes.ENUM('active','suspended','locked','disabled'), defaultValue: 'active' },
  status_reason:                { type: DataTypes.STRING(255) },
  bio:                          { type: DataTypes.TEXT },
  gender:                       { type: DataTypes.STRING(20) },
  date_of_birth:                { type: DataTypes.STRING(50) },
  age:                          { type: DataTypes.INTEGER },
  blood_type:                   { type: DataTypes.STRING(10) },
  address:                      { type: DataTypes.STRING(255) },
  provider_sharing:             { type: DataTypes.BOOLEAN, defaultValue: true },
  research_opt_in:              { type: DataTypes.BOOLEAN, defaultValue: false },
  // Patient JSON columns
  emergency_contacts:           { type: DataTypes.JSON },
  allergies:                    { type: DataTypes.JSON },
  surgeries:                    { type: DataTypes.JSON },
  visits:                       { type: DataTypes.JSON },
  conditions:                   { type: DataTypes.JSON },
  documents:                    { type: DataTypes.JSON },
  // Doctor-specific
  specialty:                    { type: DataTypes.STRING(255) },
  kmpdc_license:                { type: DataTypes.STRING(100) },
  hospital:                     { type: DataTypes.STRING(255) },
  consultation_fee:             { type: DataTypes.FLOAT },
  allow_video_consultations:    { type: DataTypes.BOOLEAN },
  allow_in_person_consultations:{ type: DataTypes.BOOLEAN },
  working_hours:                { type: DataTypes.JSON },
  slot_duration:                { type: DataTypes.INTEGER },
  auto_confirm_appointments:    { type: DataTypes.BOOLEAN },
  rating:                       { type: DataTypes.FLOAT, defaultValue: 0 },
  total_reviews:                { type: DataTypes.INTEGER, defaultValue: 0 },
  verification_status:          { type: DataTypes.ENUM('pending_verification','verified','rejected') },
  verified_at:                  { type: DataTypes.DATE },
  verified_by:                  { type: DataTypes.STRING(100) },
  // Rider-specific
  national_id:                  { type: DataTypes.STRING(50) },
  vehicle_type:                 { type: DataTypes.STRING(100) },
  plate_number:                 { type: DataTypes.STRING(50) },
  driving_license_no:           { type: DataTypes.STRING(100) },
  license_expiry:               { type: DataTypes.DATE },
  id_verified:                  { type: DataTypes.BOOLEAN, defaultValue: false },
  license_verified:             { type: DataTypes.BOOLEAN, defaultValue: false },
  approved_status:              { type: DataTypes.ENUM('pending','approved','rejected') },
  date_approved:                { type: DataTypes.DATE },
  on_duty:                      { type: DataTypes.BOOLEAN, defaultValue: false },
  emergency_contact:            { type: DataTypes.STRING(100) },
  orders_made:                  { type: DataTypes.INTEGER, defaultValue: 0 },
  verified_by_admin:            { type: DataTypes.BOOLEAN, defaultValue: false },
  // Pharmacist/Manager/Delivery Partner
  pharmacy_id:                  { type: DataTypes.UUID },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password_hash) {
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(user.password_hash, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password_hash')) {
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(user.password_hash, salt);
      }
    },
  },
  indexes: [
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['phone_number'] },
    { fields: ['role'] },
    { fields: ['account_status'] },
    { fields: ['pharmacy_id'] },
  ],
});

User.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password_hash);
};

// OTP VERIFICATION
const OTPVerification = sequelize.define('OTPVerification', {
  id:         { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  phone:      { type: DataTypes.STRING(20) },
  email:      { type: DataTypes.STRING(255) },
  otp_code:   { type: DataTypes.STRING(6), allowNull: false },
  purpose:    { type: DataTypes.ENUM('registration','login','password_reset','delivery_confirmation'), allowNull: false },
  is_used:    { type: DataTypes.BOOLEAN, defaultValue: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'otp_verifications',
  timestamps: true,
  underscored: true,
});

// PHARMACY
const Pharmacy = sequelize.define('Pharmacy', {
  id:               { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  name:             { type: DataTypes.STRING(255), allowNull: false },
  email:            { type: DataTypes.STRING(255), allowNull: false },
  phone:            { type: DataTypes.STRING(20), allowNull: false },
  logo:             { type: DataTypes.STRING(500) },
  address_line1:    { type: DataTypes.STRING(255), allowNull: false },
  address_line2:    { type: DataTypes.STRING(255) },
  county:           { type: DataTypes.STRING(100), allowNull: false },
  sub_county:       { type: DataTypes.STRING(100) },
  gps_lat:          { type: DataTypes.DECIMAL(9, 6) },
  gps_lng:          { type: DataTypes.DECIMAL(9, 6) },
  license_number:   { type: DataTypes.STRING(100), allowNull: false },
  license_expiry:   { type: DataTypes.DATEONLY, allowNull: false },
  delivery_zones:   { type: DataTypes.JSON, defaultValue: [] },
  is_24hr:          { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active:        { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'pharmacies',
  timestamps: true,
  underscored: true,
});

// APPOINTMENT
const Appointment = sequelize.define("Appointment", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ───────────────────────────────────────
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },

    // ─── Scheduling ──────────────────────────────────────────
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING(10),       // e.g. "09:00 AM"
      allowNull: false,
    },
    duration: {
      type: DataTypes.INTEGER,          // in minutes
      defaultValue: 30,
    },

    // ─── Details ─────────────────────────────────────────────
    type: {
      type: DataTypes.ENUM("in_person", "video"),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
    },
    priority: {
      type: DataTypes.ENUM("urgent", "normal"),
      defaultValue: "normal",
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show"
      ),
      defaultValue: "pending",
      allowNull: false,
    },
    charges: {
      type: DataTypes.DECIMAL(10, 2),
    },

  }, {
    tableName: "appointments",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["doctor_id"] },
      { fields: ["patient_id"] },
      { fields: ["date"] },
      { fields: ["status"] },
      { fields: ["type"] },
    ],
  });

// APPOINTMENT SLOT
const AppointmentSlot = sequelize.define("AppointmentSlot", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING(10),       // e.g. "09:00 AM"
      allowNull: false,
    },
    slot_duration: {
      type: DataTypes.INTEGER,
      defaultValue: 30,                 // in minutes
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

  }, {
    tableName: "appointment_slots",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["doctor_id"] },
      { fields: ["date"] },
      { fields: ["is_available"] },
      { unique: true, fields: ["doctor_id", "date", "time"] },
    ],
  });


// CONSULTATION
const Consultation = sequelize.define('Consultation', {
  id:             { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  appointment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  doctor_id:      { type: DataTypes.UUID, allowNull: false },
  patient_id:     { type: DataTypes.UUID, allowNull: false },
  status:         { type: DataTypes.ENUM('active','completed','abandoned'), defaultValue: 'active', allowNull: false },
  meeting_url:    { type: DataTypes.STRING(500) },
  start_time:     { type: DataTypes.DATE, allowNull: false },
  end_time:       { type: DataTypes.DATE },
  symptoms:       { type: DataTypes.TEXT },
  controls:       { type: DataTypes.JSON },
}, {
  tableName: 'consultations',
  timestamps: true,
  underscored: true,
});

// VITALS
const Vital = sequelize.define('Vital', {
  id:                       { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  patient_id:               { type: DataTypes.UUID, allowNull: false },
  consultation_id:          { type: DataTypes.UUID },
  recorded_by:              { type: DataTypes.UUID },
  heart_rate:               { type: DataTypes.INTEGER },
  blood_pressure_systolic:  { type: DataTypes.INTEGER },
  blood_pressure_diastolic: { type: DataTypes.INTEGER },
  blood_glucose:            { type: DataTypes.DECIMAL(5, 2) },
  temperature:              { type: DataTypes.DECIMAL(4, 1) },
  oxygen_saturation:        { type: DataTypes.DECIMAL(4, 1) },
  weight:                   { type: DataTypes.DECIMAL(5, 1) },
  height:                   { type: DataTypes.DECIMAL(5, 1) },
  recorded_at:              { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
}, {
  tableName: 'vitals',
  timestamps: true,
  underscored: true,
});

// NOTIFICATION
const Notification = sequelize.define('Notification', {
  id:                { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  user_id:           { type: DataTypes.UUID, allowNull: false },
  title:             { type: DataTypes.STRING(255), allowNull: false },
  message:           { type: DataTypes.TEXT, allowNull: false },
  notification_type: { type: DataTypes.ENUM('appointment','prescription','order','delivery','payment','low_stock','expiry_alert','broadcast','system','chat'), allowNull: false },
  channel:           { type: DataTypes.ENUM('sms','email','push','in_app'), defaultValue: 'in_app', allowNull: false },
  reference_id:      { type: DataTypes.UUID },
  reference_type:    { type: DataTypes.STRING(50) },
  broadcast_id:      { type: DataTypes.UUID },
  is_read:           { type: DataTypes.BOOLEAN, defaultValue: false },
  read_at:           { type: DataTypes.DATE },
  sent_at:           { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
});

// NOTIFICATION PREFERENCES
const NotificationPreference = sequelize.define('NotificationPreference', {
  id:                   { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  user_id:              { type: DataTypes.UUID, allowNull: false, unique: true },
  sms_enabled:          { type: DataTypes.BOOLEAN, defaultValue: true },
  email_enabled:        { type: DataTypes.BOOLEAN, defaultValue: true },
  push_enabled:         { type: DataTypes.BOOLEAN, defaultValue: true },
  in_app_enabled:       { type: DataTypes.BOOLEAN, defaultValue: true },
  appointment_alerts:   { type: DataTypes.BOOLEAN, defaultValue: true },
  prescription_alerts:  { type: DataTypes.BOOLEAN, defaultValue: true },
  payment_alerts:       { type: DataTypes.BOOLEAN, defaultValue: true },
  delivery_alerts:      { type: DataTypes.BOOLEAN, defaultValue: true },
  chat_alerts:          { type: DataTypes.BOOLEAN, defaultValue: true },
  broadcast_alerts:     { type: DataTypes.BOOLEAN, defaultValue: true },
  low_stock_alerts:     { type: DataTypes.BOOLEAN, defaultValue: true },
  expiry_alerts:        { type: DataTypes.BOOLEAN, defaultValue: true },
  expiry_alert_days:    { type: DataTypes.INTEGER, defaultValue: 14 },
}, {
  tableName: 'notification_preferences',
  timestamps: true,
  underscored: true,
});

// PRESCRIPTION
const Prescription = sequelize.define("Prescription", {

    // ─── Identity ──────────────────────────────────────────────
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    prescription_number: {
      type: DataTypes.STRING(100),
      unique: true,                     // human-readable ref e.g. RX-0001
    },

    // ─── Relationships ─────────────────────────────────────────
    patient_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = doctor)
    },
    pharmacy_id: {
      type: DataTypes.UUID,             // FK → pharmacies.id — set when pharmacy receives it
    },
    dispensed_by: {
      type: DataTypes.UUID,             // FK → users.id (role = pharmacist) — set on dispense
    },

    // ─── Snapshot Fields (denormalized for record integrity) ───
    patient_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    patient_phone: {
      type: DataTypes.STRING(20),
    },
    patient_address: {
      type: DataTypes.STRING(255),
    },
    doctor_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    // ─── Prescription Details ──────────────────────────────────
    diagnosis: {
      type: DataTypes.TEXT,
    },
    notes: {
      type: DataTypes.TEXT,
    },
    issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
    },

    // ─── Items (individual drugs as JSON) ─────────────────────
    // Each item: { drug_id, drug_name, dosage, frequency, duration,
    //              route, warnings, instructions, quantity,
    //              substitution_ok, duration_days }
    items: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },

    // ─── Lifecycle Status ──────────────────────────────────────
    status: {
      type: DataTypes.ENUM(
        "draft",          // doctor started but not submitted
        "pending",        // submitted by doctor, awaiting pharmacy
        "validated",      // pharmacy confirmed it is legitimate
        "rejected",       // pharmacy rejected (invalid/expired/etc)
        "dispensed",      // pharmacy has dispensed the medication
        "delivered"       // delivered to patient
      ),
      defaultValue: "draft",
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("normal", "urgent"),
      defaultValue: "normal",
    },
    rejection_reason: {
      type: DataTypes.TEXT,             // nullable — set only on rejection
    },

    // ─── Dispensing Info ───────────────────────────────────────
    dispensed_at: {
      type: DataTypes.DATE,             // nullable — set when dispensed
    },
    make_order: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,              
    }

  }, {
    tableName: "prescriptions",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["patient_id"] },
      { fields: ["doctor_id"] },
      { fields: ["pharmacy_id"] },
      { fields: ["status"] },
      { unique: true, fields: ["prescription_number"] },
    ],
  });
// ORDER
const Order = sequelize.define('Order', {
  id:              { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  order_number:    { type: DataTypes.STRING(100), unique: true, allowNull: false },
  prescription_id: { type: DataTypes.UUID },
  pharmacy_id:     { type: DataTypes.UUID, allowNull: false },
  prepared_by:     { type: DataTypes.UUID },
  patient_id:      { type: DataTypes.UUID },
  patient_name:    { type: DataTypes.STRING(255), allowNull: false },
  patient_phone:   { type: DataTypes.STRING(20) },
  patient_address: { type: DataTypes.TEXT },
  delivery_type:   { type: DataTypes.ENUM('pickup','home_delivery'), defaultValue: 'pickup', allowNull: false },
  priority:        { type: DataTypes.ENUM('urgent','normal'), defaultValue: 'normal' },
  status:          { type: DataTypes.ENUM('pending','processing','ready','dispatched','delivered','cancelled'), defaultValue: 'pending', allowNull: false },
  total_amount:    { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  payment_status:  { type: DataTypes.ENUM('unpaid','paid','refunded'), defaultValue: 'unpaid' },
  payment_method:  { type: DataTypes.ENUM('mpesa','cash','insurance','nhif') },
  mpesa_ref:       { type: DataTypes.STRING(50) },
}, {
  tableName: 'orders',
  timestamps: true,
  underscored: true,
});

// DELIVERY
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const Delivery = sequelize.define('Delivery', {
  id:                      { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  package_number:          { type: DataTypes.STRING(100), unique: true, allowNull: false },
  order_id:                { type: DataTypes.UUID, allowNull: false, unique: true },
  rider_id:                { type: DataTypes.UUID },
  status:                  { type: DataTypes.ENUM('pending','assigned','accepted','picked_up','out_for_delivery','delivered','failed','cancelled'), defaultValue: 'pending', allowNull: false },
  accept_status:           { type: DataTypes.BOOLEAN, defaultValue: false },
  pickup_location:         { type: DataTypes.STRING(255) },
  pickup_lat:              { type: DataTypes.DECIMAL(9, 6) },
  pickup_lng:              { type: DataTypes.DECIMAL(9, 6) },
  pickup_contact:          { type: DataTypes.STRING(20) },
  pickup_time:             { type: DataTypes.DATE },
  dropoff_location:        { type: DataTypes.STRING(255) },
  dropoff_lat:             { type: DataTypes.DECIMAL(9, 6) },
  dropoff_lng:             { type: DataTypes.DECIMAL(9, 6) },
  receiver_contact:        { type: DataTypes.STRING(20) },
  requirement:             { type: DataTypes.STRING(255) },
  estimated_delivery_time: { type: DataTypes.STRING(100) },
  distance:                { type: DataTypes.FLOAT },
  charges:                 { type: DataTypes.DECIMAL(10, 2) },
  delivery_zone:           { type: DataTypes.STRING(100) },
  delivery_notes:          { type: DataTypes.TEXT },
  otp_code:                { type: DataTypes.STRING(6), defaultValue: generateOTP },
  delivered_at:            { type: DataTypes.DATE },
  date_approved:           { type: DataTypes.DATE },
}, {
  tableName: 'deliveries',
  timestamps: true,
  underscored: true,
});

// WALLET
const Wallet = sequelize.define('Wallet', {
  id:             { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  user_id:        { type: DataTypes.UUID, allowNull: false, unique: true },
  balance:        { type: DataTypes.DECIMAL(12, 2), defaultValue: 0, allowNull: false },
  currency:       { type: DataTypes.STRING(10), defaultValue: 'KES' },
  is_active:      { type: DataTypes.BOOLEAN, defaultValue: true },
  payout_method:  { type: DataTypes.ENUM('mpesa','bank') },
  payout_account: { type: DataTypes.STRING(100) },
}, {
  tableName: 'wallets',
  timestamps: true,
  underscored: true, 
});

// TRANSACTION
const Transaction = sequelize.define('Transaction', {
  id:             { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  wallet_id:      { type: DataTypes.UUID, allowNull: false },
  user_id:        { type: DataTypes.UUID, allowNull: false },
  amount:         { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency:       { type: DataTypes.STRING(10), defaultValue: 'KES' },
  type:           { type: DataTypes.ENUM('credit','debit'), allowNull: false },
  category:       { type: DataTypes.ENUM('consultation_fee','order_payment','delivery_fee','payout','refund','platform_fee','top_up','adjustment'), allowNull: false },
  status:         { type: DataTypes.ENUM('pending','completed','failed','reversed'), defaultValue: 'pending', allowNull: false },
  reference_id:   { type: DataTypes.UUID },
  reference_type: { type: DataTypes.STRING(50) },
  payment_method: { type: DataTypes.ENUM('mpesa','cash','insurance','nhif','wallet') },
  mpesa_ref:      { type: DataTypes.STRING(100) },
  balance_after:  { type: DataTypes.DECIMAL(12, 2) },
  description:    { type: DataTypes.STRING(255) },
  transacted_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'transactions',
  timestamps: true,
  underscored: true,
});

// REFRESH TOKEN
// Stores issued refresh tokens for session management and revocation.
const RefreshToken = sequelize.define("RefreshToken", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    user_id: { 
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (any role)
    },
    device_id: {
      type: DataTypes.STRING(100),
    },
    platform: {
      type: DataTypes.STRING(20),       // e.g. ios, android, web
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: "refresh_tokens",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["revoked"] },
      { fields: ["expires_at"] },
    ],
  });

// SYMPTOM SESSION
// One session per patient symptom-checker conversation.
const SymptomSession = sequelize.define("SymptomSession", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    status: {
      type: DataTypes.ENUM("active", "ended"),
      defaultValue: "active",
    },
    disclaimer_accepted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    consent_to_ai_analysis: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: "symptom_sessions",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["status"] },
    ],
  });


// SYMPTOM MESSAGE
// Individual messages within a SymptomSession.
const SymptomMessage = sequelize.define("SymptomMessage", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,                 
    },
    sender: {
      type: DataTypes.ENUM("patient", "ai"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    suggested_actions: {
      type: DataTypes.JSON,             
    },
  }, {
    tableName: "symptom_messages",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["session_id"] },
      { fields: ["sender"] },
    ],
  });

// MEDICAL RECORD
// Dedicated table for patient medical records / visit history.
// Replaces the old visits JSON column on users.
const MedicalRecord = sequelize.define("MedicalRecord", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    type: {
      type: DataTypes.ENUM(
        "lab",
        "vaccination",
        "consultation",
        "prescription",
        "imaging"
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    facility: {
      type: DataTypes.STRING(150),
    },
    file_url: {
      type: DataTypes.STRING(500),
    },
    date: {
      type: DataTypes.DATEONLY,
    },
  }, {
    tableName: "medical_records",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["type"] },
      { fields: ["date"] },
    ],
  });

// SAVED LOCATION
// Patient-saved addresses (Home, Work, custom labels).
const SavedLocation = sequelize.define("SavedLocation", {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id (role = patient)
    },
    label: {
      type: DataTypes.ENUM("Home", "Work", "Other"),
      defaultValue: "Home",
    },
    address: {
      type: DataTypes.STRING(255),
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: "saved_locations",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
    ],
  });

// ASSOCIATIONS

// User → RefreshTokens
User.hasMany(RefreshToken, { foreignKey: 'user_id' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id' });

// User → SymptomSessions → SymptomMessages
  User.hasMany(SymptomSession, { foreignKey: 'user_id', as: 'symptom_sessions' });
  SymptomSession.belongsTo(User, { foreignKey: 'user_id' });
  SymptomSession.hasMany(SymptomMessage, { foreignKey: "session_id" });
  SymptomMessage.belongsTo(SymptomSession, { foreignKey: "session_id" });

// User → MedicalRecords
User.hasMany(MedicalRecord, { foreignKey: 'user_id', as: 'medical_records' });
MedicalRecord.belongsTo(User, { foreignKey: 'user_id'});

// User → SavedLocations
User.hasMany(SavedLocation, { foreignKey: 'user_id', as: 'saved_locations' });
SavedLocation.belongsTo(User, { foreignKey: 'user_id'});


User.hasOne(Wallet, { foreignKey: 'user_id' });
Wallet.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Transaction, { foreignKey: 'user_id' });
Transaction.belongsTo(User, { foreignKey: 'user_id' });
Wallet.hasMany(Transaction, { foreignKey: 'wallet_id' });
Transaction.belongsTo(Wallet, { foreignKey: 'wallet_id' });

User.hasOne(NotificationPreference, { foreignKey: 'user_id' });
NotificationPreference.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Notification, { foreignKey: 'user_id' });
Notification.belongsTo(User, { foreignKey: 'user_id' });

// User → Appointments (as patient and as doctor)
User.hasMany(Appointment, { foreignKey: 'patient_id', as: 'patient_appointments' });
User.hasMany(Appointment, { foreignKey: 'doctor_id', as: 'doctor_appointments' });
Appointment.belongsTo(User, { foreignKey: 'patient_id', as: 'patient' });
Appointment.belongsTo(User, { foreignKey: 'doctor_id', as: 'doctor' });

// User → AppointmentSlots
User.hasMany(AppointmentSlot, { foreignKey: 'doctor_id', as: 'slots' });
AppointmentSlot.belongsTo(User, { foreignKey: 'doctor_id', as: 'doctor' });

// Appointment → Consultation
Appointment.hasOne(Consultation, { foreignKey: 'appointment_id' });
Consultation.belongsTo(Appointment, { foreignKey: 'appointment_id' });
User.hasMany(Consultation, { foreignKey: 'patient_id', as: 'patient_consultations' });
User.hasMany(Consultation, { foreignKey: 'doctor_id', as: 'doctor_consultations' });
Consultation.belongsTo(User, { foreignKey: 'patient_id', as: 'patient' });
Consultation.belongsTo(User, { foreignKey: 'doctor_id', as: 'doctor' });

// User → Vitals
User.hasMany(Vital, { foreignKey: 'patient_id', as: 'vitals' });
Vital.belongsTo(User, { foreignKey: 'patient_id', as: 'patient' });
Consultation.hasMany(Vital, { foreignKey: 'consultation_id' });
Vital.belongsTo(Consultation, { foreignKey: 'consultation_id' });

// User → Prescriptions
User.hasMany(Prescription, { foreignKey: 'patient_id', as: 'patient_prescriptions' });
User.hasMany(Prescription, { foreignKey: 'doctor_id', as: 'written_prescriptions' });
Prescription.belongsTo(User, { foreignKey: 'patient_id', as: 'patient' });
Prescription.belongsTo(User, { foreignKey: 'doctor_id', as: 'doctor' });
Pharmacy.hasMany(Prescription, { foreignKey: 'pharmacy_id' });
Prescription.belongsTo(Pharmacy, { foreignKey: 'pharmacy_id' });

// Prescription → Order → Delivery
Prescription.hasOne(Order, { foreignKey: 'prescription_id' });
Order.belongsTo(Prescription, { foreignKey: 'prescription_id' });
User.hasMany(Order, { foreignKey: 'patient_id', as: 'patient_orders' });
Order.belongsTo(User, { foreignKey: 'patient_id', as: 'patient' });
Pharmacy.hasMany(Order, { foreignKey: 'pharmacy_id' });
Order.belongsTo(Pharmacy, { foreignKey: 'pharmacy_id' });
Order.hasOne(Delivery, { foreignKey: 'order_id' });
Delivery.belongsTo(Order, { foreignKey: 'order_id' });
User.hasMany(Delivery, { foreignKey: 'rider_id', as: 'deliveries' });
Delivery.belongsTo(User, { foreignKey: 'rider_id', as: 'rider' });


// ═══════════════════════════════════════════════════════════════
// MESSAGE
// Real-time direct messaging between patient and doctor.
// patient_id + doctor_id index enables fast conversation lookup.
// ═══════════════════════════════════════════════════════════════
const Message = sequelize.define("Message", {

    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },

    // ─── Relationships ─────────────────────────────────────────
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id
    },
    receiver_id: {
      type: DataTypes.UUID,
      allowNull: false,                 // FK → users.id
    },
    consultation_id: {
      type: DataTypes.UUID,             // FK → consultations.id (nullable — general chat)
    },

    // ─── Content ───────────────────────────────────────────────
    content: {
      type: DataTypes.TEXT,
    },
    type: {
      type: DataTypes.ENUM("text", "image", "audio", "video", "file"),
      defaultValue: "text",
      allowNull: false,
    },
    file_url: {
      type: DataTypes.STRING(500),      // path to uploaded media
    },

    // ─── Status ────────────────────────────────────────────────
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    read_at: {
      type: DataTypes.DATE,
    },

  }, {
    tableName: "messages",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["sender_id"] },
      { fields: ["receiver_id"] },
      { fields: ["consultation_id"] },
      { fields: ["is_read"] },
      { fields: ["sender_id", "receiver_id"] },
    ],
  });
  
// User → Messages
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sent_messages' });
User.hasMany(Message, { foreignKey: 'receiver_id', as: 'received_messages' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'receiver_id', as: 'receiver' });

// EXPORTS
module.exports = {
  User,
  Message,
  OTPVerification,
  RefreshToken,
  SymptomSession,
  SymptomMessage,
  MedicalRecord,
  SavedLocation,
  Pharmacy,
  Appointment,
  AppointmentSlot,
  Consultation,
  Vital,
  Notification,
  NotificationPreference,
  Prescription,
  Order,
  Delivery,
  Wallet,
  Transaction,
};