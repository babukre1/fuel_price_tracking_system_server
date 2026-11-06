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

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/supplier", supplierRoutes);
app.use("/api/v1/stations", stationRoutes);
app.use("/api/v1/fuel-prices", fuelPriceRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/supplier/reports", supplierReportsRoutes);
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Service is running",
  });
});

startRefreshJob();

module.exports = app;
