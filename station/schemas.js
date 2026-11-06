const { z } = require("zod");

// ── Shared field validators ───────────────────────────────────────────────────

// Somali numbers vary; same rule as supplier module
const phoneField = z
  .string()
  .trim()
  .regex(
    /^[+\d\s\-().]{4,20}$/,
    "invalid format — use digits, +, spaces, or dashes (7–20 characters)",
  );

const nonEmptyStr = (max = 120) =>
  z
    .string()
    .trim()
    .min(1, "cannot be empty")
    .max(max, `must be ${max} characters or fewer`);

// Boolean that also accepts the strings "true" / "false" (form submission compat)
const boolField = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v),
  z.boolean(),
);

const objectIdField = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "invalid ObjectId format");

// Coordinates — coerce from string (form/query) or number (JSON), then range-check
const longitudeField = z.coerce
  .number()
  .finite("must be a finite number")
  .min(-180, "must be in range [-180, 180]")
  .max(180, "must be in range [-180, 180]");

const latitudeField = z.coerce
  .number()
  .finite("must be a finite number")
  .min(-90, "must be in range [-90, 90]")
  .max(90, "must be in range [-90, 90]");

const stationStatus = z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
const stationCities = ["Mogadishu"];
const cityField = z.enum(stationCities);

// Uppercase each element before the enum check so "petrol" → "PETROL" is accepted.
// The validate middleware writes result.data back to req.body, so the controller
// receives already-uppercased values and only needs to deduplicate.
const fuelTypesField = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v.map((s) => (typeof s === "string" ? s.toUpperCase() : s))
      : v,
  z
    .array(z.enum(["PETROL", "DIESEL", "KEROSENE"]))
    .min(1, "fuelTypes must contain at least one fuel type"),
);

// ── POST / — create station ───────────────────────────────────────────────────

exports.createStationSchema = z.object({
  name: nonEmptyStr(),
  longitude: longitudeField,
  latitude: latitudeField,
  phone: phoneField.optional(),
  address: nonEmptyStr(300).optional(),
  city: cityField.optional(),
  fuelTypes: fuelTypesField.optional(),
  // admin-only; controller ignores this for non-admins, but still validate format
  supplier: objectIdField.optional(),
});

// ── PATCH /:id — update station ───────────────────────────────────────────────
// All fields optional; empty strings rejected (RC-5).
// lon/lat pairing (both-or-neither) is still enforced in the controller — schema only
// validates range when a coordinate value is present.

exports.updateStationSchema = z.object({
  name: nonEmptyStr().optional(),
  phone: phoneField.optional(),
  address: nonEmptyStr(300).optional(),
  city: cityField.optional(),
  isActive: boolField.optional(),
  fuelTypes: fuelTypesField.optional(),
  longitude: longitudeField.optional(),
  latitude: latitudeField.optional(),
  // admin-only fields — controller checks role before applying them
  status: stationStatus.optional(),
  supplier: objectIdField.optional(),
});
