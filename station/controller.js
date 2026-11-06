const Station = require("./model");
const { sendPushToSupplier } = require("../utils/sendPushNotification");

const toNumber = (value) => Number(value);

const isValidCoordinate = (value) => Number.isFinite(toNumber(value));

const isAdmin = (req) => req.user.role === "admin";

const getStationFilter = (req) => {
  const filter = {};

  if (!isAdmin(req)) {
    filter.supplier = req.user.id;
  }

  return filter;
};

const getStationListFilter = (req) => {
  const filter = getStationFilter(req);

  if (!isAdmin(req) || req.query.includeInactive !== "true") {
    filter.isActive = true;
  }

  return filter;
};

const getStationByIdFilter = (req) => ({
  _id: req.params.id,
  ...getStationFilter(req),
});

const normaliseFuelTypes = (fuelTypes) => [
  ...new Set(fuelTypes.map((f) => f.toUpperCase())),
];

const formatStationPayload = (body) => {
  const { name, phone, address, city, longitude, latitude, fuelTypes } = body;

  const payload = {
    name,
    phone,
    address,
    city,
    location: {
      type: "Point",
      coordinates: [toNumber(longitude), toNumber(latitude)],
    },
  };

  if (fuelTypes !== undefined) {
    payload.fuelTypes = normaliseFuelTypes(fuelTypes);
  }

  return payload;
};

exports.getNearbyStations = async (req, res) => {
  try {
    const longitude = parseFloat(req.query.longitude);
    const latitude = parseFloat(req.query.latitude);
    const maxDistance = parseInt(req.query.maxDistance) || 5000;

    if (isNaN(longitude) || isNaN(latitude)) {
      return res.status(400).json({
        success: false,
        message: "longitude and latitude are required as numbers",
      });
    }

    const stations = await Station.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude], // longitude first
          },
          distanceField: "distance", // adds distance in meters to each result
          maxDistance: maxDistance,
          spherical: true,
          query: {
            status: "APPROVED",
            isActive: true,
          },
        },
      },
      // Join current prices from FuelPrice collection
      {
        $lookup: {
          from: "fuelprices",
          let: { stationId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$station", "$$stationId"] },
                isCurrent: true,
                isActive: true,
              },
            },
            {
              $project: {
                _id: 0,
                fuelType: 1,
                price: 1,
                isFlagged: 1,
                updatedAt: "$updatedAt",
              },
            },
          ],
          as: "prices",
        },
      },
      {
        $project: {
          name: 1,
          city: 1,
          address: 1,
          phone: 1,
          location: 1,
          status: 1,
          isActive: 1,
          distance: 1,
          prices: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Nearby stations loaded successfully",
      data: stations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load nearby stations",
      error: error.message,
    });
  }
};

exports.createStation = async (req, res) => {
  try {
    const { name, longitude, latitude, supplier } = req.body;
    const supplierId = isAdmin(req) ? supplier : req.user.id;

    if (!name || longitude === undefined || latitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "Station name, longitude, and latitude are required",
      });
    }

    if (!isValidCoordinate(longitude) || !isValidCoordinate(latitude)) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude must be valid numbers",
      });
    }

    if (!supplierId) {
      return res.status(400).json({
        success: false,
        message: "Supplier is required",
      });
    }

    const station = await Station.create({
      supplier: supplierId,
      ...formatStationPayload(req.body),
    });

    res.status(201).json({
      success: true,
      message: "Station created successfully",
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create station",
      error: error.message,
    });
  }
};

exports.getStationByIdPublic = async (req, res) => {
  try {
    const station = await Station.findById(req.params.id).populate(
      "supplier",
      "companyName email phone",
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    res.status(200).json({
      success: true,
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load station",
      error: error.message,
    });
  }
};

exports.getMyStations = async (req, res) => {
  try {
    const stations = await Station.find(getStationListFilter(req))
      .populate("supplier", "companyName email phone")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      message: "Stations loaded successfully",
      data: stations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stations",
      error: error.message,
    });
  }
};

exports.getMyStationById = async (req, res) => {
  try {
    const station = await Station.findOne(getStationByIdFilter(req)).populate(
      "supplier",
      "companyName email phone",
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Station loaded successfully",
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load station",
      error: error.message,
    });
  }
};

exports.updateStation = async (req, res) => {
  try {
    const allowedUpdates = [
      "name",
      "phone",
      "address",
      "city",
      "isActive",
      "fuelTypes",
    ];
    const updates = {};

    if (isAdmin(req)) {
      allowedUpdates.push("status", "supplier");
    }

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (updates.fuelTypes !== undefined) {
      updates.fuelTypes = normaliseFuelTypes(updates.fuelTypes);
    }

    const hasLongitude = req.body.longitude !== undefined;
    const hasLatitude = req.body.latitude !== undefined;

    if (hasLongitude || hasLatitude) {
      if (!hasLongitude || !hasLatitude) {
        return res.status(400).json({
          success: false,
          message:
            "Both longitude and latitude are required to update location",
        });
      }

      if (
        !isValidCoordinate(req.body.longitude) ||
        !isValidCoordinate(req.body.latitude)
      ) {
        return res.status(400).json({
          success: false,
          message: "Longitude and latitude must be valid numbers",
        });
      }

      updates.location = {
        type: "Point",
        coordinates: [
          toNumber(req.body.longitude),
          toNumber(req.body.latitude),
        ],
      };
    }

    // Read old status/isActive before the update so we can detect transitions.
    // Only pay this query cost when the request includes a field we react to.
    let prevStationStatus   = null;
    let prevStationIsActive = null;
    const needsPrefetch =
      ["APPROVED", "REJECTED", "SUSPENDED"].includes(updates.status) ||
      updates.isActive !== undefined;
    if (needsPrefetch) {
      const existing = await Station.findOne(getStationByIdFilter(req))
        .select("status isActive");
      prevStationStatus   = existing?.status   ?? null;
      prevStationIsActive = existing?.isActive ?? null;
    }

    const station = await Station.findOneAndUpdate(
      getStationByIdFilter(req),
      updates,
      { new: true, runValidators: true },
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    if (updates.status === "APPROVED" && prevStationStatus !== "APPROVED") {
      sendPushToSupplier(station.supplier, {
        title: "Station Approved",
        body: `${station.name} has been approved and is now active.`,
        data: { stationId: station._id.toString(), type: "station_approved" },
      }).catch(() => {});
    }

    if (updates.status === "REJECTED" && prevStationStatus !== "REJECTED") {
      sendPushToSupplier(station.supplier, {
        title: "Station Update",
        body: `${station.name} was not approved. Contact your administrator for details.`,
        data: { stationId: station._id.toString(), type: "station_rejected" },
      }).catch(() => {});
    }

    if (updates.status === "SUSPENDED" && prevStationStatus !== "SUSPENDED") {
      sendPushToSupplier(station.supplier, {
        title: "Station Suspended",
        body: `${station.name} has been suspended.`,
        data: { stationId: station._id.toString(), type: "station_suspended" },
      }).catch(() => {});
    }

    if (isAdmin(req) && updates.isActive !== undefined) {
      if (updates.isActive === false && prevStationIsActive === true) {
        sendPushToSupplier(station.supplier, {
          title: "Station Deactivated",
          body: `${station.name} has been deactivated by an administrator.`,
          data: { stationId: station._id.toString(), type: "station_deactivated" },
        }).catch(() => {});
      } else if (updates.isActive === true && prevStationIsActive === false) {
        sendPushToSupplier(station.supplier, {
          title: "Station Reactivated",
          body: `${station.name} is active again.`,
          data: { stationId: station._id.toString(), type: "station_reactivated" },
        }).catch(() => {});
      }
    }

    res.status(200).json({
      success: true,
      message: "Station updated successfully",
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update station",
      error: error.message,
    });
  }
};

exports.deactivateStation = async (req, res) => {
  try {
    const prev = await Station.findOne(getStationByIdFilter(req)).select("isActive supplier name");

    const station = await Station.findOneAndUpdate(
      getStationByIdFilter(req),
      { isActive: false },
      { new: true },
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    if (isAdmin(req) && prev?.isActive === true) {
      sendPushToSupplier(station.supplier, {
        title: "Station Deactivated",
        body: `${station.name} has been deactivated by an administrator.`,
        data: { stationId: station._id.toString(), type: "station_deactivated" },
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "Station deactivated successfully",
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to deactivate station",
      error: error.message,
    });
  }
};

exports.activateStation = async (req, res) => {
  try {
    const prev = await Station.findOne(getStationByIdFilter(req)).select("isActive supplier name");

    const station = await Station.findOneAndUpdate(
      getStationByIdFilter(req),
      { isActive: true },
      { new: true },
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    if (isAdmin(req) && prev?.isActive === false) {
      sendPushToSupplier(station.supplier, {
        title: "Station Reactivated",
        body: `${station.name} is active again.`,
        data: { stationId: station._id.toString(), type: "station_reactivated" },
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "Station activated successfully",
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to activate station",
      error: error.message,
    });
  }
};

exports.deleteStation = async (req, res) => {
  try {
    const station = await Station.findOneAndUpdate(
      getStationByIdFilter(req),
      {
        isActive: false,
        status: "SUSPENDED",
      },
      { new: true },
    );

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Station deactivated successfully",
      data: station,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to deactivate station",
      error: error.message,
    });
  }
};
