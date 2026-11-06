const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // allows multiple nulls with unique index
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
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    refreshTokens: {
      type: [
        {
          tokenHash: { type: String, required: true },
          expiresAt: { type: Date, required: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        // default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
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

// Geospatial index for nearby fuel station queries
userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
