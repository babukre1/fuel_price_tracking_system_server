const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const {
  signup,
  login,
  forgotPassword,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  changeAdminPassword,
} = require("./controller");

router.post("/signup", signup);
router.post("/login", login);
// router.post("/forgot-password", forgotPassword); // disabled — no identity verification

router.get("/users", authenticate("admin"), getAdminUsers);
router.post("/users", authenticate("admin"), createAdminUser);
router.patch("/users/:id", authenticate("admin"), updateAdminUser);
router.patch("/users/:id/password", authenticate("admin"), changeAdminPassword);

module.exports = router;
