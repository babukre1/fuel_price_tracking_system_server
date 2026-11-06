const mongoose = require("mongoose");
const FuelPrice = require("../fuelPrice/fuelPrice.model");
const Station = require("../station/model");
const UserStationFollow = require("../User/stationFollow.model");

const asId = (id) => new mongoose.Types.ObjectId(id);

const myStations = async (req, res) => {
  try {
    const supplierId = req.user.id;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stations = await Station.aggregate([
      { $match: { supplier: asId(supplierId) } },
      {
        $lookup: {
          from: "userstationfollows",
          localField: "_id",
          foreignField: "station",
          as: "follows",
        },
      },
      {
        $lookup: {
          from: "userstationfollows",
          let: { stationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$station", "$$stationId"] }, createdAt: { $gte: sevenDaysAgo } } },
          ],
          as: "followsLast7d",
        },
      },
      {
        $lookup: {
          from: "userstationfollows",
          let: { stationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$station", "$$stationId"] }, createdAt: { $gte: thirtyDaysAgo } } },
          ],
          as: "followsLast30d",
        },
      },
      {
        $addFields: {
          followersCount: { $size: "$follows" },
          followersLast7d: { $size: "$followsLast7d" },
          followersLast30d: { $size: "$followsLast30d" },
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
          followersCount: 1,
          followersLast7d: 1,
          followersLast30d: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.status(200).json({ success: true, data: stations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const myPrices = async (req, res) => {
  try {
    const supplierId = req.user.id;

    const prices = await FuelPrice.aggregate([
      { $match: { supplier: asId(supplierId), isCurrent: true, isActive: true } },
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
        $project: {
          _id: 0,
          id: "$_id",
          stationName: "$station.name",
          stationId: "$station._id",
          fuelType: 1,
          price: 1,
          lastUpdated: { $ifNull: ["$updatedAt", "$effectiveFrom", "$createdAt"] },
          isFlagged: 1,
        },
      },
      { $sort: { stationName: 1, fuelType: 1 } },
    ]);

    res.status(200).json({ success: true, data: prices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const myPriceHistory = async (req, res) => {
  try {
    const supplierId = req.user.id;

    const history = await FuelPrice.find({ supplier: supplierId })
      .populate("station", "name")
      .populate("createdBySupplier", "companyName fullName")
      .populate("createdByAdmin", "fullName")
      .populate("closedBySupplier", "companyName fullName")
      .populate("closedByAdmin", "fullName")
      .select("fuelType price isCurrent isActive effectiveFrom effectiveTo isFlagged createdAt")
      .sort({ effectiveFrom: -1 })
      .lean();

    const result = history.map((p) => ({
      stationName: p.station?.name,
      stationId: p.station?._id,
      fuelType: p.fuelType,
      price: p.price,
      isCurrent: p.isCurrent,
      isActive: p.isActive,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      isFlagged: p.isFlagged,
      createdBy: p.createdBySupplier
        ? { type: "supplier", name: p.createdBySupplier.companyName || p.createdBySupplier.fullName }
        : p.createdByAdmin
          ? { type: "admin", name: p.createdByAdmin.fullName }
          : null,
      closedBy: p.closedBySupplier
        ? { type: "supplier", name: p.closedBySupplier.companyName || p.closedBySupplier.fullName }
        : p.closedByAdmin
          ? { type: "admin", name: p.closedByAdmin.fullName }
          : null,
      createdAt: p.createdAt,
    }));

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const myFlaggedChanges = async (req, res) => {
  try {
    const supplierId = req.user.id;

    const flagged = await FuelPrice.find({ supplier: supplierId, isFlagged: true })
      .populate("station", "name")
      .select("fuelType price station effectiveFrom createdAt")
      .sort({ effectiveFrom: -1 })
      .lean();

    const results = [];
    for (const fp of flagged) {
      const prevPrices = await FuelPrice.aggregate([
        {
          $match: {
            station: fp.station?._id || fp.station,
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
        stationId: fp.station?._id,
        fuelType: fp.fuelType,
        flaggedPrice: fp.price,
        previousAvgPrice: prevAvg ? Math.round(prevAvg * 100) / 100 : null,
        changePercentage: changePercentage
          ? Math.round(changePercentage * 100) / 100
          : null,
        dateFlagged: fp.effectiveFrom || fp.createdAt,
      });
    }

    res.status(200).json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const myFollowers = async (req, res) => {
  try {
    const supplierId = req.user.id;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stations = await Station.aggregate([
      { $match: { supplier: asId(supplierId) } },
      {
        $lookup: {
          from: "userstationfollows",
          localField: "_id",
          foreignField: "station",
          as: "follows",
        },
      },
      {
        $lookup: {
          from: "userstationfollows",
          let: { stationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$station", "$$stationId"] }, createdAt: { $gte: sevenDaysAgo } } },
          ],
          as: "followsLast7d",
        },
      },
      {
        $lookup: {
          from: "userstationfollows",
          let: { stationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$station", "$$stationId"] }, createdAt: { $gte: thirtyDaysAgo } } },
          ],
          as: "followsLast30d",
        },
      },
      {
        $addFields: {
          totalFollowers: { $size: "$follows" },
          followersLast7d: { $size: "$followsLast7d" },
          followersLast30d: { $size: "$followsLast30d" },
          latestFollowDate: { $max: "$follows.createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          stationName: "$name",
          city: 1,
          address: 1,
          status: 1,
          isActive: 1,
          totalFollowers: 1,
          followersLast7d: 1,
          followersLast30d: 1,
          latestFollowDate: 1,
        },
      },
      { $sort: { totalFollowers: -1 } },
    ]);

    res.status(200).json({ success: true, data: stations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { myStations, myPrices, myPriceHistory, myFlaggedChanges, myFollowers };
