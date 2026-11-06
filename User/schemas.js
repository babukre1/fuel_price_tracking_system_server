const { z } = require("zod");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "is required")
  .email("must be a valid email address")
  .max(254, "must be 254 characters or fewer");

const password = z
  .string()
  .min(8, "must be at least 8 characters")
  .max(128, "must be 128 characters or fewer")
  .regex(/[A-Za-z]/, "must contain at least one letter")
  .regex(/\d/, "must contain at least one number");

const phone = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(
      /^[+\d\s().-]{7,20}$/,
      "must contain 7-20 valid phone characters",
    )
    .optional(),
);

exports.registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "must be at least 2 characters")
    .max(120, "must be 120 characters or fewer"),
  email,
  phone,
  password,
});

exports.loginSchema = z.object({
  email,
  password: z.string().min(1, "is required").max(128),
});

exports.verifyEmailSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/, "must be a 6-digit code"),
});

exports.resendVerificationSchema = z.object({ email });

exports.forgotPasswordSchema = z.object({ email });

exports.resetPasswordSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/, "must be a 6-digit code"),
  newPassword: password,
});

exports.refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, "is required"),
});

exports.changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "is required").max(128),
  newPassword: password,
});
