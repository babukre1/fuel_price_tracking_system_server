const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { createStationSchema, updateStationSchema } = require("./schemas");
const {
  createStation,
  getMyStations,
  getMyStationById,
  updateStation,
  deactivateStation,
  activateStation,
  deleteStation,
  getNearbyStations,
  getStationByIdPublic,
} = require("./controller");

const allowSupplierOrAdmin = (req, res, next) => {
  if (!["supplier", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }
  next();
};

// /nearby must be registered before /:id to avoid Express treating "nearby" as an id param
router.get("/nearby", authenticate(), getNearbyStations);

router.post(
  "/",
  authenticate(),
  allowSupplierOrAdmin,
  validate(createStationSchema),
  createStation,
);
router.get("/", authenticate(), allowSupplierOrAdmin, getMyStations);
// router.get("/:id", authenticate(), getMyStationById);
router.get("/:id", getStationByIdPublic);
router.patch(
  "/:id",
  authenticate(),
  allowSupplierOrAdmin,
  validate(updateStationSchema),
  updateStation,
);
router.patch(
  "/:id/deactivate",
  authenticate(),
  allowSupplierOrAdmin,
  deactivateStation,
);
router.patch(
  "/:id/activate",
  authenticate(),
  allowSupplierOrAdmin,
  activateStation,
);
router.delete("/:id", authenticate(), allowSupplierOrAdmin, deleteStation);

module.exports = router;
