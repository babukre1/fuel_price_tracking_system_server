const Notification = require("./model");
const Broadcast = require("./broadcast.model");
const Supplier = require("../supplier/model");
const User = require("../User/model");
const { sendPushToSupplier, sendPushToUser } = require("../utils/sendPushNotification");

exports.adminSendNotification = async (req, res) => {
  try {
    const { recipientType, recipientIds, recipientModel, title, body } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
      });
    }

    if (!["all_suppliers", "all_users", "both", "specific"].includes(recipientType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid recipientType",
      });
    }

    if (recipientType === "specific" && (!Array.isArray(recipientIds) || recipientIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "recipientIds array is required for specific recipients",
      });
    }

    if (recipientType === "specific" && !["Supplier", "User"].includes(recipientModel)) {
      return res.status(400).json({
        success: false,
        message: "recipientModel must be Supplier or User for specific recipients",
      });
    }

    // Resolve recipient list
    let recipients = [];

    if (recipientType === "all_suppliers") {
      const suppliers = await Supplier.find({ isActive: true }).select("_id").lean();
      recipients = suppliers.map((s) => ({ id: s._id, model: "Supplier" }));
    } else if (recipientType === "all_users") {
      const users = await User.find({ isActive: true }).select("_id").lean();
      recipients = users.map((u) => ({ id: u._id, model: "User" }));
    } else if (recipientType === "both") {
      const [suppliers, users] = await Promise.all([
        Supplier.find({ isActive: true }).select("_id").lean(),
        User.find({ isActive: true }).select("_id").lean(),
      ]);
      recipients = [
        ...suppliers.map((s) => ({ id: s._id, model: "Supplier" })),
        ...users.map((u) => ({ id: u._id, model: "User" })),
      ];
    } else {
      recipients = recipientIds.map((id) => ({ id, model: recipientModel }));
    }

    if (recipients.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active recipients found",
        recipientCount: 0,
      });
    }

    // Fan out FCM pushes (fire-and-forget)
    // sendPushToSupplier/sendPushToUser already persist a Notification record,
    // so we skip insertMany here to avoid duplicates.
    for (const r of recipients) {
      if (r.model === "Supplier") {
        sendPushToSupplier(r.id, { title, body, data: { type: "admin_broadcast" } }).catch(() => {});
      } else {
        sendPushToUser(r.id, { title, body, data: { type: "admin_broadcast" } }).catch(() => {});
      }
    }

    // Log broadcast metadata
    await Broadcast.create({
      sender: req.user.id,
      title,
      body,
      recipientType,
      recipientCount: recipients.length,
    });

    res.status(201).json({
      success: true,
      message: "Notification sent",
      recipientCount: recipients.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send notification",
      error: error.message,
    });
  }
};

exports.getBroadcasts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Broadcast.find()
        .populate("sender", "fullName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Broadcast.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load broadcasts",
      error: error.message,
    });
  }
};
