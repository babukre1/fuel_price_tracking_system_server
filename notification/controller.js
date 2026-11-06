const Notification = require("./model");
const { idParamSchema } = require("./schemas");

// ── GET /notifications ────────────────────────────────────────────────────────
// Returns the authenticated supplier's notifications, newest first, paginated.
// Includes unreadCount so the bell badge needs no second request.
exports.getNotifications = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const recipientModel = req.user.role === "user" ? "User" : "Supplier";
    const baseFilter = { recipientModel, recipient: req.user.id, deletedAt: null };

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(baseFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(baseFilter),
      Notification.countDocuments({ ...baseFilter, readAt: null }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        unreadCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load notifications",
      error: error.message,
    });
  }
};

// ── PATCH /notifications/read-all ─────────────────────────────────────────────
// Marks every unread notification for this supplier as read in one DB call.
exports.markAllRead = async (req, res) => {
  try {
    const recipientModel = req.user.role === "user" ? "User" : "Supplier";
    const result = await Notification.updateMany(
      { recipientModel, recipient: req.user.id, readAt: null, deletedAt: null },
      { readAt: new Date() },
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      count: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
      error: error.message,
    });
  }
};

// ── PATCH /notifications/:id/read ─────────────────────────────────────────────
// Marks one notification as read. Returns 200 unchanged if already read.
exports.markRead = async (req, res) => {
  try {
    const recipientModel = req.user.role === "user" ? "User" : "Supplier";
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0].message,
      });
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      recipientModel,
      recipient: req.user.id,
      deletedAt: null,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.readAt === null) {
      notification.readAt = new Date();
      await notification.save();
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error.message,
    });
  }
};

// ── DELETE /notifications/:id ─────────────────────────────────────────────────
// Soft-deletes a notification. Verifies ownership before proceeding.
exports.deleteNotification = async (req, res) => {
  try {
    const recipientModel = req.user.role === "user" ? "User" : "Supplier";
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0].message,
      });
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      recipientModel,
      recipient: req.user.id,
      deletedAt: null,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    notification.deletedAt = new Date();
    await notification.save();

    res.status(200).json({
      success: true,
      message: "Notification deleted",
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

// ── DELETE /notifications/clear-all ────────────────────────────────────────────
// Soft-deletes all notifications for the current user.
exports.clearAllNotifications = async (req, res) => {
  try {
    const recipientModel = req.user.role === "user" ? "User" : "Supplier";
    const result = await Notification.updateMany(
      { recipientModel, recipient: req.user.id, deletedAt: null },
      { deletedAt: new Date() },
    );

    res.status(200).json({
      success: true,
      message: "All notifications cleared",
      count: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to clear notifications",
      error: error.message,
    });
  }
};

// ── DELETE /notifications/clear-old-read ───────────────────────────────────────
// Soft-deletes read notifications older than 24 hours. Unread ones are kept.
exports.clearOldReadNotifications = async (req, res) => {
  try {
    const recipientModel = req.user.role === "user" ? "User" : "Supplier";
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);

    const result = await Notification.updateMany(
      {
        recipientModel,
        recipient: req.user.id,
        deletedAt: null,
        readAt: { $ne: null, $lt: cutoff },
      },
      { deletedAt: new Date() },
    );

    res.status(200).json({
      success: true,
      message: "Old read notifications cleared",
      count: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to clear old notifications",
      error: error.message,
    });
  }
};
