const { Notification } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');

const formatTimestamp = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
};

// GET /notifications
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const user_id = req.user.id;

    const notifications = await Notification.findAll({
      where: { user_id },
      order: [['sent_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    const unreadCount = await Notification.count({ where: { user_id, is_read: false } });

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const sections = {};
    notifications.forEach((n) => {
      const dateStr = new Date(n.sent_at).toDateString();
      const label = dateStr === today ? 'Today'
        : dateStr === yesterday ? 'Yesterday'
        : new Date(n.sent_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

      if (!sections[label]) sections[label] = [];
      sections[label].push({
        id: n.id,
        type: n.notification_type,
        title: n.title,
        message: n.message,
        channel: n.channel,
        timestamp: formatTimestamp(n.sent_at),
        read: n.is_read,
        referenceId: n.reference_id,
        referenceType: n.reference_type,
      });
    });

    return successResponse(res, {
      sections: Object.entries(sections).map(([title, notifications]) => ({ title, notifications })),
      unreadCount,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_NOTIFICATIONS_ERROR');
  }
};

// PATCH /notifications/:notificationId/read
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.notificationId, user_id: req.user.id },
    });
    if (!notification)
      return errorResponse(res, 'Notification not found', 404, 'NOT_FOUND');

    await notification.update({ is_read: true, read_at: new Date() });

    const unreadCount = await Notification.count({ where: { user_id: req.user.id, is_read: false } });
    return successResponse(res, { unreadCount }, 'Notification marked as read');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MARK_READ_ERROR');
  }
};

// POST /notifications/read-all
const markAllAsRead = async (req, res) => {
  try {
    const [markedCount] = await Notification.update(
      { is_read: true, read_at: new Date() },
      { where: { user_id: req.user.id, is_read: false } }
    );
    return successResponse(res, { markedCount, unreadCount: 0 }, 'All notifications marked as read');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'MARK_ALL_READ_ERROR');
  }
};

// GET /notifications/unread/count
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({ where: { user_id: req.user.id, is_read: false } });
    return successResponse(res, { count });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UNREAD_COUNT_ERROR');
  }
};

// DELETE /notifications/:notificationId
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.notificationId, user_id: req.user.id },
    });
    if (!notification)
      return errorResponse(res, 'Notification not found', 404, 'NOT_FOUND');

    await notification.destroy();
    const unreadCount = await Notification.count({ where: { user_id: req.user.id, is_read: false } });
    return successResponse(res, { unreadCount }, 'Notification deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_NOTIFICATION_ERROR');
  }
};

// DELETE /notifications/delete-all
const deleteAllNotifications = async (req, res) => {
  try {
    const deletedCount = await Notification.destroy({ where: { user_id: req.user.id } });
    return successResponse(res, { deletedCount }, 'All notifications deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_ALL_NOTIFICATIONS_ERROR');
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
};
