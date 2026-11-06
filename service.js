require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set");
  process.exit(1);
}

const dns = require("dns");
const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const DNS_SERVERS = process.env.DNS_SERVERS;

if (DNS_SERVERS) {
  dns.setServers(
    DNS_SERVERS.split(",")
      .map((server) => server.trim())
      .filter(Boolean),
  );
}

const startService = async () => {
  try {
    if (MONGO_URI) {
      await mongoose.connect(MONGO_URI);
      console.log("MongoDB connected");
    } else {
      console.warn("MongoDB connection string not set");
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start service:", error.message);
    process.exit(1);
  }
};

startService();
