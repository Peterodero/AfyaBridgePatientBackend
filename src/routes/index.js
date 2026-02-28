//  PATIENT ROUTES
const express = require("express");
const patientRouter = express.Router();
const { authenticate } = require("../middleware/auth");
const { body } = require("express-validator");
const { validate } = require("../middleware/validate");
const { upload } = require("../config/cloudinary");
const patientController = require("../controllers/patientController");

patientRouter.get("/dashboard", authenticate, patientController.getDashboard);
patientRouter.get(
  "/profile/summary",
  authenticate,
  patientController.getProfileSummary,
);
patientRouter.get(
  "/profile/personal",
  authenticate,
  patientController.getPersonalInfo,
);
patientRouter.put(
  "/profile/personal",
  authenticate,
  patientController.updatePersonalInfo,
);
patientRouter.put(
  "/profile/contact",
  authenticate,
  patientController.updateContactInfo,
);
patientRouter.put("/profile/bio", authenticate, patientController.updateBio);
patientRouter.get(
  "/clinical-profile",
  authenticate,
  patientController.getClinicalProfile,
);
patientRouter.post(
  "/records/allergies",
  authenticate,
  patientController.addAllergy,
);
patientRouter.get(
  "/security/settings",
  authenticate,
  patientController.getSecuritySettings,
);
patientRouter.post(
  "/security/2fa/toggle",
  authenticate,
  patientController.toggle2FA,
);
patientRouter.put(
  "/security/data-sharing",
  authenticate,
  patientController.updateDataSharing,
);
patientRouter.post(
  "/security/request-data",
  authenticate,
  patientController.requestDataExport,
);

// Profile image routes
patientRouter.post(
  "/profile/image",
  authenticate,
  upload.single("profileImage"),
  patientController.uploadProfileImage,
);

patientRouter.delete(
  "/profile/image",
  authenticate,
  patientController.deleteProfileImage,
);

// Allergies
patientRouter.get(
  "/records/allergies",
  authenticate,
  patientController.getAllergies,
);
patientRouter.put(
  "/records/allergies/:id",
  authenticate,
  patientController.updateAllergy,
);
patientRouter.delete(
  "/records/allergies/:id",
  authenticate,
  patientController.deleteAllergy,
);

// Conditions
patientRouter.get(
  "/records/conditions",
  authenticate,
  patientController.getConditions,
);
patientRouter.post(
  "/records/conditions",
  authenticate,
  patientController.addCondition,
);
patientRouter.put(
  "/records/conditions/:id",
  authenticate,
  patientController.updateCondition,
);
patientRouter.delete(
  "/records/conditions/:id",
  authenticate,
  patientController.deleteCondition,
);

// Vitals
patientRouter.get("/records/vitals", authenticate, patientController.getVitals);
patientRouter.post("/records/vitals", authenticate, patientController.addVital);

// Medical Records
patientRouter.get(
  "/records/medical",
  authenticate,
  patientController.getMedicalRecords,
);
patientRouter.post(
  "/records/medical",
  authenticate,
  patientController.addMedicalRecord,
);
patientRouter.delete(
  "/records/medical/:id",
  authenticate,
  patientController.deleteMedicalRecord,
);

// Emergency Contact
patientRouter.get(
  "/emergency-contact",
  authenticate,
  patientController.getEmergencyContact,
);
patientRouter.post(
  "/emergency-contact",
  authenticate,
  patientController.addEmergencyContact,
);
patientRouter.put(
  "/emergency-contact",
  authenticate,
  patientController.updateEmergencyContact,
);

module.exports = { patientRouter };

//  EMERGENCY ROUTES
const emergencyRouter = express.Router();
const emergencyController = require("../controllers/emergencyController");

emergencyRouter.post("/", authenticate, emergencyController.triggerEmergency);
emergencyRouter.get('/history', authenticate, emergencyController.getEmergencyHistory);

module.exports.emergencyRouter = emergencyRouter;

//  SYMPTOM CHECKER ROUTES
const symptomRouter = express.Router();
const symptomController = require("../controllers/symptomController");

symptomRouter.post("/start", authenticate, symptomController.startSession);
symptomRouter.post(
  "/disclaimer/accept",
  authenticate,
  symptomController.acceptDisclaimer,
);
symptomRouter.post("/chat", authenticate, symptomController.sendMessage);
symptomRouter.get(
  "/:sessionId/history",
  authenticate,
  symptomController.getChatHistory,
);
symptomRouter.post(
  "/:sessionId/end",
  authenticate,
  symptomController.endSession,
);

module.exports.symptomRouter = symptomRouter;

//  SPECIALIST ROUTES
const specialistRouter = express.Router();
const specialistController = require("../controllers/specialistController");

specialistRouter.get("/", authenticate, specialistController.getSpecialists);
specialistRouter.get(
  "/recommended",
  authenticate,
  specialistController.getRecommendedSpecialists,
);
specialistRouter.get(
  "/search",
  authenticate,
  specialistController.searchSpecialists,
);
specialistRouter.get(
  "/:id",
  authenticate,
  specialistController.getSpecialistById,
);
specialistRouter.get(
  "/:specialistId/slots",
  authenticate,
  specialistController.getAvailableSlots,
);

module.exports.specialistRouter = specialistRouter;

//  APPOINTMENT ROUTES
const appointmentRouter = express.Router();

appointmentRouter.post(
  "/book",
  authenticate,
  [
    body("doctorId").notEmpty().withMessage("Doctor ID required"),
    body("date").isDate().withMessage("Valid date required"),
    body("time").notEmpty().withMessage("Time required"),
    validate,
  ],
  specialistController.bookAppointment,
);

module.exports.appointmentRouter = appointmentRouter;

//  MEDS / PRESCRIPTION ROUTES
const medsRouter = express.Router();
const medsController = require("../controllers/medsController");

medsRouter.get("/dashboard", authenticate, medsController.getMedsDashboard);

module.exports.medsRouter = medsRouter;

const prescriptionRouter = express.Router();

prescriptionRouter.get(
  "/refillable",
  authenticate,
  medsController.getRefillableMeds,
);
prescriptionRouter.post(
  "/select",
  authenticate,
  medsController.selectMedication,
);
prescriptionRouter.post("/refill", authenticate, medsController.submitRefill);
prescriptionRouter.post(
  "/pharmacy/select",
  authenticate,
  require("../controllers/pharmacyController").selectPharmacy,
);
prescriptionRouter.post(
  "/refill/:refillId/location",
  authenticate,
  require("../controllers/locationController").confirmRefillLocation,
);

module.exports.prescriptionRouter = prescriptionRouter;

//  PHARMACY ROUTES
const pharmacyRouter = express.Router();
const pharmacyController = require("../controllers/pharmacyController");

pharmacyRouter.get(
  "/nearby",
  authenticate,
  pharmacyController.getNearbyPharmacies,
);
pharmacyRouter.get(
  "/search",
  authenticate,
  pharmacyController.searchPharmacies,
);
pharmacyRouter.get("/map", authenticate, pharmacyController.getPharmacyMapData);

module.exports.pharmacyRouter = pharmacyRouter;

//  ORDER / PAYMENT / DELIVERY ROUTES
const orderRouter = express.Router();
const orderController = require("../controllers/orderController");

orderRouter.get(
  "/:refillId/summary",
  authenticate,
  orderController.getOrderSummary,
);
orderRouter.post(
  "/:refillId/pay",
  authenticate,
  orderController.initiatePayment,
);
orderRouter.get(
  "/:refillId/confirmation",
  authenticate,
  orderController.getOrderConfirmation,
);
orderRouter.get(
  "/:refillId/track",
  authenticate,
  orderController.trackDelivery,
);
orderRouter.post(
  "/:refillId/courier/contact",
  authenticate,
  orderController.contactCourier,
);

module.exports.orderRouter = orderRouter;

const paymentRouter = express.Router();

paymentRouter.get(
  "/:transactionId/status",
  authenticate,
  orderController.getPaymentStatus,
);
paymentRouter.post("/mpesa/callback", orderController.mpesaCallback); // No auth - Safaricom callback

module.exports.paymentRouter = paymentRouter;

//  NOTIFICATION ROUTES
const notificationRouter = express.Router();
const notificationController = require("../controllers/notificationController");

notificationRouter.get(
  "/",
  authenticate,
  notificationController.getNotifications,
);
notificationRouter.get(
  "/unread/count",
  authenticate,
  notificationController.getUnreadCount,
);
notificationRouter.patch(
  "/:notificationId/read",
  authenticate,
  notificationController.markAsRead,
);
notificationRouter.post(
  "/read-all",
  authenticate,
  notificationController.markAllAsRead,
);

notificationRouter.delete(
  "/:notificationId",
  authenticate,
  notificationController.deleteNotification,
);
notificationRouter.delete(
  "/delete-all",
  authenticate,
  notificationController.deleteAllNotifications,
);

module.exports.notificationRouter = notificationRouter;

//  CONSULTATION ROUTES
const consultationRouter = express.Router();
const consultationController = require("../controllers/consultationController");

consultationRouter.post(
  "/:appointmentId/start",
  authenticate,
  consultationController.startConsultation,
);
consultationRouter.post(
  "/:appointmentId/chat",
  authenticate,
  consultationController.sendConsultationMessage,
);
consultationRouter.post(
  "/:appointmentId/end",
  authenticate,
  consultationController.endConsultation,
);

module.exports.consultationRouter = consultationRouter;

//  LOCATION ROUTES
const locationRouter = express.Router();
const locationController = require("../controllers/locationController");

locationRouter.get("/search", authenticate, locationController.searchLocations);
locationRouter.post(
  "/delivery",
  authenticate,
  locationController.setDeliveryLocation,
);

module.exports.locationRouter = locationRouter;

//  MEDICINES ROUTES
const medicineRouter = express.Router();

medicineRouter.get("/search", authenticate, medsController.searchMedicines);
medicineRouter.post(
  "/manual",
  authenticate,
  medsController.addMedicineManually,
);

module.exports.medicineRouter = medicineRouter;
