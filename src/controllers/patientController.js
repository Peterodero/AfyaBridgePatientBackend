const { models:{User, Vital, Notification, Appointment, MedicalRecord} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');
const { cloudinary, uploadToCloudinary } = require('../config/cloudinary');

// GET /patient/dashboard
const getDashboard = async (req, res) => {
  try {
    const user = req.user;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

    const unreadCount = await Notification.count({
      where: { user_id: user.id, is_read: false },
    });

    const upcomingAppointment = await Appointment.findOne({
      where: {
        patient_id: user.id,
        status: 'confirmed',
        date: { [Op.gte]: new Date() },
      },
      include: [{ model: User, as: 'doctor', attributes: ['id', 'full_name', 'hospital', 'specialty'] }],
      order: [['date', 'ASC'], ['time', 'ASC']],
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    let appointmentData = null;
    if (upcomingAppointment) {
      const apptDate = new Date(upcomingAppointment.date);
      const dateLabel = apptDate.toDateString() === tomorrow.toDateString()
        ? 'TOMORROW'
        : apptDate.toLocaleDateString();
      appointmentData = {
        id: upcomingAppointment.id,
        date: dateLabel,
        time: upcomingAppointment.time,
        type: upcomingAppointment.type,
        doctor: {
          name: upcomingAppointment.doctor?.full_name,
          hospital: upcomingAppointment.doctor?.hospital,
        },
      };
    }

    return successResponse(res, {
      patient: {
        firstName: user.full_name.split(' ')[0],
        greeting,
        profileImage: user.profile_image,
        unreadNotifications: unreadCount,
      },
      emergency: {
        enabled: true,
        message: 'Tap for immediate assistance',
        emergencyNumber: '999',
      },
      upcomingAppointment: appointmentData,
      quickActions: [
        { id: 'schedule', title: 'Schedule Appointment', icon: 'calendar', color: '#30A4DA' },
        { id: 'refill', title: 'Request Refill', icon: 'medication', color: '#000000' },
        { id: 'doctor', title: 'Find a Doctor', icon: 'doctor', color: '#673AB7' },
        { id: 'records', title: 'My Records', icon: 'records', color: '#E67E22' },
      ],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DASHBOARD_ERROR');
  }
};

// GET /patient/profile/summary
const getProfileSummary = async (req, res) => {
  try {
    const user = req.user;

    const age = user.date_of_birth
      ? Math.floor((new Date() - new Date(user.date_of_birth)) / (1000 * 60 * 60 * 24 * 365.25))
      : null;

    return successResponse(res, {
      patient: {
        name: user.full_name,
        profileImage: user.profile_image,
        bloodType: user.blood_type,
        age,
      },
      allergies: user.allergies || [],
      ongoingConditions: (user.conditions || []).map((c) => ({
        name: c.name,
        diagnosedDate: c.diagnosedDate,
        status: c.status,
      })),
      recentHistory: (await MedicalRecord.findAll({
        where: { user_id: user.id },
        order: [['date', 'DESC']],
        limit: 5,
      })).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        diagnosis: r.diagnosis,
        date: r.record_date,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'PROFILE_SUMMARY_ERROR');
  }
};

// GET /patient/profile/personal
const getPersonalInfo = async (req, res) => {
  try {
    const user = req.user;
    return successResponse(res, {
      profileImage: user.profile_image,
      fullName: user.full_name,
      dateOfBirth: user.date_of_birth,
      gender: user.gender,
      email: user.email,
      phoneNumber: user.phone_number,
      bio: user.bio,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_PERSONAL_ERROR');
  }
};

// PUT /patient/profile/personal
const updatePersonalInfo = async (req, res) => {
  try {
    const { fullName, dateOfBirth, gender } = req.body;
    await req.user.update({ full_name: fullName, date_of_birth: dateOfBirth, gender });
    return successResponse(res, null, 'Profile updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_PERSONAL_ERROR');
  }
};

// PUT /patient/profile/contact
const updateContactInfo = async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (email && email !== req.user.email) {
      const exists = await User.findOne({ where: { email } });
      if (exists)
        return errorResponse(res, 'Email already in use', 409, 'EMAIL_EXISTS');
    }

    await req.user.update({ email, phone_number: phoneNumber });
    return successResponse(res, null, 'Contact information updated');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_CONTACT_ERROR');
  }
};

// PUT /patient/profile/bio
const updateBio = async (req, res) => {
  try {
    await req.user.update({ bio: req.body.bio });
    return successResponse(res, null, 'Bio updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_BIO_ERROR');
  }
};

// GET /patient/clinical-profile
const getClinicalProfile = async (req, res) => {
  try {
    const user = req.user;

    const latestVital = await Vital.findOne({
      where: { patient_id: user.id },
      order: [['recorded_at', 'DESC']],
    });

    const age = user.date_of_birth
      ? Math.floor((new Date() - new Date(user.date_of_birth)) / (1000 * 60 * 60 * 24 * 365.25))
      : null;

    return successResponse(res, {
      patient: { name: user.full_name, age, patientId: user.id },
      vitals: latestVital ? {
        heartRate:     { value: latestVital.heart_rate, unit: 'bpm', status: 'normal', icon: '' },
        bloodPressure: { value: `${latestVital.blood_pressure_systolic}/${latestVital.blood_pressure_diastolic}`, unit: 'mmHg', status: 'normal', icon: '' },
        bloodGlucose:  { value: latestVital.blood_glucose, unit: 'mmol/L', status: 'normal', icon: '💉' },
        temperature:   { value: latestVital.temperature, unit: '°C', status: 'normal', icon: '🌡️' },
        oxygenSat:     { value: latestVital.oxygen_saturation, unit: '%', status: 'normal', icon: '💨' },
      } : null,
      medicalAlerts: {
        allergies: {
          count: (user.allergies || []).length,
          items: (user.allergies || []).map((a) => ({ name: a.allergen, severity: a.severity, reaction: a.reaction })),
        },
        conditions: {
          count: (user.conditions || []).length,
          items: (user.conditions || []).map((c) => ({ name: c.name, since: c.diagnosedDate, status: c.status })),
        },
      },
      emergencyContacts: user.emergency_contacts || [],
      surgeries: user.surgeries || [],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CLINICAL_PROFILE_ERROR');
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// FIXED: ALLERGY FUNCTIONS - Using new array references to trigger Sequelize
// ──────────────────────────────────────────────────────────────────────────────

// POST /patient/records/allergies
const addAllergy = async (req, res) => {
  try {
    const { allergen, reaction, severity, diagnosedDate } = req.body;
    
    // Get current allergies (array)
    const currentAllergies = req.user.allergies || [];
    
    // Create new allergy object
    const newAllergy = { 
      id: `ALG-${Date.now()}`, 
      allergen, 
      reaction, 
      severity, 
      diagnosedDate: diagnosedDate || new Date().toISOString().split('T')[0]
    };
    
    // Create a NEW array (this triggers Sequelize change detection)
    const updatedAllergies = [...currentAllergies, newAllergy];
    
    // Update with the new array
    await req.user.update({ allergies: updatedAllergies });
    
    console.log('Allergy added successfully:', newAllergy);
    
    return successResponse(res, 
      { id: newAllergy.id, allergen, reaction, severity }, 
      'Allergy added successfully', 
      201
    );
  } catch (error) {
    console.error('Add allergy error:', error);
    return errorResponse(res, error.message, 500, 'ADD_ALLERGY_ERROR');
  }
};

// GET /patient/records/allergies
const getAllergies = async (req, res) => {
  try {
    const allergies = req.user.allergies || [];
    console.log('Retrieved allergies:', allergies.length);
    return successResponse(res, { allergies });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_ALLERGIES_ERROR');
  }
};

// PUT /patient/records/allergies/:id
const updateAllergy = async (req, res) => {
  try {
    const { id } = req.params;
    const { allergen, reaction, severity, diagnosedDate } = req.body;
    
    const currentAllergies = req.user.allergies || [];
    const allergyIndex = currentAllergies.findIndex(a => a.id === id);
    
    if (allergyIndex === -1) {
      return errorResponse(res, 'Allergy not found', 404, 'NOT_FOUND');
    }
    
    // Create a NEW array with the updated allergy
    const updatedAllergies = [...currentAllergies];
    updatedAllergies[allergyIndex] = {
      ...updatedAllergies[allergyIndex],
      allergen: allergen || updatedAllergies[allergyIndex].allergen,
      reaction: reaction || updatedAllergies[allergyIndex].reaction,
      severity: severity || updatedAllergies[allergyIndex].severity,
      diagnosedDate: diagnosedDate || updatedAllergies[allergyIndex].diagnosedDate
    };
    
    await req.user.update({ allergies: updatedAllergies });
    
    return successResponse(res, 
      { allergy: updatedAllergies[allergyIndex] }, 
      'Allergy updated successfully'
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_ALLERGY_ERROR');
  }
};

// DELETE /patient/records/allergies/:id
const deleteAllergy = async (req, res) => {
  try {
    const { id } = req.params;
    
    const currentAllergies = req.user.allergies || [];
    const updatedAllergies = currentAllergies.filter(a => a.id !== id);
    
    if (updatedAllergies.length === currentAllergies.length) {
      return errorResponse(res, 'Allergy not found', 404, 'NOT_FOUND');
    }
    
    await req.user.update({ allergies: updatedAllergies });
    
    return successResponse(res, null, 'Allergy deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_ALLERGY_ERROR');
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// END OF FIXED ALLERGY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

// GET /patient/records/conditions
const getConditions = async (req, res) => {
  try {
    return successResponse(res, { conditions: req.user.conditions || [] });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_CONDITIONS_ERROR');
  }
};

// POST /patient/records/conditions
const addCondition = async (req, res) => {
  try {
    const { condition, since, status } = req.body;
    const currentConditions = req.user.conditions || [];
    const newCondition = { id: `CON-${Date.now()}`, name: condition, diagnosedDate: since, status };
    const updatedConditions = [...currentConditions, newCondition];
    await req.user.update({ conditions: updatedConditions });
    return successResponse(res, { condition: newCondition }, 'Condition added successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ADD_CONDITION_ERROR');
  }
};

// PUT /patient/records/conditions/:id
const updateCondition = async (req, res) => {
  try {
    const conditions = req.user.conditions || [];
    const idx = conditions.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return errorResponse(res, 'Condition not found', 404, 'NOT_FOUND');

    const { condition, since, status } = req.body;
    const updatedConditions = [...conditions];
    updatedConditions[idx] = { 
      ...updatedConditions[idx], 
      name: condition || updatedConditions[idx].name, 
      diagnosedDate: since || updatedConditions[idx].diagnosedDate, 
      status: status || updatedConditions[idx].status 
    };
    await req.user.update({ conditions: updatedConditions });
    return successResponse(res, { condition: updatedConditions[idx] }, 'Condition updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_CONDITION_ERROR');
  }
};

// DELETE /patient/records/conditions/:id
const deleteCondition = async (req, res) => {
  try {
    const conditions = (req.user.conditions || []).filter((c) => c.id !== req.params.id);
    await req.user.update({ conditions });
    return successResponse(res, null, 'Condition deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_CONDITION_ERROR');
  }
};

// GET /patient/records/vitals
const getVitals = async (req, res) => {
  try {
    const vitals = await Vital.findAll({
      where: { patient_id: req.user.id },
      order: [['recorded_at', 'DESC']],
      limit: 10,
    });
    return successResponse(res, { vitals });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_VITALS_ERROR');
  }
};

// POST /patient/records/vitals
const addVital = async (req, res) => {
  try {
    const { heartRate, bloodPressureSystolic, bloodPressureDiastolic, bloodGlucose, temperature, oxygenSaturation, weight, height } = req.body;

    const vital = await Vital.create({
      patient_id: req.user.id,
      heart_rate: heartRate,
      blood_pressure_systolic: bloodPressureSystolic,
      blood_pressure_diastolic: bloodPressureDiastolic,
      blood_glucose: bloodGlucose,
      temperature,
      oxygen_saturation: oxygenSaturation,
      weight,
      height,
      recorded_at: new Date(),
    });

    return successResponse(res, { vital }, 'Vitals recorded successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ADD_VITAL_ERROR');
  }
};

// GET /patient/records/medical
const getMedicalRecords = async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;
    const where = { user_id: req.user.id };
    if (type) where.type = type;

    const { count, rows } = await MedicalRecord.findAndCountAll({
      where,
      order: [['date', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return successResponse(res, {
      records: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        facility: r.facility,
        doctorName: r.doctor_name,
        diagnosis: r.diagnosis,
        notes: r.notes,
        fileUrl: r.file_url,
        recordDate: r.record_date,
        isPrivate: r.is_private,
      })),
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_MEDICAL_RECORDS_ERROR');
  }
};

// POST /patient/records/medical
const addMedicalRecord = async (req, res) => {
  try {
    const { type, title, facility, doctorName, diagnosis, notes, fileUrl, recordDate, isPrivate } = req.body;

    const record = await MedicalRecord.create({
      user_id: req.user.id,
      type,
      title,
      facility: facility || null,
      doctor_name: doctorName || null,
      diagnosis: diagnosis || null,
      notes: notes || null,
      file_url: fileUrl || null,
      record_date: recordDate,
      is_private: isPrivate || false,
    });

    return successResponse(res, {
      id: record.id,
      type: record.type,
      title: record.title,
      recordDate: record.record_date,
    }, 'Medical record added successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ADD_MEDICAL_RECORD_ERROR');
  }
};

// DELETE /patient/records/medical/:id
const deleteMedicalRecord = async (req, res) => {
  try {
    const record = await MedicalRecord.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!record)
      return errorResponse(res, 'Record not found', 404, 'NOT_FOUND');

    await record.destroy();
    return successResponse(res, null, 'Medical record deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_MEDICAL_RECORD_ERROR');
  }
};

// GET /patient/emergency-contact
const getEmergencyContact = async (req, res) => {
  try {
    const contacts = req.user.emergency_contacts || [];
    return successResponse(res, { contact: contacts[0] || null });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_EMERGENCY_CONTACT_ERROR');
  }
};

// POST /patient/emergency-contact
const addEmergencyContact = async (req, res) => {
  try {
    const { name, relationship, phone } = req.body;
    const currentContacts = req.user.emergency_contacts || [];

    if (currentContacts.length > 0)
      return errorResponse(res, 'Emergency contact already exists. Use update instead.', 409, 'ALREADY_EXISTS');

    const contact = { id: `EC-${Date.now()}`, name, relationship, phone };
    const updatedContacts = [...currentContacts, contact];
    await req.user.update({ emergency_contacts: updatedContacts });
    return successResponse(res, { contact }, 'Emergency contact added successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ADD_EMERGENCY_CONTACT_ERROR');
  }
};

// PUT /patient/emergency-contact
const updateEmergencyContact = async (req, res) => {
  try {
    const { name, relationship, phone } = req.body;
    const contacts = req.user.emergency_contacts || [];

    if (contacts.length === 0)
      return errorResponse(res, 'Emergency contact not found. Add one first.', 404, 'NOT_FOUND');

    const updatedContacts = [...contacts];
    updatedContacts[0] = { ...updatedContacts[0], name, relationship, phone };
    await req.user.update({ emergency_contacts: updatedContacts });
    return successResponse(res, { contact: updatedContacts[0] }, 'Emergency contact updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_EMERGENCY_CONTACT_ERROR');
  }
};

// GET /patient/security/settings
const getSecuritySettings = async (req, res) => {
  try {
    const user = req.user;
    return successResponse(res, {
      accountSecurity: {
        twoFactorAuth: { enabled: user.two_factor_enabled, method: user.two_factor_method },
        lastPasswordChange: user.last_password_change,
        lastLogin: user.last_login,
      },
      privacy: {
        providerSharing: { enabled: user.provider_sharing, description: 'Share data with your healthcare providers' },
        researchOptIn: { enabled: user.research_opt_in, description: 'Help improve healthcare through research' },
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SECURITY_SETTINGS_ERROR');
  }
};

// POST /patient/security/2fa/toggle
const toggle2FA = async (req, res) => {
  try {
    const { enabled, method } = req.body;
    await req.user.update({ two_factor_enabled: enabled, two_factor_method: method || 'sms' });
    return successResponse(res, null, `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'TOGGLE_2FA_ERROR');
  }
};

// PUT /patient/security/data-sharing
const updateDataSharing = async (req, res) => {
  try {
    const { providerSharing, researchOptIn } = req.body;
    await req.user.update({ provider_sharing: providerSharing, research_opt_in: researchOptIn });
    return successResponse(res, null, 'Preferences updated');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DATA_SHARING_ERROR');
  }
};

// POST /patient/security/request-data
const requestDataExport = async (req, res) => {
  try {
    await Notification.create({
      user_id: req.user.id,
      title: 'Data Export Requested',
      message: 'Your data export request has been received and will be processed within 15 minutes.',
      notification_type: 'system',
      channel: 'in_app',
    });
    return successResponse(res, {
      requestId: `EXP-${Date.now()}`,
      estimatedCompletion: '15 minutes',
      status: 'pending',
    }, 'Data export requested');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DATA_EXPORT_ERROR');
  }
};

// POST /patient/profile/image
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file)
      return errorResponse(res, 'No image file provided', 400, 'NO_FILE');

    if (req.user.profile_image) {
      const urlParts = req.user.profile_image.split('/');
      const publicId = `afyabridge/patient-profiles/${urlParts[urlParts.length - 1].split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId);
    }

    const result = await uploadToCloudinary(req.file.buffer, 'afyabridge/patient-profiles');
    await req.user.update({ profile_image: result.secure_url });

    return successResponse(res, { profileImage: result.secure_url }, 'Profile image uploaded successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPLOAD_IMAGE_ERROR');
  }
};

// DELETE /patient/profile/image
const deleteProfileImage = async (req, res) => {
  try {
    if (!req.user.profile_image)
      return errorResponse(res, 'No profile image to delete', 400, 'NO_IMAGE');

    const urlParts = req.user.profile_image.split('/');
    const publicId = `afyabridge/patient-profiles/${urlParts[urlParts.length - 1].split('.')[0]}`;
    await cloudinary.uploader.destroy(publicId);
    await req.user.update({ profile_image: null });

    return successResponse(res, null, 'Profile image deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_IMAGE_ERROR');
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
  getSecuritySettings,
  toggle2FA,
  updateDataSharing,
  requestDataExport,
  uploadProfileImage,
  deleteProfileImage,
};