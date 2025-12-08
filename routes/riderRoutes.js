const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const riderController = require("../controllers/riderController");

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

module.exports = router;
