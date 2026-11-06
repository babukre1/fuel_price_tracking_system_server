const cron = require("node-cron");
const ReportSnapshot = require("./reportSnapshot.model");
const Supplier = require("../supplier/model");
const User = require("../User/model");
const Station = require("../station/model");
const FuelPrice = require("../fuelPrice/fuelPrice.model");
const UserStationFollow = require("../User/stationFollow.model");
const Notification = require("../notification/model");

const toDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return null;
  const match = {};
  if (startDate) match.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    match.$lte = end;
  }
  return match;
};

const updateSnapshot = async (type, fn) => {
  try {
    const data = await fn();
    await ReportSnapshot.updateOne(
      { type },
      {
        type,
        data,
        generatedAt: new Date(),
        rowCount: Array.isArray(data) ? data.length : 1,
      },
      { upsert: true },
    );
  } catch (err) {
    console.error(`[Reports] Failed to refresh "${type}":`, err.message);
  }
};

const pipelines = {
  "overview": async (filters = {}) => {
    const { startDate, endDate } = filters;
    const dateMatch = toDateRange(startDate, endDate);
    const dateFilter = dateMatch ? { createdAt: dateMatch } : {};

    const [
      totalSuppliers,
      totalCustomers,
      totalStations,
      totalActiveStations,
      totalFuelPriceRecords,
      totalCurrentPrices,
      totalStationFollows,
      totalNotificationsSent,
      topFollowedStations,
      mostActiveSuppliers,
      mostChangedFuelType,
      mostFlaggedStations,
      stationsNoCurrentPrices,
    ] = await Promise.all([
      Supplier.countDocuments(),
      User.countDocuments(),
      Station.countDocuments(),
      Station.countDocuments({ isActive: true }),
      FuelPrice.countDocuments(dateMatch ? { createdAt: dateMatch } : {}),
      FuelPrice.countDocuments({ isCurrent: true, isActive: true }),
      UserStationFollow.countDocuments(dateMatch ? { createdAt: dateMatch } : {}),
      Notification.countDocuments({ deletedAt: null, ...dateFilter }),
      Station.aggregate([
        { $lookup: { from: "userstationfollows", localField: "_id", foreignField: "station", as: "follows" } },
        { $lookup: { from: "suppliers", localField: "supplier", foreignField: "_id", as: "supplier" } },
        { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, stationName: "$name", companyName: "$supplier.companyName", followersCount: { $size: "$follows" } } },
        { $sort: { followersCount: -1 } },
        { $limit: 5 },
      ]),
      Supplier.aggregate([
        { $lookup: { from: "stations", localField: "_id", foreignField: "supplier", as: "stations" } },
        { $project: { _id: 0, companyName: 1, activeStations: { $size: { $filter: { input: "$stations", as: "s", cond: { $eq: ["$$s.status", "APPROVED"] } } } } } },
        { $sort: { activeStations: -1 } },
        { $limit: 5 },
      ]),
      FuelPrice.aggregate([
        { $group: { _id: "$fuelType", count: { $sum: 1 } } },
        { $project: { fuelType: "$_id", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      FuelPrice.aggregate([
        { $match: { isFlagged: true } },
        { $group: { _id: "$station", flaggedCount: { $sum: 1 } } },
        { $sort: { flaggedCount: -1 } },
        { $limit: 5 },
        { $lookup: { from: "stations", localField: "_id", foreignField: "_id", as: "station" } },
        { $unwind: { path: "$station", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "suppliers", localField: "station.supplier", foreignField: "_id", as: "supplier" } },
        { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, stationName: "$station.name", companyName: "$supplier.companyName", flaggedCount: 1 } },
      ]),
      Station.aggregate([
        { $lookup: { from: "fuelprices", let: { stationId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$station", "$$stationId"] }, { $eq: ["$isCurrent", true] }, { $eq: ["$isActive", true] }] } } }], as: "currentPrices" } },
        { $match: { currentPrices: { $size: 0 } } },
        { $lookup: { from: "suppliers", localField: "supplier", foreignField: "_id", as: "supplier" } },
        { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, stationName: "$name", companyName: "$supplier.companyName", city: 1 } },
        { $limit: 5 },
      ]),
    ]);

    return {
      totalSuppliers,
      totalCustomers,
      totalStations,
      totalActiveStations,
      totalFuelPriceRecords,
      totalCurrentPrices,
      totalStationFollows,
      totalNotificationsSent,
      topFollowedStations,
      mostActiveSuppliers,
      mostChangedFuelType,
      mostFlaggedStations,
      stationsNoCurrentPrices,
    };
  },

  "suppliers": async () => {
    return Supplier.aggregate([
      {
        $lookup: {
          from: "stations",
          localField: "_id",
          foreignField: "supplier",
          as: "stations",
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          fullName: 1,
          companyName: 1,
          email: 1,
          phone: 1,
          status: 1,
          isActive: 1,
          createdAt: 1,
          totalStations: { $size: "$stations" },
          approvedStations: {
            $size: {
              $filter: {
                input: "$stations",
                as: "s",
                cond: { $eq: ["$$s.status", "APPROVED"] },
              },
            },
          },
          suspendedStations: {
            $size: {
              $filter: {
                input: "$stations",
                as: "s",
                cond: { $eq: ["$$s.status", "SUSPENDED"] },
              },
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
  },

  "stations": async () => {
    return Station.aggregate([
      {
        $lookup: {
          from: "suppliers",
          localField: "supplier",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "userstationfollows",
          localField: "_id",
          foreignField: "station",
          as: "follows",
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          address: 1,
          city: 1,
          fuelTypes: 1,
          status: 1,
          isActive: 1,
          createdAt: 1,
          companyName: "$supplier.companyName",
          followersCount: { $size: "$follows" },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
  },

  "current-prices": async () => {
    return FuelPrice.aggregate([
      { $match: { isCurrent: true, isActive: true } },
      {
        $lookup: {
          from: "stations",
          localField: "station",
          foreignField: "_id",
          as: "station",
        },
      },
      { $unwind: { path: "$station", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "suppliers",
          localField: "supplier",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          id: "$_id",
          stationName: "$station.name",
          companyName: "$supplier.companyName",
          fuelType: 1,
          price: 1,
          lastUpdated: "$updatedAt",
          isFlagged: 1,
        },
      },
      { $sort: { lastUpdated: -1 } },
    ]);
  },

  "price-history": async (filters = {}) => {
    const { startDate, endDate } = filters;
    const match = {};
    const dr = toDateRange(startDate, endDate);
    if (dr) match.effectiveFrom = dr;

    return FuelPrice.find(match)
      .populate("station", "name")
      .populate("supplier", "companyName")
      .populate("createdBySupplier", "companyName fullName")
      .populate("createdByAdmin", "fullName")
      .populate("closedBySupplier", "companyName fullName")
      .populate("closedByAdmin", "fullName")
      .select("fuelType price isCurrent isActive effectiveFrom effectiveTo isFlagged createdAt")
      .lean()
      .then((prices) =>
        prices.map((p) => ({
          stationName: p.station?.name,
          companyName: p.supplier?.companyName,
          fuelType: p.fuelType,
          price: p.price,
          isCurrent: p.isCurrent,
          isActive: p.isActive,
          effectiveFrom: p.effectiveFrom,
          effectiveTo: p.effectiveTo,
          isFlagged: p.isFlagged,
          createdBySupplier: p.createdBySupplier
            ? p.createdBySupplier.companyName || p.createdBySupplier.fullName
            : null,
          createdByAdmin: p.createdByAdmin?.fullName || null,
          closedBySupplier: p.closedBySupplier
            ? p.closedBySupplier.companyName || p.closedBySupplier.fullName
            : null,
          closedByAdmin: p.closedByAdmin?.fullName || null,
          createdAt: p.createdAt,
        })),
      );
  },

  "flagged-prices": async (filters = {}) => {
    const { startDate, endDate } = filters;
    const match = { isFlagged: true };
    const dr = toDateRange(startDate, endDate);
    if (dr) match.effectiveFrom = dr;

    const flagged = await FuelPrice.find(match)
      .populate("station", "name")
      .populate("supplier", "companyName")
      .populate("createdBySupplier", "companyName fullName")
      .populate("createdByAdmin", "fullName")
      .select("fuelType price isCurrent effectiveFrom createdAt")
      .lean();

    const results = [];
    for (const fp of flagged) {
      const prevPrices = await FuelPrice.aggregate([
        {
          $match: {
            station: fp.station._id,
            fuelType: fp.fuelType,
            isFlagged: false,
            _id: { $ne: fp._id },
          },
        },
        { $sort: { effectiveFrom: -1 } },
        { $limit: 3 },
        { $group: { _id: null, avg: { $avg: "$price" } } },
      ]);

      const prevAvg = prevPrices.length ? prevPrices[0].avg : null;
      const changePercentage =
        prevAvg && prevAvg > 0
          ? ((fp.price - prevAvg) / prevAvg) * 100
          : null;

      results.push({
        stationName: fp.station?.name,
        companyName: fp.supplier?.companyName,
        fuelType: fp.fuelType,
        flaggedPrice: fp.price,
        previousAvgPrice: prevAvg ? Math.round(prevAvg * 100) / 100 : null,
        changePercentage: changePercentage
          ? Math.round(changePercentage * 100) / 100
          : null,
        dateFlagged: fp.effectiveFrom || fp.createdAt,
        createdBy: fp.createdBySupplier
          ? fp.createdBySupplier.companyName || fp.createdBySupplier.fullName
          : fp.createdByAdmin?.fullName || null,
      });
    }

    return results.sort((a, b) => new Date(b.dateFlagged) - new Date(a.dateFlagged));
  },

  "station-followers": async () => {
    return Station.aggregate([
      {
        $lookup: {
          from: "suppliers",
          localField: "supplier",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "userstationfollows",
          localField: "_id",
          foreignField: "station",
          as: "follows",
        },
      },
      {
        $addFields: {
          followersCount: { $size: "$follows" },
          latestFollowDate: { $max: "$follows.createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          stationName: "$name",
          companyName: "$supplier.companyName",
          city: 1,
          status: 1,
          isActive: 1,
          followersCount: 1,
          latestFollowDate: 1,
        },
      },
      { $sort: { followersCount: -1 } },
    ]);
  },

  "customer-follows": async (filters = {}) => {
    const { startDate, endDate } = filters;
    const pipeline = [];
    const dr = toDateRange(startDate, endDate);
    if (dr) pipeline.push({ $match: { createdAt: dr } });
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stations",
          localField: "station",
          foreignField: "_id",
          as: "station",
        },
      },
      { $unwind: { path: "$station", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "suppliers",
          localField: "station.supplier",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          fullName: "$user.fullName",
          email: "$user.email",
          phone: "$user.phone",
          stationName: "$station.name",
          companyName: "$supplier.companyName",
          city: "$station.city",
          address: "$station.address",
          followDate: "$createdAt",
          createdBy: {
            $cond: [
              { $ne: ["$createdByAdmin", null] },
              "admin",
              "user",
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          fullName: 1,
          email: 1,
          phone: 1,
          stationName: 1,
          companyName: 1,
          city: 1,
          address: 1,
          followDate: 1,
          createdBy: 1,
        },
      },
      { $sort: { followDate: -1 } },
    );
    return UserStationFollow.aggregate(pipeline);
  },
};

const generateReport = async (type, filters = {}) => {
  const fn = pipelines[type];
  if (!fn) throw new Error(`Unknown report type: ${type}`);
  return fn(filters);
};

const startRefreshJob = () => {
  cron.schedule("*/14 * * * *", async () => {
    console.log("[Reports] Running scheduled refresh...");
    const entries = Object.entries(pipelines);
    await Promise.all(entries.map(([type, fn]) => updateSnapshot(type, fn)));
    console.log("[Reports] Refresh complete.");
  });

  console.log("[Reports] Cron job scheduled every 14 minutes.");
};

const refreshAllSnapshots = async () => {
  const entries = Object.entries(pipelines);
  await Promise.all(entries.map(([type, fn]) => updateSnapshot(type, fn)));
};

module.exports = { startRefreshJob, refreshAllSnapshots, generateReport, pipelines };
