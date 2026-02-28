const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

// All admin routes are protected by adminAuth middleware

// GET /admin/users
router.get('/users', adminAuth, adminController.getAllPatients);

// GET /admin/users/:id
router.get('/users/:id', adminAuth, adminController.getPatientById);

// PATCH /admin/users/:id/status
router.patch('/users/:id/status',
  adminAuth,
  [
    body('status')
      .isIn(['active', 'suspended'])
      .withMessage('Status must be active or suspended'),
    body('reason')
      .optional()
      .notEmpty()
      .withMessage('Reason cannot be empty'),
    validate,
  ],
  adminController.updatePatientStatus
);

// DELETE /admin/users/:id
router.delete('/users/:id', adminAuth, adminController.deletePatient);

// PATCH /admin/users/:id/reset-password
router.patch('/users/:id/reset-password', adminAuth, adminController.adminResetPassword);

module.exports = router;