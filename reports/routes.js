const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const { getReport, refreshReports } = require("./controller");

router.get("/:type", authenticate("admin"), getReport);
router.post("/refresh", authenticate("admin"), refreshReports);

module.exports = router;
