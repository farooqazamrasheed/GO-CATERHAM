const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const riderRoutes = require("./routes/riderRoutes");
const driverRoutes = require("./routes/driverRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const rideRoutes = require("./routes/rideRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");
const liveLocationRoutes = require("./routes/liveLocationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const roleRoutes = require("./routes/roleRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const documentRoutes = require("./routes/documentRoutes");
const rewardsRoutes = require("./routes/rewardsRoutes");
const profileRoutes = require("./routes/profileRoutes");
const riderLiveLocationRoutes = require("./routes/riderLiveLocationRoutes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/riders/profile", profileRoutes);
app.use("/api/v1/riders", riderRoutes);
app.use("/api/v1/drivers", driverRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);
app.use("/api/v1/rides", rideRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/wallets", walletRoutes);
app.use("/api/v1/live-location", liveLocationRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/permissions", permissionRoutes);
app.use("/api/v1/documents", documentRoutes);
app.use("/api/v1/rewards", rewardsRoutes);
app.use("/api/v1/riders/location", riderLiveLocationRoutes);

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Server Error",
    details: err.details || null,
  });
});

module.exports = app;
