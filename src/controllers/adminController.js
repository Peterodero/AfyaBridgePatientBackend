const notifications = require('../models/notifications');
const otp_verifications = require('../models/otp_verifications');
const users = require('../models/users');
const vitals = require('../models/vitals');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');

// GET /admin/users
const getAllPatients = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, registeredFrom, registeredTo, search } = req.query;

    const where = { role: 'patient' };

    if (status === 'active')    where.account_status = 'active';
    if (status === 'suspended') where.account_status = 'suspended';

    if (registeredFrom || registeredTo) {
      where.created_at = {};
      if (registeredFrom) where.created_at[Op.gte] = new Date(registeredFrom);
      if (registeredTo)   where.created_at[Op.lte] = new Date(registeredTo);
    }

    if (search) {
      where[Op.or] = [
        { full_name:    { [Op.like]: `%${search}%` } },
        { email:        { [Op.like]: `%${search}%` } },
        { phone_number: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await users.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']],
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
    const patient = await users.findOne({
      where: { id: req.params.id, role: 'patient' },
      attributes: { exclude: ['password_hash'] },
    });

    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    // Vitals are in their own table
    const vitals = await vitals.findAll({
      where: { patient_id: patient.id },
      order: [['recorded_at', 'DESC']],
      limit: 5,
    });

    const unreadNotifications = await notifications.count({
      where: { user_id: patient.id, is_read: false },
    });

    return successResponse(res, {
      patient,
      accountHistory: {
        unreadNotifications,
        lastPasswordChange: patient.last_password_change,
        lastLogin: patient.last_login,
        accountStatus: patient.account_status,
      },
      linkedData: {
        // allergies, conditions, emergency_contacts, surgeries, visits are JSON columns on user
        allergies:         patient.allergies         || [],
        conditions:        patient.conditions        || [],
        emergencyContacts: patient.emergency_contacts || [],
        surgeries:         patient.surgeries         || [],
        visits:            patient.visits            || [],
        vitals,
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

    const validStatuses = ['active', 'suspended', 'locked', 'disabled'];
    if (!validStatuses.includes(status))
      return errorResponse(res, `Status must be one of: ${validStatuses.join(', ')}`, 400, 'INVALID_STATUS');

    const patient = await users.findOne({ where: { id: req.params.id, role: 'patient' } });
    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    await patient.update({
      account_status: status,
      status_reason: reason || null,
      is_active: status === 'active',
    });

    await notifications.create({
      user_id: patient.id,
      title: status === 'active' ? 'Account Activated' : 'Account Suspended',
      message: status === 'active'
        ? 'Your account has been activated. You can now access all services.'
        : `Your account has been suspended. Reason: ${reason || 'Policy violation'}`,
      notification_type: 'system',
      channel: 'in_app',
    });

    return successResponse(res, {
      patientId: patient.id,
      status,
      reason: reason || null,
    }, `Patient account ${status === 'active' ? 'activated' : 'suspended'} successfully`);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_STATUS_ERROR');
  }
};

// DELETE /admin/users/:id
const deletePatient = async (req, res) => {
  try {
    const patient = await users.findOne({ where: { id: req.params.id, role: 'patient' } });
    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    // Delete linked records in other tables
    await Promise.all([
      vitals.destroy({ where: { patient_id: patient.id } }),
      notifications.destroy({ where: { user_id: patient.id } }),
      otp_verifications.destroy({
        where: {
          [Op.or]: [
            { phone: patient.phone_number },
            { email: patient.email },
          ],
        },
      }),
    ]);

    // Allergies, conditions, emergency_contacts, etc. are JSON columns — deleted with the user row
    await patient.destroy();

    return successResponse(res, { deletedPatientId: req.params.id }, 'Patient account permanently deleted');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_PATIENT_ERROR');
  }
};

// PATCH /admin/users/:id/reset-password
const adminResetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8)
      return errorResponse(res, 'New password must be at least 8 characters', 400, 'INVALID_PASSWORD');

    const patient = await users.findOne({ where: { id: req.params.id, role: 'patient' } });
    if (!patient) return errorResponse(res, 'Patient not found', 404, 'NOT_FOUND');

    // beforeUpdate hook hashes automatically
    await patient.update({
      password_hash: newPassword,
      last_password_change: new Date(),
    });

    await notifications.create({
      user_id: patient.id,
      title: 'Password Changed by Admin',
      message: 'Your password has been reset by an administrator. If you did not request this, contact support immediately.',
      notification_type: 'system',
      channel: 'in_app',
    });

    return successResponse(res, { patientId: patient.id }, 'Password reset successful');
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
