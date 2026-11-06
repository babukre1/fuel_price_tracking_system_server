const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const { handleSupplierFilesUpload } = require("../middleware/uploadImage");
const validate = require("../middleware/validate");
const rateLimiter = require("../middleware/rateLimiter");
const {
  signupSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  createSupplierSchema,
  updateSupplierSchema,
  deviceTokenSchema,
} = require("./schemas");
const {
  signup,
  verifyEmail,
  resendVerification,
  login,
  forgotPassword,
  resetPassword,
  getMyProfile,
  updateMyProfile,
  changePassword,
  registerDeviceToken,
  removeDeviceToken,
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
} = require("./controller");

// multer must run before validate so req.body is populated for multipart requests
router.post(
  "/signup",
  handleSupplierFilesUpload,
  validate(signupSchema),
  signup,
);
router.post("/login", validate(loginSchema), login);
const verificationLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: "supplier-email-verification",
});
router.post("/verify-email", verificationLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", verificationLimiter, validate(resendVerificationSchema), resendVerification);
router.post("/forgot-password", verificationLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", verificationLimiter, validate(resetPasswordSchema), resetPassword);
router.get("/profile", authenticate("supplier"), getMyProfile);
router.patch(
  "/profile",
  authenticate("supplier"),
  handleSupplierFilesUpload,
  validate(updateProfileSchema),
  updateMyProfile,
);
router.put(
  "/change-password",
  authenticate("supplier"),
  validate(changePasswordSchema),
  changePassword,
);
router.post(
  "/device-token",
  authenticate("supplier"),
  validate(deviceTokenSchema),
  registerDeviceToken,
);
router.delete(
  "/device-token",
  authenticate("supplier"),
  validate(deviceTokenSchema),
  removeDeviceToken,
);
router.post(
  "/",
  authenticate("admin"),
  handleSupplierFilesUpload,
  validate(createSupplierSchema),
  createSupplier,
);
router.get("/", authenticate("admin"), getSuppliers);
router.get("/:id", authenticate("admin"), getSupplierById);
router.patch(
  "/:id",
  authenticate("admin"),
  handleSupplierFilesUpload,
  validate(updateSupplierSchema),
  updateSupplier,
);
router.delete("/:id", authenticate("admin"), deleteSupplier);

module.exports = router;
