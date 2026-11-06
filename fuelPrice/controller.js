const mongoose = require("mongoose");
const FuelPrice = require("./fuelPrice.model");
const Station = require("../station/model");
const {
  sendPushToSupplier,
  sendPushToStationFollowers,
} = require("../utils/sendPushNotification");
const { computeIsFlagged, resolveRefPrice } = require("./priceFlagging");

const normalizeFuelType = (fuelType) =>
  typeof fuelType === "string" ? fuelType.toUpperCase() : fuelType;

const toNumber = (value) => Number(value);

const isAdmin = (req) => req.user.role === "admin";

const parseBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

const getSupplierFilter = (req) => {
  if (isAdmin(req)) return {};
  return { supplier: req.user.id };
};

const getFuelPriceListFilter = (req, extraFilter = {}) => {
  const filter = { ...extraFilter, ...getSupplierFilter(req) };
  if (!isAdmin(req) || req.query.includeInactive !== "true") {
    filter.isActive = true;
  }
  return filter;
};

const findStationForUser = (req, stationId) =>
  Station.findOne({ _id: stationId, ...getSupplierFilter(req) });

const findFuelPriceForUser = (req, id) =>
  FuelPrice.findOne({ _id: id, ...getSupplierFilter(req) });

const populateFuelPriceActors = (query) =>
  query
    .populate("createdBySupplier", "companyName fullName email")
    .populate("createdByAdmin", "fullName email")
    .populate("closedBySupplier", "companyName fullName email")
    .populate("closedByAdmin", "fullName email");

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

const findCustomerVisibleStation = (stationId) =>
  Station.findOne({
    _id: stationId,
    status: "APPROVED",
    isActive: true,
  });

const safeFuelPriceFields =
  "_id fuelType price isFlagged effectiveFrom updatedAt";

const toMobilePrice = (price) => ({
  _id: price._id,
  fuelType: price.fuelType,
  price: price.price,
  isFlagged: price.isFlagged,
  effectiveFrom: price.effectiveFrom,
  updatedAt: price.updatedAt,
});

const getChangeType = (previousPrice, newPrice) => {
  if (previousPrice === null) return "INITIAL";
  if (newPrice > previousPrice) return "INCREASED";
  if (newPrice < previousPrice) return "DECREASED";
  return "UNCHANGED";
};

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

const applyPriceChange = async (
  { req, supplierId, stationId, fuelType, numericPrice },
  session,
) => {
  const current = await FuelPrice.findOne(
    currentPriceFilter(stationId, fuelType),
  ).session(session);
  const previousPrice = current?.price ?? null;

  if (current && current.price === numericPrice) {
    return { unchanged: true, previousPrice, newPrice: current.price, fuelPrice: current };
  }

  // Resolve the reference price and determine if the new price is flagged.
  // The reference skips previously-flagged prices so they never pollute future checks.
  const refPrice = await resolveRefPrice(current, stationId, fuelType, session);
  const now = new Date();
  const isFlagged = computeIsFlagged(refPrice, numericPrice);

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

  const [fuelPrice] = await FuelPrice.create(
    [
      {
        supplier: supplierId,
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

  return {
    unchanged: false,
    isFlagged,
    isNew: !current,
    previousPrice,
    newPrice: numericPrice,
    fuelPrice,
  };
};

exports.createFuelPrice = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { stationId } = req.params;
    const fuelType = normalizeFuelType(req.body.fuelType);
    const numericPrice = toNumber(req.body.price);

    if (!fuelType || req.body.price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Fuel type and price are required",
      });
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    const station = await findStationForUser(req, stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    let result;
    await session.withTransaction(async () => {
      result = await applyPriceChange(
        {
          req,
          supplierId: station.supplier,
          stationId,
          fuelType,
          numericPrice,
        },
        session,
      );
    });

    if (result.unchanged) {
      return res.status(200).json({
        success: true,
        message: "Price unchanged - returning existing record",
        data: result.fuelPrice,
      });
    }

    if (result.isFlagged) {
      sendPushToSupplier(station.supplier, {
        title: "Price Flagged for Review",
        body: `The ${fuelType} price you set for ${station.name} (${numericPrice}) is unusually high and won't be shown until reviewed.`,
        data: { stationId, fuelType, type: "price_flagged" },
      }).catch(() => {});
    } else if (!result.isNew) {
      notifyStationFollowersPriceChanged({
        stationId,
        stationName: station.name,
        fuelType,
        priceId: result.fuelPrice._id,
        previousPrice: result.previousPrice,
        newPrice: result.newPrice,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Fuel price created successfully",
      isFlagged: result.isFlagged,
      data: result.fuelPrice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create fuel price",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

exports.getMyFuelPrices = async (req, res) => {
  try {
    const prices = await populateFuelPriceActors(
      FuelPrice.find(getFuelPriceListFilter(req))
        .populate("station", "name city address")
        .populate("supplier", "companyName email phone"),
    ).sort({ effectiveFrom: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Fuel prices loaded successfully",
      data: prices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load fuel prices",
      error: error.message,
    });
  }
};

exports.getStationFuelPrices = async (req, res) => {
  try {
    const { stationId } = req.params;

    const station = await findStationForUser(req, stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    const prices = await populateFuelPriceActors(
      FuelPrice.find(getFuelPriceListFilter(req, { station: stationId })),
    ).sort({ fuelType: 1, effectiveFrom: -1 });

    res.status(200).json({
      success: true,
      message: "Station fuel prices loaded successfully",
      data: prices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load station fuel prices",
      error: error.message,
    });
  }
};

exports.getCurrentStationFuelPrices = async (req, res) => {
  try {
    const { stationId } = req.params;

    const station = await findStationForUser(req, stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    const prices = await populateFuelPriceActors(
      FuelPrice.find({
        station: stationId,
        ...getSupplierFilter(req),
        isCurrent: true,
        isActive: true,
      }),
    ).sort({ fuelType: 1 });

    res.status(200).json({
      success: true,
      message: "Current station fuel prices loaded successfully",
      data: prices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load current station fuel prices",
      error: error.message,
    });
  }
};

exports.getMobileCurrentStationFuelPrices = async (req, res) => {
  try {
    const { stationId } = req.params;

    const station = await findCustomerVisibleStation(stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    const prices = await FuelPrice.find({
      station: stationId,
      isCurrent: true,
      isActive: true,
      isFlagged: false,
    })
      .select(safeFuelPriceFields)
      .sort({ fuelType: 1 });

    return res.status(200).json({
      success: true,
      data: prices.map(toMobilePrice),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load current station fuel prices",
      error: error.message,
    });
  }
};

exports.getMobileStationFuelPriceHistory = async (req, res) => {
  try {
    const { stationId } = req.params;
    const fuelType = normalizeFuelType(req.query.fuelType);
    const parsedDays = parseInt(req.query.days, 10);
    const days = Math.min(
      Math.max(Number.isFinite(parsedDays) ? parsedDays : 30, 1),
      365,
    );
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const station = await findCustomerVisibleStation(stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    const filter = {
      station: stationId,
      isActive: true,
      isFlagged: false,
      effectiveFrom: { $gte: since },
    };

    if (fuelType) {
      filter.fuelType = fuelType;
    }

    const prices = await FuelPrice.find(filter)
      .select("_id fuelType price effectiveFrom createdAt")
      .sort({ fuelType: 1, effectiveFrom: 1, createdAt: 1 });

    const previousByFuelType = new Map();
    const data = prices.map((price) => {
      const previousPrice = previousByFuelType.has(price.fuelType)
        ? previousByFuelType.get(price.fuelType)
        : null;
      const newPrice = price.price;
      previousByFuelType.set(price.fuelType, newPrice);

      return {
        _id: price._id,
        fuelType: price.fuelType,
        previousPrice,
        newPrice,
        changeType: getChangeType(previousPrice, newPrice),
        changedAt: price.effectiveFrom || price.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load station fuel price history",
      error: error.message,
    });
  }
};

exports.updateFuelPrice = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const fuelPrice = await findFuelPriceForUser(req, req.params.id);
    if (!fuelPrice) {
      return res.status(404).json({
        success: false,
        message: "Fuel price not found",
      });
    }

    const requestedIsActive =
      req.body.isActive === undefined
        ? undefined
        : parseBoolean(req.body.isActive);
    const requestedPrice =
      req.body.price === undefined ? undefined : toNumber(req.body.price);

    if (
      requestedPrice !== undefined &&
      (!Number.isFinite(requestedPrice) || requestedPrice < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    if (
      requestedPrice !== undefined &&
      requestedPrice !== fuelPrice.price &&
      requestedIsActive !== false
    ) {
      let result;
      await session.withTransaction(async () => {
        result = await applyPriceChange(
          {
            req,
            supplierId: fuelPrice.supplier,
            stationId: fuelPrice.station,
            fuelType: fuelPrice.fuelType,
            numericPrice: requestedPrice,
          },
          session,
        );
      });

      if (result.isFlagged) {
        Station.findById(fuelPrice.station)
          .select("name")
          .then((station) => {
            sendPushToSupplier(fuelPrice.supplier, {
              title: "Price Flagged for Review",
              body: `The ${fuelPrice.fuelType} price you set for ${station?.name || "station"} (${requestedPrice}) is unusually high and won't be shown until reviewed.`,
              data: {
                stationId: fuelPrice.station.toString(),
                fuelType: fuelPrice.fuelType,
                type: "price_flagged",
              },
            }).catch(() => {});
          })
          .catch(() => {});
      } else if (!result.isNew) {
        Station.findById(fuelPrice.station)
          .select("name")
          .then((station) => {
            notifyStationFollowersPriceChanged({
              stationId: fuelPrice.station,
              stationName: station?.name || "station",
              fuelType: fuelPrice.fuelType,
              priceId: result.fuelPrice._id,
              previousPrice: result.previousPrice,
              newPrice: result.newPrice,
            });
          })
          .catch((err) => {
            console.error("Notification: failed to load station:", err.message);
          });
      }

      return res.status(200).json({
        success: true,
        message: result.unchanged
          ? "Price unchanged - returning existing record"
          : "Fuel price updated successfully",
        isFlagged: result.isFlagged,
        data: result.fuelPrice,
      });
    }

    if (req.body.effectiveFrom !== undefined) {
      fuelPrice.effectiveFrom = req.body.effectiveFrom;
    }

    if (requestedPrice !== undefined) {
      fuelPrice.price = requestedPrice;
    }

    if (requestedIsActive !== undefined) {
      if (requestedIsActive === false) {
        const wasFlagged = fuelPrice.isFlagged;
        const wasFlaggedCurrent = wasFlagged && fuelPrice.isCurrent;

        fuelPrice.isActive = false;
        fuelPrice.isCurrent = false;
        fuelPrice.effectiveTo = fuelPrice.effectiveTo || new Date();
        Object.assign(fuelPrice, actorCloseFields(req));

        if (wasFlaggedCurrent) {
          const previous = await FuelPrice.findOne({
            station: fuelPrice.station,
            fuelType: fuelPrice.fuelType,
            _id: { $ne: fuelPrice._id },
            isFlagged: false,
            isActive: true,
          }).sort({ effectiveFrom: -1 });

          if (previous) {
            previous.isCurrent = true;
            previous.isActive = true;
            previous.effectiveTo = null;
            await previous.save();
          }
        }

        // Notify supplier when their flagged price is rejected/closed
        if (wasFlagged) {
          Station.findById(fuelPrice.station)
            .select("name")
            .then((station) => {
              sendPushToSupplier(fuelPrice.supplier, {
                title: "Price Not Accepted",
                body: wasFlaggedCurrent
                  ? `The previously-approved flagged ${fuelPrice.fuelType} price for ${station?.name || "station"} has been closed and the previous price restored.`
                  : `The flagged ${fuelPrice.fuelType} price you set for ${station?.name || "station"} (${fuelPrice.price}) was not accepted.`,
                data: {
                  stationId: fuelPrice.station.toString(),
                  fuelType: fuelPrice.fuelType,
                  type: "price_rejected",
                },
              }).catch(() => {});
            })
            .catch(() => {});
        }
      } else if (!fuelPrice.isCurrent) {
        await FuelPrice.updateMany(
          currentPriceFilter(fuelPrice.station, fuelPrice.fuelType),
          {
            $set: {
              isCurrent: false,
              effectiveTo: new Date(),
              ...actorCloseFields(req),
            },
          },
        );

        fuelPrice.isActive = true;
        fuelPrice.isCurrent = true;
        fuelPrice.effectiveFrom = new Date();
        fuelPrice.effectiveTo = null;
        Object.assign(fuelPrice, actorCreateFields(req));
      } else {
        fuelPrice.isActive = true;
      }
    }

    await fuelPrice.save();

    res.status(200).json({
      success: true,
      message: "Fuel price updated successfully",
      data: fuelPrice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update fuel price",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

exports.createBulkFuelPrices = async (req, res) => {
  const fuelType = normalizeFuelType(req.body.fuelType);
  const { price, stationIds } = req.body;
  const numericPrice = toNumber(price);

  if (!fuelType || price === undefined) {
    return res.status(400).json({
      success: false,
      message: "Fuel type and price are required",
    });
  }

  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return res.status(400).json({
      success: false,
      message: "Price must be a valid positive number",
    });
  }

  if (!Array.isArray(stationIds) || stationIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "stationIds must be a non-empty array",
    });
  }

  const uniqueIds = [...new Set(stationIds.map(String))];
  const results = [];

  for (const stationId of uniqueIds) {
    const session = await mongoose.startSession();
    try {
      const station = await findStationForUser(req, stationId);
      if (!station) {
        results.push({
          stationId,
          status: "error",
          message: "Station not found",
        });
        continue;
      }

      let result;
      await session.withTransaction(async () => {
        result = await applyPriceChange(
          {
            req,
            supplierId: station.supplier,
            stationId,
            fuelType,
            numericPrice,
          },
          session,
        );
      });

      if (result.unchanged) {
        results.push({
          stationId,
          status: "unchanged",
          data: result.fuelPrice,
        });
      } else {
        if (result.isFlagged) {
          sendPushToSupplier(station.supplier, {
            title: "Price Flagged for Review",
            body: `The ${fuelType} price you set for ${station.name} (${numericPrice}) is unusually high and won't be shown until reviewed.`,
            data: { stationId, fuelType, type: "price_flagged" },
          }).catch(() => {});
        } else if (!result.isNew) {
          notifyStationFollowersPriceChanged({
            stationId,
            stationName: station.name,
            fuelType,
            priceId: result.fuelPrice._id,
            previousPrice: result.previousPrice,
            newPrice: result.newPrice,
          });
        }
        results.push({
          stationId,
          status: result.isNew ? "created" : "updated",
          isFlagged: result.isFlagged,
          data: result.fuelPrice,
        });
      }
    } catch (err) {
      results.push({ stationId, status: "error", message: err.message });
    } finally {
      session.endSession();
    }
  }

  res.status(200).json({
    success: true,
    message: "Bulk price update complete",
    data: results,
  });
};

exports.deleteFuelPrice = async (req, res) => {
  try {
    const fuelPrice = await FuelPrice.findOne({
      _id: req.params.id,
      ...getSupplierFilter(req),
    });

    if (!fuelPrice) {
      return res.status(404).json({
        success: false,
        message: "Fuel price not found",
      });
    }

    const wasFlaggedCurrent = fuelPrice.isFlagged && fuelPrice.isCurrent;

    fuelPrice.isActive = false;
    fuelPrice.isCurrent = false;
    fuelPrice.effectiveTo = fuelPrice.effectiveTo || new Date();
    Object.assign(fuelPrice, actorCloseFields(req));
    await fuelPrice.save();

    // Restore previous good price when deactivating a flagged price that was current
    if (wasFlaggedCurrent) {
      const previous = await FuelPrice.findOne({
        station: fuelPrice.station,
        fuelType: fuelPrice.fuelType,
        _id: { $ne: fuelPrice._id },
        isFlagged: false,
        isActive: true,
      }).sort({ effectiveFrom: -1 });

      if (previous) {
        previous.isCurrent = true;
        previous.isActive = true;
        previous.effectiveTo = null;
        await previous.save();
      }
    }

    // Notify supplier when their flagged price is rejected/closed
    if (fuelPrice.isFlagged) {
      Station.findById(fuelPrice.station)
        .select("name")
        .then((station) => {
          sendPushToSupplier(fuelPrice.supplier, {
            title: "Price Not Accepted",
            body: wasFlaggedCurrent
              ? `The previously-approved flagged ${fuelPrice.fuelType} price for ${station?.name || "station"} has been closed and the previous price restored.`
              : `The flagged ${fuelPrice.fuelType} price you set for ${station?.name || "station"} (${fuelPrice.price}) was not accepted.`,
            data: {
              stationId: fuelPrice.station.toString(),
              fuelType: fuelPrice.fuelType,
              type: "price_rejected",
            },
          }).catch(() => {});
        })
        .catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "Fuel price deactivated successfully",
      data: fuelPrice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to deactivate fuel price",
      error: error.message,
    });
  }
};

exports.approveFlaggedPrice = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only admins can approve flagged prices",
    });
  }

  const session = await mongoose.startSession();
  try {
    const fuelPrice = await FuelPrice.findById(req.params.id);

    if (!fuelPrice) {
      return res.status(404).json({
        success: false,
        message: "Fuel price not found",
      });
    }

    if (!fuelPrice.isFlagged) {
      return res.status(400).json({
        success: false,
        message: "This price is not flagged",
      });
    }

    if (fuelPrice.isCurrent) {
      return res.status(400).json({
        success: false,
        message: "This price is already current",
      });
    }

    const now = new Date();

    await session.withTransaction(async () => {
      // Close the existing current price for this station+fuelType
      await FuelPrice.updateMany(
        currentPriceFilter(fuelPrice.station, fuelPrice.fuelType),
        {
          $set: {
            isCurrent: false,
            effectiveTo: now,
            closedByAdmin: req.user.id,
          },
        },
        { session },
      );

      fuelPrice.isCurrent = true;
      fuelPrice.isActive = true;
      fuelPrice.effectiveFrom = now;
      fuelPrice.effectiveTo = null;
      fuelPrice.createdByAdmin = req.user.id;
      await fuelPrice.save({ session });
    });

    res.status(200).json({
      success: true,
      message: "Flagged price approved and set as current",
      data: fuelPrice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to approve flagged price",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};
