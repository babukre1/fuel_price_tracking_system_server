const mongoose = require("mongoose");
const Station = require("../station/model");
const FuelPrice = require("./fuelPrice.model");
const {
  sendPushToSupplier,
  sendPushToStationFollowers,
} = require("../utils/sendPushNotification");
const { computeIsFlagged, resolveRefPrice } = require("./priceFlagging");

const normalizeFuelType = (fuelType) =>
  typeof fuelType === "string" ? fuelType.toUpperCase() : fuelType;

const isAdmin = (req) => req.user.role === "admin";

const findStation = (req, stationId) =>
  Station.findOne({
    _id: stationId,
    ...(isAdmin(req) ? {} : { supplier: req.user.id }),
  });

const actorCreateFields = (req) =>
  isAdmin(req)
    ? { createdByAdmin: req.user.id, createdBySupplier: null }
    : { createdBySupplier: req.user.id, createdByAdmin: null };

const actorCloseFields = (req) =>
  isAdmin(req)
    ? { closedByAdmin: req.user.id, closedBySupplier: null }
    : { closedBySupplier: req.user.id, closedByAdmin: null };

const currentPriceFilter = (stationId, fuelType) => ({
  station: stationId,
  fuelType,
  isCurrent: true,
  isActive: true,
});

const notifyStationFollowersPriceChanged = ({
  stationId,
  stationName,
  fuelType,
  priceId,
  previousPrice,
  newPrice,
}) => {
  if (previousPrice === null || previousPrice === undefined) return;
  if (previousPrice === newPrice) return;

  sendPushToStationFollowers(String(stationId), {
    title: "Fuel price changed",
    body: `${fuelType} price changed at ${stationName}: ${previousPrice} → ${newPrice}`,
    data: {
      type: "favorite_station_price_changed",
      stationId: String(stationId),
      stationName: String(stationName),
      fuelType: String(fuelType),
      priceId: String(priceId),
      previousPrice: String(previousPrice),
      newPrice: String(newPrice),
    },
  }).catch((err) => {
    console.error("Notification: failed to notify station followers:", err.message);
  });
};

exports.setStationPrice = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { stationId } = req.params;
    const fuelType = normalizeFuelType(req.body.fuelType);
    const numericPrice = Number(req.body.price);

    if (!fuelType || req.body.price === undefined) {
      return res.status(400).json({
        success: false,
        message: "fuelType and price are required",
      });
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "price must be a finite positive number",
      });
    }

    const station = await findStation(req, stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    const current = await FuelPrice.findOne(
      currentPriceFilter(stationId, fuelType),
    );
    const previousPrice = current?.price ?? null;

    if (current && current.price === numericPrice) {
      return res.status(200).json({
        success: true,
        message: "Price unchanged",
        data: current,
      });
    }

    // Resolve the reference price and determine if the new price is flagged.
    // The reference skips previously-flagged prices so they never pollute future checks.
    const refPrice = await resolveRefPrice(current, stationId, fuelType);
    const now = new Date();
    const isFlagged = computeIsFlagged(refPrice, numericPrice);
    const changeType = current ? "UPDATED" : "CREATED";
    let fuelPrice;

    await session.withTransaction(async () => {
      // Only close the old price when the new one is NOT flagged.
      // Flagged prices stay hidden — the old price remains current for customers.
      if (current && !isFlagged) {
        await FuelPrice.updateMany(
          currentPriceFilter(stationId, fuelType),
          {
            $set: {
              isCurrent: false,
              effectiveTo: now,
              ...actorCloseFields(req),
            },
          },
          { session },
        );
      }

      [fuelPrice] = await FuelPrice.create(
        [
          {
            supplier: station.supplier,
            station: stationId,
            fuelType,
            price: numericPrice,
            isCurrent: !isFlagged, // flagged prices are not visible to customers
            isActive: true,
            effectiveFrom: now,
            effectiveTo: null,
            isFlagged,
            ...actorCreateFields(req),
          },
        ],
        { session },
      );
    });

    if (isFlagged) {
      sendPushToSupplier(station.supplier, {
        title: "Price Flagged for Review",
        body: `The ${fuelType} price you set for ${station.name} (${numericPrice}) is unusually high and won't be shown until reviewed.`,
        data: { stationId, fuelType, type: "price_flagged" },
      }).catch(() => {});
    } else if (current) {
      notifyStationFollowersPriceChanged({
        stationId,
        stationName: station.name,
        fuelType,
        priceId: fuelPrice._id,
        previousPrice,
        newPrice: numericPrice,
      });
    }

    res.status(201).json({
      success: true,
      message: isFlagged
        ? "Price set - unusually large change detected, please verify"
        : "Price set successfully",
      isFlagged,
      changeType,
      data: fuelPrice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to set price",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};
