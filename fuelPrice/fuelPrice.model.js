const mongoose = require("mongoose");

const fuelPriceSchema = new mongoose.Schema(
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
      min: 0,
    },

    isCurrent: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    effectiveFrom: {
      type: Date,
      default: () => new Date(),
    },

    effectiveTo: {
      type: Date,
      default: null,
    },

    createdBySupplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userAdmin",
      default: null,
    },

    closedBySupplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    closedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "userAdmin",
      default: null,
    },

    isFlagged: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Only one active current price per station and fuel type.
fuelPriceSchema.index(
  { station: 1, fuelType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isCurrent: true,
      isActive: true,
    },
    name: "unique_current_price_per_station_fueltype",
  },
);

// Useful for station price history and reports.
fuelPriceSchema.index({ station: 1, fuelType: 1, effectiveFrom: -1 });

// Useful for supplier reports.
fuelPriceSchema.index({ supplier: 1, effectiveFrom: -1 });

module.exports = mongoose.model("FuelPrice", fuelPriceSchema);
