const { z } = require("zod");

// ── Shared field validators ───────────────────────────────────────────────────

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "cannot be empty")
  .email("invalid email address")
  .max(254, "must be 254 characters or fewer");

// Somali numbers vary; accept digits, +, spaces, dashes, parens — 7–20 chars total
const phoneField = z
  .string()
  .trim()
  .regex(
    /^[+\d\s\-().]{4,20}$/,
    "invalid format — use digits, +, spaces, or dashes (7–20 characters)",
  );

const passwordField = z
  .string()
  .min(6, "must be at least 6 characters")
  .max(128, "must be 128 characters or fewer");

// String that rejects empty values when provided
const nonEmptyStr = (max = 120) =>
  z
    .string()
    .trim()
    .min(1, "cannot be empty")
    .max(max, `must be ${max} characters or fewer`);

const optionalNonEmptyStr = (max = 120) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    nonEmptyStr(max).optional(),
  );

const optionalUrlOrEmptyStr = (max = 500) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(max, `must be ${max} characters or fewer`).optional(),
  );

const supplierCities = ["Mogadishu"];
const optionalCityField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.enum(supplierCities).optional(),
);

// Boolean that also accepts the strings "true" / "false" (form submission compat)
const boolField = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v),
  z.boolean(),
);

// ── Supplier create (signup + admin create) ───────────────────────────────────

const supplierCreateBase = {
  fullName: nonEmptyStr(),
  companyName: nonEmptyStr(),
  email: emailField,
  phone: phoneField,
  password: passwordField,
  businessLicenseNumber: optionalNonEmptyStr(100),
  address: optionalNonEmptyStr(300),
  city: optionalCityField,
  description: optionalNonEmptyStr(2000),
  image: optionalUrlOrEmptyStr(),
  profileImage: optionalUrlOrEmptyStr(),
  businessDocument: optionalUrlOrEmptyStr(),
};

exports.signupSchema = z.object(supplierCreateBase);

exports.verifyEmailSchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, "must be a 6-digit code"),
});

exports.resendVerificationSchema = z.object({ email: emailField });

exports.forgotPasswordSchema = z.object({ email: emailField });

exports.resetPasswordSchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, "must be a 6-digit code"),
  newPassword: passwordField,
});

exports.createSupplierSchema = z.object({
  ...supplierCreateBase,
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  isVerified: boolField.optional(),
  isActive: boolField.optional(),
});

// ── Supplier profile update (own) ─────────────────────────────────────────────

exports.updateProfileSchema = z.object({
  fullName: nonEmptyStr().optional(),
  companyName: nonEmptyStr().optional(),
  email: emailField.optional(),
  phone: phoneField.optional(),
  businessLicenseNumber: optionalNonEmptyStr(100),
  address: optionalNonEmptyStr(300),
  city: optionalCityField,
  logo: optionalNonEmptyStr(500),
  image: optionalUrlOrEmptyStr(),
  profileImage: optionalUrlOrEmptyStr(),
  businessDocument: optionalUrlOrEmptyStr(),
  currentPassword: z.string().min(1, "cannot be empty").optional(),
  description: optionalNonEmptyStr(2000),
});

// ── Admin update supplier ─────────────────────────────────────────────────────

exports.updateSupplierSchema = z.object({
  fullName: nonEmptyStr().optional(),
  companyName: nonEmptyStr().optional(),
  email: emailField.optional(),
  phone: phoneField.optional(),
  password: passwordField.optional(),
  businessLicenseNumber: optionalNonEmptyStr(100),
  address: optionalNonEmptyStr(300),
  city: optionalCityField,
  logo: optionalNonEmptyStr(500),
  image: optionalUrlOrEmptyStr(),
  profileImage: optionalUrlOrEmptyStr(),
  businessDocument: optionalUrlOrEmptyStr(),
  description: optionalNonEmptyStr(2000),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  isVerified: boolField.optional(),
  isActive: boolField.optional(),
});

// ── Auth ──────────────────────────────────────────────────────────────────────

exports.loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "cannot be empty"),
});

exports.changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "cannot be empty"),
  newPassword: passwordField,
});

exports.deviceTokenSchema = z.object({
  token: z.string().trim().min(1, "token cannot be empty"),
});
