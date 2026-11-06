const mongoose = require("mongoose");

const stationCurrentPriceSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },

    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Station",
      required: true,
    },

    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "KEROSENE"],
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0.1,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true },
);

// One row per (station, fuelType) — the database enforces this, not the app
stationCurrentPriceSchema.index({ station: 1, fuelType: 1 }, { unique: true });
stationCurrentPriceSchema.index({ supplier: 1 });

module.exports = mongoose.model("StationCurrentPrice", stationCurrentPriceSchema);
