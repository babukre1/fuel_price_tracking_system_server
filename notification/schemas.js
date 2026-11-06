const { z } = require("zod");

// MongoDB ObjectId: 24 hex characters.
const objectIdPattern = /^[a-f\d]{24}$/i;

// Validates req.params.id for endpoints that address a single notification.
// Used inline via safeParse(req.params) rather than via the validate() middleware,
// because validate() reads req.body and these endpoints carry no body.
exports.idParamSchema = z.object({
  id: z.string().regex(objectIdPattern, "invalid notification id"),
});
