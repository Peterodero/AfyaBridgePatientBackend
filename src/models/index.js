const { sequelize } = require("../config/database.js");

// ─── Load Models ──────────────────────────────────────────────
const User                  = require("./users.js");
const Pharmacies            = require("./pharmacies.js");
const PharmacyRegistration  = require("./pharmacy_registrations.js");
const OTPVerification       = require("./otp_verifications.js");

const Appointments          = require("./appointments.js");
const Consultations         = require("./consultations.js");

const Message               = require("./messages.js");
const Vital                 = require("./vitals.js");
const LabOrder              = require("./lab_orders.js");
const Prescription          = require("./prescriptions.js");

const Order                 = require("./orders.js");
const Delivery              = require("./deliveries.js");
const Receipt               = require("./receipts.js");

const Drugs                 = require("./drugs.js");
const PatientMedication     = require("./patient_medications.js");
const Supplier              = require("./suppliers.js");
const BulkOrders            = require("./bulk_orders.js");

const Wallet                = require("./wallet.js");
const Transaction           = require("./transactions.js");

const Notifications         = require("./notifications.js");
const BroadcastAnnouncement = require("./broadcast_announcements.js");

const Issue                 = require("./issues.js");

const MedicalRecord         = require("./medical_records.js");
const SymptomSessions       = require("./symptom_sessions.js");
const SavedLocations        = require("./saved_locations.js");
const RefreshTokens         = require("./refresh_tokens.js");

const ManualMedicine        = require("./manual_medicine.js");

const AuditLog               = require("./audit_logs.js");



// ─── Initialize Models ─────────────────────────────────────────
const models = {
  User: User(sequelize),

  ...Pharmacies(sequelize),          // Pharmacy, PharmacyHours
  PharmacyRegistration: PharmacyRegistration(sequelize),
  OTPVerification: OTPVerification(sequelize),

  ...Appointments(sequelize),        // Appointment, AppointmentSlot
  ...Consultations(sequelize),       // Consultation, ClinicalNote

  Message: Message(sequelize),
  Vital: Vital(sequelize),
  LabOrder: LabOrder(sequelize),
  Prescription: Prescription(sequelize),

  Order: Order(sequelize),
  Delivery: Delivery(sequelize),
  Receipt: Receipt(sequelize),

  ...Drugs(sequelize),  
  PatientMedication: PatientMedication(sequelize),             // Drug, StockBatch
  Supplier: Supplier(sequelize),
  ...BulkOrders(sequelize),          // BulkOrder, BulkOrderItem

  Wallet: Wallet(sequelize),
  Transaction: Transaction(sequelize),

  ...Notifications(sequelize),       // Notification, NotificationPreference
  BroadcastAnnouncement: BroadcastAnnouncement(sequelize),

  Issue: Issue(sequelize),

  MedicalRecord: MedicalRecord(sequelize),
  ...SymptomSessions(sequelize),
  SavedLocation: SavedLocations(sequelize),
  RefreshToken: RefreshTokens(sequelize),

  ManualMedicine: ManualMedicine(sequelize),

  AuditLog: AuditLog(sequelize),
};


// ASSOCIATIONS

// ─── User ──────────────────────────────────────────────────────
models.User.hasOne(models.Wallet, { foreignKey: "user_id" });
models.Wallet.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.Transaction, { foreignKey: "user_id" });
models.Transaction.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasOne(models.NotificationPreference, { foreignKey: "user_id" });
models.NotificationPreference.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.Notification, { foreignKey: "user_id" });
models.Notification.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.Issue, { foreignKey: "user_id", as: "raised_issues" });
models.Issue.belongsTo(models.User, { foreignKey: "user_id", as: "raised_by" });

models.User.hasMany(models.Issue, { foreignKey: "resolved_by", as: "resolved_issues" });
models.Issue.belongsTo(models.User, { foreignKey: "resolved_by", as: "resolved_by_user" });


// ─── Pharmacy ──────────────────────────────────────────────────
models.Pharmacy.hasMany(models.PharmacyHours, { foreignKey: "pharmacy_id" });
models.PharmacyHours.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id" });

models.Pharmacy.hasMany(models.User, { foreignKey: "pharmacy_id", as: "staff" });
models.User.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id" });

models.Pharmacy.hasMany(models.Drug, { foreignKey: "pharmacy_id" });
models.Drug.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id" });

models.Pharmacy.hasMany(models.Order, { foreignKey: "pharmacy_id" });
models.Order.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id" });

models.Pharmacy.hasMany(models.Prescription, { foreignKey: "pharmacy_id" });
models.Prescription.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id" });

models.Pharmacy.hasMany(models.BulkOrder, { foreignKey: "pharmacy_id" });
models.BulkOrder.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id" });

models.User.hasMany(models.PharmacyRegistration, { foreignKey: "reviewed_by", as: "reviewed_registrations" });
models.PharmacyRegistration.belongsTo(models.User, { foreignKey: "reviewed_by", as: "reviewer" });


// ─── Appointments ──────────────────────────────────────────────
models.User.hasMany(models.Appointment, { foreignKey: "doctor_id", as: "doctor_appointments" });
models.Appointment.belongsTo(models.User, { foreignKey: "doctor_id", as: "doctor" });

models.User.hasMany(models.Appointment, { foreignKey: "patient_id", as: "patient_appointments" });
models.Appointment.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });

models.User.hasMany(models.AppointmentSlot, { foreignKey: "doctor_id", as: "slots" });
models.AppointmentSlot.belongsTo(models.User, { foreignKey: "doctor_id", as: "doctor" });

models.Appointment.hasOne(models.Consultation, { foreignKey: "appointment_id" });
models.Consultation.belongsTo(models.Appointment, { foreignKey: "appointment_id" });


// ─── Consultations ─────────────────────────────────────────────
models.User.hasMany(models.Consultation, { foreignKey: "doctor_id", as: "doctor_consultations" });
models.Consultation.belongsTo(models.User, { foreignKey: "doctor_id", as: "doctor" });

models.User.hasMany(models.Consultation, { foreignKey: "patient_id", as: "patient_consultations" });
models.Consultation.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });

models.Consultation.hasOne(models.ClinicalNote, { foreignKey: "consultation_id" });
models.ClinicalNote.belongsTo(models.Consultation, { foreignKey: "consultation_id" });

models.Consultation.hasMany(models.Vital, { foreignKey: "consultation_id" });
models.Vital.belongsTo(models.Consultation, { foreignKey: "consultation_id" });

models.Consultation.hasMany(models.LabOrder, { foreignKey: "consultation_id" });
models.LabOrder.belongsTo(models.Consultation, { foreignKey: "consultation_id" });


// ─── Vitals ────────────────────────────────────────────────────
models.User.hasMany(models.Vital, { foreignKey: "patient_id", as: "vitals" });
models.Vital.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });

models.User.hasMany(models.Vital, { foreignKey: "recorded_by", as: "recorded_vitals" });
models.Vital.belongsTo(models.User, { foreignKey: "recorded_by", as: "recorded_by_doctor" });


// ─── Lab Orders ────────────────────────────────────────────────
models.User.hasMany(models.LabOrder, { foreignKey: "patient_id", as: "lab_orders" });
models.LabOrder.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });

models.User.hasMany(models.LabOrder, { foreignKey: "doctor_id", as: "issued_lab_orders" });
models.LabOrder.belongsTo(models.User, { foreignKey: "doctor_id", as: "doctor" });


// ─── Messages ──────────────────────────────────────────────────
models.User.hasMany(models.Message, { foreignKey: "sender_id", as: "sent_messages" });
models.Message.belongsTo(models.User, { foreignKey: "sender_id", as: "sender" });

models.User.hasMany(models.Message, { foreignKey: "receiver_id", as: "received_messages" });
models.Message.belongsTo(models.User, { foreignKey: "receiver_id", as: "receiver" });


// ─── Prescriptions ─────────────────────────────────────────────
models.User.hasMany(models.Prescription, { foreignKey: "doctor_id", as: "written_prescriptions" });
models.Prescription.belongsTo(models.User, { foreignKey: "doctor_id", as: "doctor" });

models.User.hasMany(models.Prescription, { foreignKey: "patient_id", as: "patient_prescriptions" });
models.Prescription.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });

models.User.hasMany(models.Prescription, { foreignKey: "dispensed_by", as: "dispensed_prescriptions" });
models.Prescription.belongsTo(models.User, { foreignKey: "dispensed_by", as: "dispensed_by_user" });

models.Prescription.hasOne(models.Order, { foreignKey: "prescription_id" });
models.Order.belongsTo(models.Prescription, { foreignKey: "prescription_id" });


// ─── Orders ────────────────────────────────────────────────────
models.User.hasMany(models.Order, { foreignKey: "patient_id", as: "patient_orders" });
models.Order.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });

models.User.hasMany(models.Order, { foreignKey: "prepared_by", as: "prepared_orders" });
models.Order.belongsTo(models.User, { foreignKey: "prepared_by", as: "prepared_by_user" });

models.Order.hasOne(models.Delivery, { foreignKey: "order_id" });
models.Delivery.belongsTo(models.Order, { foreignKey: "order_id" });

models.Order.hasOne(models.Receipt, { foreignKey: "order_id" });
models.Receipt.belongsTo(models.Order, { foreignKey: "order_id" });


// ─── Deliveries ────────────────────────────────────────────────
models.User.hasMany(models.Delivery, { foreignKey: "rider_id", as: "deliveries" });
models.Delivery.belongsTo(models.User, { foreignKey: "rider_id", as: "rider" });


// ─── Receipts ──────────────────────────────────────────────────
models.User.hasMany(models.Receipt, { foreignKey: "dispensed_by", as: "receipts" });
models.Receipt.belongsTo(models.User, { foreignKey: "dispensed_by", as: "dispensed_by_user" });


// ─── Drugs & Stock ─────────────────────────────────────────────
models.Drug.hasMany(models.StockBatch, { foreignKey: "drug_id" });
models.StockBatch.belongsTo(models.Drug, { foreignKey: "drug_id" });

models.Supplier.hasMany(models.StockBatch, { foreignKey: "supplier_id" });
models.StockBatch.belongsTo(models.Supplier, { foreignKey: "supplier_id" });

models.BulkOrder.hasMany(models.StockBatch, { foreignKey: "bulk_order_id" });
models.StockBatch.belongsTo(models.BulkOrder, { foreignKey: "bulk_order_id" });

models.User.hasMany(models.StockBatch, { foreignKey: "received_by", as: "received_batches" });
models.StockBatch.belongsTo(models.User, { foreignKey: "received_by", as: "received_by_user" });


// ─── Bulk Orders ───────────────────────────────────────────────
models.Supplier.hasMany(models.BulkOrder, { foreignKey: "supplier_id" });
models.BulkOrder.belongsTo(models.Supplier, { foreignKey: "supplier_id" });

models.User.hasMany(models.BulkOrder, { foreignKey: "created_by", as: "created_bulk_orders" });
models.BulkOrder.belongsTo(models.User, { foreignKey: "created_by", as: "created_by_user" });

models.BulkOrder.hasMany(models.BulkOrderItem, { foreignKey: "bulk_order_id" });
models.BulkOrderItem.belongsTo(models.BulkOrder, { foreignKey: "bulk_order_id" });

models.Drug.hasMany(models.BulkOrderItem, { foreignKey: "drug_id" });
models.BulkOrderItem.belongsTo(models.Drug, { foreignKey: "drug_id" });


// ─── Wallets & Transactions ────────────────────────────────────
models.Wallet.hasMany(models.Transaction, { foreignKey: "wallet_id" });
models.Transaction.belongsTo(models.Wallet, { foreignKey: "wallet_id" });


// ─── Broadcasts & Notifications ────────────────────────────────
models.User.hasMany(models.BroadcastAnnouncement, { foreignKey: "admin_id", as: "broadcasts" });
models.BroadcastAnnouncement.belongsTo(models.User, { foreignKey: "admin_id", as: "admin" });

models.BroadcastAnnouncement.hasMany(models.Notification, { foreignKey: "broadcast_id" });
models.Notification.belongsTo(models.BroadcastAnnouncement, { foreignKey: "broadcast_id" });

models.User.hasMany(models.RefreshToken, { foreignKey: "user_id" });
models.RefreshToken.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.MedicalRecord, { foreignKey: "user_id", as: "medical_records" });
models.MedicalRecord.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.SavedLocation, { foreignKey: "user_id", as: "saved_locations" });
models.SavedLocation.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.ManualMedicine, { foreignKey: "user_id", as: "manual_medicines" });
models.ManualMedicine.belongsTo(models.User, { foreignKey: "user_id" });

models.User.hasMany(models.SymptomSession, { foreignKey: "user_id", as: "symptom_sessions" });
models.SymptomSession.belongsTo(models.User, { foreignKey: "user_id" });


  // ─── Patient Medications ──────────────────────────────────────
 
// Patient — a patient has many medications
models.User.hasMany(models.PatientMedication, { foreignKey: "patient_id", as: "medications" });
models.PatientMedication.belongsTo(models.User, { foreignKey: "patient_id", as: "patient" });
 
// Prescribing doctor — a doctor has prescribed many medications
models.User.hasMany(models.PatientMedication, { foreignKey: "prescribed_by", as: "prescribed_medications" });
models.PatientMedication.belongsTo(models.User, { foreignKey: "prescribed_by", as: "prescribing_doctor" });
 
// Dispensing pharmacist — a pharmacist has dispensed many medications
models.User.hasMany(models.PatientMedication, { foreignKey: "dispensed_by", as: "dispensed_medications" });
models.PatientMedication.belongsTo(models.User, { foreignKey: "dispensed_by", as: "dispensing_pharmacist" });
 
// Prescription — one prescription can produce many patient medication records
// (one per drug item in the prescription's items JSON)
models.Prescription.hasMany(models.PatientMedication, { foreignKey: "prescription_id", as: "patient_medications" });
models.PatientMedication.belongsTo(models.Prescription, { foreignKey: "prescription_id", as: "prescription" });
 
// Pharmacy — a pharmacy has dispensed many patient medications
models.Pharmacy.hasMany(models.PatientMedication, { foreignKey: "pharmacy_id", as: "dispensed_patient_medications" });
models.PatientMedication.belongsTo(models.Pharmacy, { foreignKey: "pharmacy_id", as: "pharmacy" });
 
// Drug — a drug catalogue entry can appear in many patient medication records
models.Drug.hasMany(models.PatientMedication, { foreignKey: "drug_id", as: "patient_medication_records" });
models.PatientMedication.belongsTo(models.Drug, { foreignKey: "drug_id", as: "drug" });


// ─── Audit Logs ───────────────────────────────────────────────
models.User.hasMany(models.AuditLog, { foreignKey: "admin_id", as: "audit_logs" });
models.AuditLog.belongsTo(models.User, { foreignKey: "admin_id", as: "admin" });



// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  sequelize,
  models,
};