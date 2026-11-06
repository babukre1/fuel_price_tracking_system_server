const ReportSnapshot = require("./reportSnapshot.model");
const { refreshAllSnapshots, generateReport } = require("./refreshJob");

const VALID_TYPES = [
  "overview",
  "suppliers",
  "stations",
  "current-prices",
  "price-history",
  "flagged-prices",
  "station-followers",
  "customer-follows",
];

exports.getReport = async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate } = req.query;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid report type. Must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }

    if (startDate || endDate) {
      const data = await generateReport(type, { startDate, endDate });

      return res.status(200).json({
        success: true,
        message: `Report "${type}" loaded with date filters`,
        data,
        generatedAt: new Date().toISOString(),
        rowCount: Array.isArray(data) ? data.length : 1,
      });
    }

    let snapshot = await ReportSnapshot.findOne({ type });

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: `Report "${type}" has not been generated yet. Try refreshing.`,
      });
    }

    if (type === 'overview' && snapshot.data && !snapshot.data.topFollowedStations) {
      const data = await generateReport(type, {});
      snapshot = await ReportSnapshot.findOneAndUpdate(
        { type },
        { data, generatedAt: new Date(), rowCount: Array.isArray(data) ? data.length : 1 },
        { new: true },
      );
    }

    res.status(200).json({
      success: true,
      message: `Report "${type}" loaded successfully`,
      data: snapshot.data,
      generatedAt: snapshot.generatedAt,
      rowCount: snapshot.rowCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load report",
      error: error.message,
    });
  }
};

exports.refreshReports = async (req, res) => {
  try {
    await refreshAllSnapshots();

    res.status(200).json({
      success: true,
      message: "All reports refreshed successfully.",
    });
  } catch (error) {
    console.error("[Reports] Manual refresh failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to refresh reports",
      error: error.message,
    });
  }
};
