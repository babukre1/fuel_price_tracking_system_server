const mongoose = require("mongoose");

const broadcastSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userAdmin",
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

    recipientType: {
      type: String,
      enum: ["all_suppliers", "all_users", "both", "specific"],
      required: true,
    },

    recipientCount: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Broadcast", broadcastSchema);
