const {
  Notification,
  Allergy,
  Condition,
  MedicalRecord,
  Vital,
  EmergencyContact,
  Appointment,
  Specialist,
} = require("../models");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");
const { cloudinary, uploadToCloudinary } = require("../config/cloudinary");

// GET /patient/dashboard
const getDashboard = async (req, res) => {
  try {
    const patient = req.patient;
    const hour = new Date().getHours();
    const greeting =
      hour < 12
        ? "Good Morning"
        : hour < 17
          ? "Good Afternoon"
          : "Good Evening";

    const unreadCount = await Notification.count({
      where: { patientId: patient.id, read: false },
    });

    const upcomingAppointment = await Appointment.findOne({
      where: {
        patientId: patient.id,
        status: "confirmed",
        date: { [Op.gte]: new Date() },
      },
      include: [{ model: Specialist }],
      order: [
        ["date", "ASC"],
        ["time", "ASC"],
      ],
    });

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let appointmentData = null;
    if (upcomingAppointment) {
      const apptDate = new Date(upcomingAppointment.date);
      const dateLabel =
        apptDate.toDateString() === tomorrow.toDateString()
          ? "TOMORROW"
          : apptDate.toLocaleDateString();
      appointmentData = {
        id: upcomingAppointment.id,
        date: dateLabel,
        time: upcomingAppointment.time,
        type: upcomingAppointment.type,
        doctor: {
          name: upcomingAppointment.Specialist?.name,
          hospital: upcomingAppointment.Specialist?.hospitalName,
        },
      };
    }

    return successResponse(res, {
      patient: {
        firstName: patient.fullName.split(" ")[0],
        greeting,
        profileImage: patient.profileImage,
        unreadNotifications: unreadCount,
      },
      emergency: {
        enabled: true,
        message: "Tap for immediate assistance",
        emergencyNumber: "999",
      },
      upcomingAppointment: appointmentData,
      quickActions: [
        {
          id: "schedule",
          title: "Schedule Appointment",
          icon: "calendar",
          color: "#30A4DA",
        },
        {
          id: "refill",
          title: "Request Refill",
          icon: "medication",
          color: "#000000",
        },
        {
          id: "specialist",
          title: "Find a Specialist",
          icon: "specialist",
          color: "#673AB7",
        },
        {
          id: "records",
          title: "My Records",
          icon: "records",
          color: "#E67E22",
        },
      ],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "DASHBOARD_ERROR");
  }
};

// GET /patient/profile/summary
const getProfileSummary = async (req, res) => {
  try {
    const patient = req.patient;

    const allergies = await Allergy.findAll({
      where: { patientId: patient.id },
    });
    const conditions = await Condition.findAll({
      where: { patientId: patient.id },
    });
    const recentHistory = await MedicalRecord.findAll({
      where: { patientId: patient.id },
      order: [["date", "DESC"]],
      limit: 5,
    });

    const age = patient.dateOfBirth
      ? Math.floor(
          (new Date() - new Date(patient.dateOfBirth)) /
            (1000 * 60 * 60 * 24 * 365.25),
        )
      : null;

    return successResponse(res, {
      patient: {
        name: patient.fullName,
        profileImage: patient.profileImage,
        bloodType: patient.bloodType,
        age,
      },
      allergies,
      ongoingConditions: conditions.map((c) => ({
        id: c.id,
        condition: c.condition,
        lastCheckup: c.lastCheckup
          ? new Date(c.lastCheckup).toLocaleDateString()
          : null,
      })),
      recentHistory: recentHistory.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        date: new Date(r.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        facility: r.facility,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "PROFILE_SUMMARY_ERROR");
  }
};

// GET /patient/profile/personal
const getPersonalInfo = async (req, res) => {
  try {
    const patient = req.patient;
    return successResponse(res, {
      profileImage: patient.profileImage,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      email: patient.email,
      phoneNumber: patient.phoneNumber,
      bio: patient.bio,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_PERSONAL_ERROR");
  }
};

// PUT /patient/profile/personal
const updatePersonalInfo = async (req, res) => {
  try {
    const { fullName, dateOfBirth, gender } = req.body;
    await req.patient.update({ fullName, dateOfBirth, gender });
    return successResponse(res, null, "Profile updated successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "UPDATE_PERSONAL_ERROR");
  }
};

// PUT /patient/profile/contact
const updateContactInfo = async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (email && email !== req.patient.email) {
      const exists = await require("../models").Patient.findOne({
        where: { email },
      });
      if (exists)
        return errorResponse(res, "Email already in use", 409, "EMAIL_EXISTS");
    }

    await req.patient.update({ email, phoneNumber });
    return successResponse(res, null, "Contact information updated");
  } catch (error) {
    return errorResponse(res, error.message, 500, "UPDATE_CONTACT_ERROR");
  }
};

// PUT /patient/profile/bio
const updateBio = async (req, res) => {
  try {
    await req.patient.update({ bio: req.body.bio });
    return successResponse(res, null, "Bio updated successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "UPDATE_BIO_ERROR");
  }
};

// GET /patient/clinical-profile
const getClinicalProfile = async (req, res) => {
  try {
    const patient = req.patient;

    const latestVital = await Vital.findOne({
      where: { patientId: patient.id },
      order: [["recordedAt", "DESC"]],
    });
    const allergies = await Allergy.findAll({
      where: { patientId: patient.id },
    });
    const conditions = await Condition.findAll({
      where: { patientId: patient.id },
    });
    const emergencyContact = await EmergencyContact.findOne({
      where: { patientId: patient.id },
    });
    const recentRecords = await MedicalRecord.findAll({
      where: { patientId: patient.id },
      order: [["date", "DESC"]],
      limit: 5,
    });

    const age = patient.dateOfBirth
      ? Math.floor(
          (new Date() - new Date(patient.dateOfBirth)) /
            (1000 * 60 * 60 * 24 * 365.25),
        )
      : null;

    return successResponse(res, {
      patient: { name: patient.fullName, age, patientId: patient.id },
      vitals: latestVital
        ? {
            heartRate: {
              value: latestVital.heartRate,
              unit: "bpm",
              status: "normal",
              icon: "❤️",
            },
            bloodPressure: {
              value: `${latestVital.bloodPressureSystolic}/${latestVital.bloodPressureDiastolic}`,
              unit: "mmHg",
              status: "normal",
              icon: "🩸",
            },
            bloodGlucose: {
              value: latestVital.bloodGlucose,
              unit: "mg/dL",
              status: "normal",
              icon: "💉",
            },
          }
        : null,
      medicalAlerts: {
        allergies: {
          count: allergies.length,
          items: allergies.map((a) => ({
            name: a.allergen,
            severity: a.severity,
            reaction: a.reaction,
          })),
        },
        conditions: {
          count: conditions.length,
          items: conditions.map((c) => ({
            name: c.condition,
            since: c.since,
            status: c.status,
          })),
        },
      },
      emergencyContact: emergencyContact
        ? {
            name: emergencyContact.name,
            relationship: emergencyContact.relationship,
            phone: emergencyContact.phone,
          }
        : null,
      recentRecords: recentRecords.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        date: new Date(r.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        facility: r.facility,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "CLINICAL_PROFILE_ERROR");
  }
};

// POST /patient/records/allergies
const addAllergy = async (req, res) => {
  try {
    const { allergen, reaction, severity, diagnosedDate } = req.body;
    const allergy = await Allergy.create({
      patientId: req.patient.id,
      allergen,
      reaction,
      severity,
      diagnosedDate,
    });
    console.log(req.patient.id);
    return successResponse(
      res,
      {
        id: allergy.id,
        allergen: allergy.allergen,
        reaction: allergy.reaction,
      },
      "Allergy added successfully",
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "ADD_ALLERGY_ERROR");
  }
};

// GET /patient/security/settings
const getSecuritySettings = async (req, res) => {
  try {
    const patient = req.patient;
    const sessionCount = await require("../models").RefreshToken.count({
      where: { patientId: patient.id, revoked: false },
    });

    return successResponse(res, {
      accountSecurity: {
        twoFactorAuth: {
          enabled: patient.twoFactorEnabled,
          method: patient.twoFactorMethod,
        },
        lastPasswordChange: patient.lastPasswordChange,
        activeSessions: sessionCount,
      },
      privacy: {
        providerSharing: {
          enabled: patient.providerSharing,
          description: "Share data with your healthcare providers",
        },
        researchOptIn: {
          enabled: patient.researchOptIn,
          description: "Help improve healthcare through research",
        },
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "SECURITY_SETTINGS_ERROR");
  }
};

// POST /patient/security/2fa/toggle
const toggle2FA = async (req, res) => {
  try {
    const { enabled, method } = req.body;
    await req.patient.update({
      twoFactorEnabled: enabled,
      twoFactorMethod: method || "sms",
    });
    return successResponse(
      res,
      null,
      `Two-factor authentication ${enabled ? "enabled" : "disabled"}`,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "TOGGLE_2FA_ERROR");
  }
};

// PUT /patient/security/data-sharing
const updateDataSharing = async (req, res) => {
  try {
    const { providerSharing, researchOptIn } = req.body;
    await req.patient.update({ providerSharing, researchOptIn });
    return successResponse(res, null, "Preferences updated");
  } catch (error) {
    return errorResponse(res, error.message, 500, "DATA_SHARING_ERROR");
  }
};

// POST /patient/security/request-data
const requestDataExport = async (req, res) => {
  try {
    const { DataExportRequest } = require("../models");
    const exportReq = await DataExportRequest.create({
      patientId: req.patient.id,
      estimatedCompletion: "15 minutes",
    });
    return successResponse(
      res,
      {
        requestId: exportReq.id,
        estimatedCompletion: exportReq.estimatedCompletion,
        status: exportReq.status,
      },
      "Data export requested",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "DATA_EXPORT_ERROR");
  }
};

// POST /patient/profile/image
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, "No image file provided", 400, "NO_FILE");
    }

    // Delete old image from Cloudinary if exists
    if (req.patient.profileImage) {
      const urlParts = req.patient.profileImage.split("/");
      const publicId = `afyabridge/patient-profiles/${urlParts[urlParts.length - 1].split(".")[0]}`;
      await cloudinary.uploader.destroy(publicId);
    }

    // Upload buffer to Cloudinary
    const result = await uploadToCloudinary(
      req.file.buffer,
      "afyabridge/patient-profiles",
    );

    // Save URL to database
    await req.patient.update({ profileImage: result.secure_url });

    return successResponse(
      res,
      {
        profileImage: result.secure_url,
      },
      "Profile image uploaded successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "UPLOAD_IMAGE_ERROR");
  }
};

// DELETE /patient/profile/image
const deleteProfileImage = async (req, res) => {
  try {
    if (!req.patient.profileImage) {
      return errorResponse(res, "No profile image to delete", 400, "NO_IMAGE");
    }

    // Extract public ID from Cloudinary URL
    const urlParts = req.patient.profileImage.split("/");
    const publicId = `afyabridge/patient-profiles/${urlParts[urlParts.length - 1].split(".")[0]}`;

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Remove URL from database
    await req.patient.update({ profileImage: null });

    return successResponse(res, null, "Profile image deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "DELETE_IMAGE_ERROR");
  }
};

//  ALLERGIES

// GET /patient/records/allergies
const getAllergies = async (req, res) => {
  try {
    const allergies = await Allergy.findAll({
      where: { patientId: req.patient.id },
      order: [["createdAt", "DESC"]],
    });
    return successResponse(res, { allergies });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_ALLERGIES_ERROR");
  }
};

// PUT /patient/records/allergies/:id
const updateAllergy = async (req, res) => {
  try {
    const allergy = await Allergy.findOne({
      where: { id: req.params.id, patientId: req.patient.id },
    });
    if (!allergy)
      return errorResponse(res, "Allergy not found", 404, "NOT_FOUND");

    const { allergen, reaction, severity, diagnosedDate } = req.body;
    await allergy.update({ allergen, reaction, severity, diagnosedDate });

    return successResponse(res, { allergy }, "Allergy updated successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "UPDATE_ALLERGY_ERROR");
  }
};

// DELETE /patient/records/allergies/:id
const deleteAllergy = async (req, res) => {
  try {
    const allergy = await Allergy.findOne({
      where: { id: req.params.id, patientId: req.patient.id },
    });
    if (!allergy)
      return errorResponse(res, "Allergy not found", 404, "NOT_FOUND");

    await allergy.destroy();
    return successResponse(res, null, "Allergy deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "DELETE_ALLERGY_ERROR");
  }
};

//  CONDITIONS

// GET /patient/records/conditions
const getConditions = async (req, res) => {
  try {
    const conditions = await Condition.findAll({
      where: { patientId: req.patient.id },
      order: [["createdAt", "DESC"]],
    });
    return successResponse(res, { conditions });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_CONDITIONS_ERROR");
  }
};

// POST /patient/records/conditions
const addCondition = async (req, res) => {
  try {
    const { condition, since, status } = req.body;
    const newCondition = await Condition.create({
      patientId: req.patient.id,
      condition,
      since,
      status,
      lastCheckup: new Date(),
    });
    return successResponse(
      res,
      { condition: newCondition },
      "Condition added successfully",
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "ADD_CONDITION_ERROR");
  }
};

// PUT /patient/records/conditions/:id
const updateCondition = async (req, res) => {
  try {
    const condition = await Condition.findOne({
      where: { id: req.params.id, patientId: req.patient.id },
    });
    if (!condition)
      return errorResponse(res, "Condition not found", 404, "NOT_FOUND");

    const { condition: conditionName, since, status } = req.body;
    await condition.update({ condition: conditionName, since, status });

    return successResponse(
      res,
      { condition },
      "Condition updated successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "UPDATE_CONDITION_ERROR");
  }
};

// DELETE /patient/records/conditions/:id
const deleteCondition = async (req, res) => {
  try {
    const condition = await Condition.findOne({
      where: { id: req.params.id, patientId: req.patient.id },
    });
    if (!condition)
      return errorResponse(res, "Condition not found", 404, "NOT_FOUND");

    await condition.destroy();
    return successResponse(res, null, "Condition deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500, "DELETE_CONDITION_ERROR");
  }
};

//  VITALS

// GET /patient/records/vitals
const getVitals = async (req, res) => {
  try {
    const vitals = await Vital.findAll({
      where: { patientId: req.patient.id },
      order: [["recordedAt", "DESC"]],
      limit: 10,
    });
    return successResponse(res, { vitals });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_VITALS_ERROR");
  }
};

// POST /patient/records/vitals
const addVital = async (req, res) => {
  try {
    const {
      heartRate,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      bloodGlucose,
    } = req.body;

    const vital = await Vital.create({
      patientId: req.patient.id,
      heartRate,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      bloodGlucose,
      recordedAt: new Date(),
    });

    return successResponse(res, { vital }, "Vitals recorded successfully", 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, "ADD_VITAL_ERROR");
  }
};

//  MEDICAL RECORDS

// GET /patient/records/medical
const getMedicalRecords = async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;
    const where = { patientId: req.patient.id };
    if (type) where.type = type;

    const { count, rows } = await MedicalRecord.findAndCountAll({
      where,
      order: [["date", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return successResponse(res, {
      records: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_MEDICAL_RECORDS_ERROR");
  }
};

// POST /patient/records/medical
const addMedicalRecord = async (req, res) => {
  try {
    const { type, title, facility, date, fileUrl } = req.body;

    const record = await MedicalRecord.create({
      patientId: req.patient.id,
      type,
      title,
      facility,
      date,
      fileUrl,
    });

    return successResponse(
      res,
      { record },
      "Medical record added successfully",
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "ADD_MEDICAL_RECORD_ERROR");
  }
};

// DELETE /patient/records/medical/:id
const deleteMedicalRecord = async (req, res) => {
  try {
    const record = await MedicalRecord.findOne({
      where: { id: req.params.id, patientId: req.patient.id },
    });
    if (!record)
      return errorResponse(res, "Record not found", 404, "NOT_FOUND");

    await record.destroy();
    return successResponse(res, null, "Medical record deleted successfully");
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      500,
      "DELETE_MEDICAL_RECORD_ERROR",
    );
  }
};

//  EMERGENCY CONTACT

// GET /patient/emergency-contact
const getEmergencyContact = async (req, res) => {
  try {
    const contact = await EmergencyContact.findOne({
      where: { patientId: req.patient.id },
    });
    return successResponse(res, { contact });
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      500,
      "GET_EMERGENCY_CONTACT_ERROR",
    );
  }
};

// POST /patient/emergency-contact
const addEmergencyContact = async (req, res) => {
  try {
    const { name, relationship, phone } = req.body;

    const existing = await EmergencyContact.findOne({
      where: { patientId: req.patient.id },
    });
    if (existing) {
      return errorResponse(
        res,
        "Emergency contact already exists. Use update instead.",
        409,
        "ALREADY_EXISTS",
      );
    }

    const contact = await EmergencyContact.create({
      patientId: req.patient.id,
      name,
      relationship,
      phone,
    });

    return successResponse(
      res,
      { contact },
      "Emergency contact added successfully",
      201,
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      500,
      "ADD_EMERGENCY_CONTACT_ERROR",
    );
  }
};

// PUT /patient/emergency-contact
const updateEmergencyContact = async (req, res) => {
  try {
    const { name, relationship, phone } = req.body;

    const contact = await EmergencyContact.findOne({
      where: { patientId: req.patient.id },
    });

    if (!contact) {
      return errorResponse(
        res,
        "Emergency contact not found. Add one first.",
        404,
        "NOT_FOUND",
      );
    }

    await contact.update({ name, relationship, phone });
    return successResponse(
      res,
      { contact },
      "Emergency contact updated successfully",
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      500,
      "UPDATE_EMERGENCY_CONTACT_ERROR",
    );
  }
};


module.exports = {
  getDashboard,
  getProfileSummary,
  getPersonalInfo,
  updatePersonalInfo,
  updateContactInfo,
  updateBio,
  getClinicalProfile,
  addAllergy,
  getSecuritySettings,
  toggle2FA,
  updateDataSharing,
  requestDataExport,
  uploadProfileImage,
  deleteProfileImage,
  getAllergies,
  updateAllergy,
  deleteAllergy,
  getConditions,
  addCondition,
  updateCondition,
  deleteCondition,
  getVitals,
  addVital,
  getMedicalRecords,
  addMedicalRecord,
  deleteMedicalRecord,
  getEmergencyContact,
  addEmergencyContact,
  updateEmergencyContact,
};
