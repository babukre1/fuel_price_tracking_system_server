const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const rateLimiter = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} = require("./schemas");
const {
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  login,
  refreshSession,
  logout,
  getProfile,
  updateProfile,
  updateLocation,
  changePassword,
  deactivateAccount,
  getMyStationFollows,
  followStation,
  unfollowStation,
  registerDeviceToken,
  removeDeviceToken,
  getUsers,
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
  getUserStationFollows,
  followStationForUser,
  unfollowStationForUser,
} = require("./controllers");

// ─── Public ───────────────────────────────────────────────────────────────────
const loginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: "user-login",
});
const registerLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: "user-register",
});
const refreshLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: "user-refresh",
});

router.post("/register", registerLimiter, validate(registerSchema), register);
const verificationLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: "user-email-verification",
});
router.post("/verify-email", verificationLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", verificationLimiter, validate(resendVerificationSchema), resendVerification);
router.post("/forgot-password", verificationLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", verificationLimiter, validate(resetPasswordSchema), resetPassword);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/refresh", refreshLimiter, validate(refreshTokenSchema), refreshSession);
router.post("/logout", validate(refreshTokenSchema), logout);

// ─── Protected (requires valid user token) ────────────────────────────────────
router.get("/profile", authenticate("user"), getProfile);
router.patch("/profile", authenticate("user"), updateProfile);
router.patch(
  "/change-password",
  authenticate("user"),
  validate(changePasswordSchema),
  changePassword,
);
router.patch("/location", authenticate("user"), updateLocation);
router.get("/me/follows/stations", authenticate("user"), getMyStationFollows);
router.post("/me/follows/stations/:stationId", authenticate("user"), followStation);
router.delete("/me/follows/stations/:stationId", authenticate("user"), unfollowStation);
router.post("/device-token", authenticate("user"), registerDeviceToken);
router.delete("/device-token", authenticate("user"), removeDeviceToken);
// router.patch("/deactivate", authenticate("user"), deactivateAccount);

// Admin customer management
router.get("/", authenticate("admin"), getUsers);
router.post("/", authenticate("admin"), createUser);
router.get("/:id/follows/stations", authenticate("admin"), getUserStationFollows);
router.post("/:id/follows/stations/:stationId", authenticate("admin"), followStationForUser);
router.delete("/:id/follows/stations/:stationId", authenticate("admin"), unfollowStationForUser);
router.get("/:id", authenticate("admin"), getUserById);
router.patch("/:id", authenticate("admin"), updateUser);
router.delete("/:id", authenticate("admin"), deactivateUser);

module.exports = router;
