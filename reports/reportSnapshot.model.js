const mongoose = require("mongoose");

const reportSnapshotSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "overview",
        "suppliers",
        "stations",
        "current-prices",
        "price-history",
        "flagged-prices",
        "station-followers",
        "customer-follows",
      ],
      required: true,
      unique: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    rowCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ReportSnapshot", reportSnapshotSchema);
