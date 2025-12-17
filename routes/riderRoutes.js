const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const riderController = require("../controllers/riderController");
const adminController = require("../controllers/adminController");

// Public routes
router.get("/", adminController.getRiders);

// All rider routes require authentication
router.use(auth);

// View past rides
router.get(
  "/rides",
  checkPermission("view_rides"),
  riderController.getRideHistory
);

// Top-up wallet
router.post(
  "/wallet/topup",
  checkPermission("topup_wallet"),
  riderController.topUpWallet
);

// Update status
router.put("/status", riderController.updateStatus);

// Get dashboard data
router.get(
  "/dashboard",
  checkPermission("view_dashboard"),
  riderController.getDashboard
);

// Rider management - for admins with permissions
router.get(
  "/:riderId",
  checkPermission("view_riders"),
  adminController.getRiderDetails
);

module.exports = router;
