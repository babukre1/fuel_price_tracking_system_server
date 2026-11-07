const express = require("express");
const adminRoutes = require("./admin/routes.js");
const userRoutes = require("./User/routes.js");
const supplierRoutes = require("./supplier/routes.js");
const stationRoutes = require("./station/routes.js");
const fuelPriceRoutes = require("./fuelPrice/routes.js");
const notificationRoutes = require("./notification/routes.js");
const reportsRoutes = require("./reports/routes.js");
const supplierReportsRoutes = require("./reports/supplier.routes.js");
const { startRefreshJob } = require("./reports/refreshJob");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
let mongoConnectionPromise;

const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) return;

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI or MONGODB_URI is not configured");
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(mongoUri).catch((error) => {
      mongoConnectionPromise = undefined;
      throw error;
    });
  }

  await mongoConnectionPromise;
};

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/v1/health", async (req, res) => {
  try {
    await connectDatabase();
    res.status(200).json({
      success: true,
      message: "Service is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check database connection failed:", error.message);
    res.status(503).json({
      success: false,
      message: "Service is unavailable",
      database: "disconnected",
    });
  }
});

app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(503).json({
      success: false,
      message: "Database connection unavailable",
    });
  }
});

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/supplier", supplierRoutes);
app.use("/api/v1/stations", stationRoutes);
app.use("/api/v1/fuel-prices", fuelPriceRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/supplier/reports", supplierReportsRoutes);

startRefreshJob();

module.exports = app;
