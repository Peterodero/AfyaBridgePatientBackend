const { Patient, OTP, RefreshToken, Allergy, Condition, Vital, MedicalRecord, EmergencyContact, Notification, SymptomSession } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { saveOTP, sendOTP } = require('../utils/otp');
const { Op } = require('sequelize');

// GET /admin/users
const getAllPatients = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      registeredFrom,
      registeredTo,
      search,
    } = req.query;

    console.log(req.query);

    const where = {}; 

    // Filter by status
    if (status === 'active') where.isActive = true;
    if (status === 'suspended') where.isActive = false;

    // Filter by registration date
    if (registeredFrom || registeredTo) {
      where.createdAt = {};
      if (registeredFrom) where.createdAt[Op.gte] = new Date(registeredFrom);
      if (registeredTo) where.createdAt[Op.lte] = new Date(registeredTo);
    }

    // Search by name, email or phone
    if (search) {
      where[Op.or] = [
        { fullName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phoneNumber: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Patient.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return successResponse(res, {
      patients: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_ALL_PATIENTS_ERROR');
  }
};

// GET /admin/users/:id
const getPatientById = async (req, res) => {
  try {
    const patient = await Patient.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
    });

    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    // Get all linked data
    const allergies = await Allergy.findAll({ where: { patientId: patient.id } });
    const conditions = await Condition.findAll({ where: { patientId: patient.id } });
    const vitals = await Vital.findAll({
      where: { patientId: patient.id },
      order: [['recordedAt', 'DESC']],
      limit: 5,
    });
    const medicalRecords = await MedicalRecord.findAll({
      where: { patientId: patient.id },
      order: [['date', 'DESC']],
      limit: 5,
    });
    const emergencyContact = await EmergencyContact.findOne({
      where: { patientId: patient.id },
    });
    const activeSessions = await RefreshToken.count({
      where: { patientId: patient.id, revoked: false },
    });
    const symptomSessions = await SymptomSession.count({
      where: { patientId: patient.id },
    });
    const unreadNotifications = await Notification.count({
      where: { patientId: patient.id, read: false },
    });

    return successResponse(res, {
      patient,
      accountHistory: {
        activeSessions,
        symptomSessions,
        unreadNotifications,
        lastPasswordChange: patient.lastPasswordChange,
      },
      linkedData: {
        allergies,
        conditions,
        vitals,
        medicalRecords,
        emergencyContact,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_PATIENT_ERROR');
  }
};

// PATCH /admin/users/:id/status
const updatePatientStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return errorResponse(res, 'Status must be active or suspended', 400, 'INVALID_STATUS');
    }

    const patient = await Patient.findByPk(req.params.id);
    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    const isActive = status === 'active';
    await patient.update({ isActive });

    // Revoke all sessions if suspending
    if (!isActive) {
      await RefreshToken.update(
        { revoked: true },
        { where: { patientId: patient.id } }
      );
    }

    // Notify patient
    await Notification.create({
      patientId: patient.id,
      type: 'general',
      title: isActive ? 'Account Activated' : 'Account Suspended',
      message: isActive
        ? 'Your account has been activated. You can now access all services.'
        : `Your account has been suspended. Reason: ${reason || 'Policy violation'}`,
      icon: isActive ? '✅' : '⛔',
      iconBg: isActive ? '#10B981' : '#EF4444',
    });

    return successResponse(res, {
      patientId: patient.id,
      status,
      isActive,
      reason: reason || null,
    }, `Patient account ${status === 'active' ? 'activated' : 'suspended'} successfully`);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_STATUS_ERROR');
  }
};

// DELETE /admin/users/:id
const deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findByPk(req.params.id);
    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    // Delete all linked data first
    await Promise.all([
      Allergy.destroy({ where: { patientId: patient.id } }),
      Condition.destroy({ where: { patientId: patient.id } }),
      Vital.destroy({ where: { patientId: patient.id } }),
      MedicalRecord.destroy({ where: { patientId: patient.id } }),
      EmergencyContact.destroy({ where: { patientId: patient.id } }),
      Notification.destroy({ where: { patientId: patient.id } }),
      SymptomSession.destroy({ where: { patientId: patient.id } }),
      RefreshToken.destroy({ where: { patientId: patient.id } }),
      OTP.destroy({ where: { phoneNumber: patient.phoneNumber } }),
    ]);

    // Delete patient
    await patient.destroy();

    return successResponse(res, {
      deletedPatientId: req.params.id,
    }, 'Patient account permanently deleted');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_PATIENT_ERROR');
  }
};

// PATCH /admin/users/:id/reset-password
const adminResetPassword = async (req, res) => {
  try {
    const patient = await Patient.findByPk(req.params.id);
    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    // Generate and send OTP to patient's phone
    const otpCode = await saveOTP(patient.phoneNumber, 'reset');
    await sendOTP(patient.phoneNumber, otpCode);

    // Revoke all active sessions
    await RefreshToken.update(
      { revoked: true },
      { where: { patientId: patient.id } }
    );

    // Notify patient
    await Notification.create({
      patientId: patient.id,
      type: 'general',
      title: 'Password Reset Initiated',
      message: 'A password reset has been initiated for your account. Check your phone for the reset code.',
      icon: '🔐',
      iconBg: '#F59E0B',
    });

    return successResponse(res, {
      patientId: patient.id,
      phoneNumber: patient.phoneNumber.slice(0, 5) + '******' + patient.phoneNumber.slice(-3),
      message: 'Password reset OTP sent to patient phone',
    }, 'Password reset initiated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'ADMIN_RESET_PASSWORD_ERROR');
  }
};

module.exports = {
  getAllPatients,
  getPatientById,
  updatePatientStatus,
  deletePatient,
  adminResetPassword,
};