const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const riderLiveLocationController = require("../controllers/riderLiveLocationController");

// All routes require authentication
router.use(auth);

// Rider routes
router.post(
  "/location",
  checkPermission("update_location"),
  riderLiveLocationController.updateLocation
);

router.get(
  "/location",
  checkPermission("view_location"),
  riderLiveLocationController.getCurrentLocation
);

// Admin/Driver routes for finding nearby riders
router.get(
  "/nearby",
  checkPermission("view_nearby_riders"),
  riderLiveLocationController.getNearbyRiders
);

module.exports = router;
