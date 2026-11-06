const mongoose = require("mongoose");

const STATION_CITIES = ["Mogadishu"];

const stationSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
      enum: STATION_CITIES,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    fuelTypes: {
      type: [String],
      enum: ["PETROL", "DIESEL", "KEROSENE"],
      default: ["PETROL", "DIESEL", "KEROSENE"],
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "APPROVED",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

stationSchema.index({ location: "2dsphere" });
stationSchema.index({ supplier: 1 });
stationSchema.index({ status: 1 });

module.exports = mongoose.model("Station", stationSchema);
