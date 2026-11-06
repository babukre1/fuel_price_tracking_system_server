const mongoose = require("mongoose");

const SUPPLIER_CITIES = ["Mogadishu"];

const supplierSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },

    companyName: {
      type: String,
      required: true,
      unique: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },
    emailVerified: { type: Boolean, default: true },
    emailVerificationCodeHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    emailVerificationSentAt: { type: Date, select: false },
    emailVerificationAttempts: { type: Number, default: 0, select: false },
    passwordResetCodeHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetSentAt: { type: Date, select: false },
    passwordResetAttempts: { type: Number, default: 0, select: false },
    tokenVersion: { type: Number, default: 0, select: false },

    businessLicenseNumber: {
      type: String,
    },

    address: {
      type: String,
    },

    city: {
      type: String,
      enum: SUPPLIER_CITIES,
    },

    logo: {
      type: String,
    },

    image: {
      type: String,
      required: false,
    },

    profileImage: {
      type: String,
      required: false,
    },

    profileImageKey: {
      type: String,
      required: false,
    },

    businessDocument: {
      type: String,
      required: false,
    },

    businessDocumentKey: {
      type: String,
      required: false,
    },

    description: {
      type: String,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    deviceTokens: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Supplier", supplierSchema);
