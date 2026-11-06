const { z } = require("zod");

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "must be a valid MongoDB id");

const fuelType = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(["PETROL", "DIESEL", "KEROSENE"]),
);

const price = z.coerce
  .number()
  .finite("must be a finite number")
  .positive("must be greater than zero")
  .max(1000, "must not exceed 1000");

const booleanValue = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const createFuelPriceSchema = z.object({ fuelType, price }).strict();

const bulkFuelPriceSchema = createFuelPriceSchema.extend({
  stationIds: z.array(objectId).min(1).max(100),
});

const updateFuelPriceSchema = z
  .strictObject({
    price: price.optional(),
    isActive: booleanValue.optional(),
    effectiveFrom: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one update field is required",
  });

module.exports = {
  createFuelPriceSchema,
  bulkFuelPriceSchema,
  updateFuelPriceSchema,
};
