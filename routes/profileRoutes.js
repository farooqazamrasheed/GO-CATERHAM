const express = require("express");
const router = express.Router();
const multer = require("multer");

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const profileController = require("../controllers/profileController");

// Middleware to parse JSON bodies for POST/PUT requests
const parseJson = multer().none();

// All routes require authentication
router.use(auth);

// Profile management
router.get("/", checkPermission("view_profile"), profileController.getProfile);
router.put(
  "/",
  parseJson,
  checkPermission("update_profile"),
  profileController.updateProfile
);

// Saved locations
router.get(
  "/locations",
  checkPermission("view_profile"),
  profileController.getSavedLocations
);
router.post(
  "/locations",
  parseJson,
  checkPermission("update_profile"),
  profileController.addSavedLocation
);
router.delete(
  "/locations/:id",
  checkPermission("update_profile"),
  profileController.deleteSavedLocation
);

// Payment methods
router.get(
  "/payment-methods",
  checkPermission("view_profile"),
  profileController.getPaymentMethods
);
router.post(
  "/payment-methods",
  parseJson,
  checkPermission("update_profile"),
  profileController.addPaymentMethod
);
router.delete(
  "/payment-methods/:id",
  checkPermission("update_profile"),
  profileController.deletePaymentMethod
);

// Settings
router.get(
  "/settings",
  checkPermission("view_profile"),
  profileController.getSettings
);
router.put(
  "/settings",
  parseJson,
  checkPermission("update_profile"),
  profileController.updateSettings
);
router.post(
  "/settings/reset",
  checkPermission("update_profile"),
  profileController.resetSettingsToDefaults
);

module.exports = router;
