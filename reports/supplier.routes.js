const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const {
  myStations,
  myPrices,
  myPriceHistory,
  myFlaggedChanges,
  myFollowers,
} = require("./supplier.controller");

router.get("/my-stations", authenticate("supplier"), myStations);
router.get("/my-prices", authenticate("supplier"), myPrices);
router.get("/price-history", authenticate("supplier"), myPriceHistory);
router.get("/flagged-changes", authenticate("supplier"), myFlaggedChanges);
router.get("/followers", authenticate("supplier"), myFollowers);

module.exports = router;
