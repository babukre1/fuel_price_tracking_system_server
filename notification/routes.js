const express = require("express");
const router  = express.Router();

const authenticate = require("../middleware/authenticate");
const {
  getNotifications,
  markAllRead,
  markRead,
  deleteNotification,
  clearAllNotifications,
  clearOldReadNotifications,
} = require("./controller");
const {
  adminSendNotification,
  getBroadcasts,
} = require("./admin.controller");

router.get("/",              authenticate(), getNotifications);

// Static literal routes must be registered before parameterised routes so
// Express doesn't treat "read-all", "clear-all" or "clear-old-read" as an :id param.
router.patch("/read-all",      authenticate(), markAllRead);
router.patch("/:id/read",      authenticate(), markRead);

// ── Bulk delete (must come before /:id) ──────────────────────────────────────
router.delete("/clear-all",        authenticate(), clearAllNotifications);
router.delete("/clear-old-read",   authenticate(), clearOldReadNotifications);
router.delete("/:id",              authenticate(), deleteNotification);

// ── Admin broadcast ──────────────────────────────────────────────────────────
router.post("/send",        authenticate("admin"), adminSendNotification);
router.get("/broadcasts",   authenticate("admin"), getBroadcasts);

module.exports = router;
