const { Notification } = require("../models");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

// GET /notifications
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const patientId = req.patient.id;

    const notifications = await Notification.findAll({
      where: { patientId },
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    const unreadCount = await Notification.count({
      where: { patientId, read: false },
    });

    // Group by date (Today, Yesterday, Older)
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const sections = {};
    notifications.forEach((n) => {
      const dateStr = new Date(n.createdAt).toDateString();
      let label =
        dateStr === today
          ? "Today"
          : dateStr === yesterday
            ? "Yesterday"
            : new Date(n.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              });

      if (!sections[label]) sections[label] = [];
      sections[label].push({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        timestamp: formatTimestamp(n.createdAt),
        read: n.read,
        icon: n.icon,
        iconBg: n.iconBg,
        actions: n.actionPayload,
      });
    });

    return successResponse(res, {
      sections: Object.entries(sections).map(([title, notifications]) => ({
        title,
        notifications,
      })),
      unreadCount,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, "GET_NOTIFICATIONS_ERROR");
  }
};

// PATCH /notifications/:notificationId/read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      where: { id: notificationId, patientId: req.patient.id },
    });
    if (!notification)
      return errorResponse(res, "Notification not found", 404, "NOT_FOUND");

    await notification.update({ read: true });

    const unreadCount = await Notification.count({
      where: { patientId: req.patient.id, read: false },
    });

    return successResponse(res, { unreadCount }, "Notification marked as read");
  } catch (error) {
    return errorResponse(res, error.message, 500, "MARK_READ_ERROR");
  }
};

// POST /notifications/read-all
const markAllAsRead = async (req, res) => {
  try {
    const [markedCount] = await Notification.update(
      { read: true },
      { where: { patientId: req.patient.id, read: false } },
    );

    return successResponse(
      res,
      { markedCount, unreadCount: 0 },
      "All notifications marked as read",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "MARK_ALL_READ_ERROR");
  }
};

// GET /notifications/unread/count
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({
      where: { patientId: req.patient.id, read: false },
    });
    return successResponse(res, { count });
  } catch (error) {
    return errorResponse(res, error.message, 500, "UNREAD_COUNT_ERROR");
  }
};

// DELETE /notifications/:notificationId
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.notificationId, patientId: req.patient.id },
    });
    if (!notification)
      return errorResponse(res, "Notification not found", 404, "NOT_FOUND");

    await notification.destroy();

    const unreadCount = await Notification.count({
      where: { patientId: req.patient.id, read: false },
    });

    return successResponse(
      res,
      { unreadCount },
      "Notification deleted successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500, "DELETE_NOTIFICATION_ERROR");
  }
};

// DELETE /notifications/delete-all
const deleteAllNotifications = async (req, res) => {
  try {
    const deletedCount = await Notification.destroy({
      where: { patientId: req.patient.id },
    });

    return successResponse(
      res,
      { deletedCount },
      "All notifications deleted successfully",
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      500,
      "DELETE_ALL_NOTIFICATIONS_ERROR",
    );
  }
};

const formatTimestamp = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
};
