const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  createFuelPriceSchema,
  bulkFuelPriceSchema,
  updateFuelPriceSchema,
} = require("./schemas");
const {
  createFuelPrice,
  createBulkFuelPrices,
  getMyFuelPrices,
  getStationFuelPrices,
  getCurrentStationFuelPrices,
  getMobileCurrentStationFuelPrices,
  getMobileStationFuelPriceHistory,
  updateFuelPrice,
  deleteFuelPrice,
  approveFlaggedPrice,
} = require("./controller");
const { setStationPrice } = require("./priceWrite.controller");

const allowSupplierOrAdmin = (req, res, next) => {
  if (!["supplier", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }

  next();
};

router.get("/", authenticate(), getMyFuelPrices);

router.get(
  "/mobile/stations/:stationId/current",
  authenticate(),
  getMobileCurrentStationFuelPrices,
);

router.get(
  "/mobile/stations/:stationId/history",
  authenticate(),
  getMobileStationFuelPriceHistory,
);

router.post(
  "/stations/:stationId",
  authenticate(),
  allowSupplierOrAdmin,
  validate(createFuelPriceSchema),
  createFuelPrice,
);

router.get(
  "/stations/:stationId",
  authenticate(),
  getStationFuelPrices,
);

router.get(
  "/stations/:stationId/current",
  authenticate(),
  allowSupplierOrAdmin,
  getCurrentStationFuelPrices,
);

router.post(
  "/bulk",
  authenticate(),
  allowSupplierOrAdmin,
  validate(bulkFuelPriceSchema),
  createBulkFuelPrices,
);

router.post(
  "/v2/stations/:stationId",
  authenticate(),
  allowSupplierOrAdmin,
  validate(createFuelPriceSchema),
  setStationPrice,
);

router.patch(
  "/:id",
  authenticate(),
  allowSupplierOrAdmin,
  validate(updateFuelPriceSchema),
  updateFuelPrice,
);
router.patch("/:id/approve-flag", authenticate(), allowSupplierOrAdmin, approveFlaggedPrice);
router.delete("/:id", authenticate(), allowSupplierOrAdmin, deleteFuelPrice);

module.exports = router;
