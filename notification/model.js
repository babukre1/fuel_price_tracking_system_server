const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "recipientModel",
      required: true,
    },

    recipientModel: {
      type: String,
      enum: ["Supplier", "User"],
      default: "Supplier",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    body: {
      type: String,
      required: true,
    },

    // Arbitrary key/value payload forwarded from the push (e.g. stationId, type).
    data: {
      type: Object,
      default: {},
    },

    // null = unread; set to a Date when the supplier reads it.
    readAt: {
      type: Date,
      default: null,
    },

    // Soft-delete: null = visible; set to a Date on delete.
    // Hard deletion deferred to a future cleanup job (see v1.1 TODO below).
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }, // createdAt doubles as "sent at"
);

// Primary query path: all live notifications for one supplier, newest first.
notificationSchema.index({ recipientModel: 1, recipient: 1, createdAt: -1 });

// TODO (v1.1): add a background job / admin endpoint that hard-deletes
// notifications where createdAt < now - 90 days to prevent unbounded growth.

module.exports = mongoose.model("Notification", notificationSchema);
