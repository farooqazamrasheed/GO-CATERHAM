const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const profileController = require("../controllers/profileController");

// All routes require authentication
router.use(auth);

// Profile management
router.get("/", checkPermission("view_profile"), profileController.getProfile);
router.put(
  "/",
  checkPermission("update_profile"),
  profileController.updateProfile
);
router.post(
  "/picture",
  checkPermission("upload_photo"),
  profileController.uploadProfilePicture
);

// Saved locations
router.get(
  "/locations",
  checkPermission("view_profile"),
  profileController.getSavedLocations
);
router.post(
  "/locations",
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
  checkPermission("update_profile"),
  profileController.updateSettings
);

module.exports = router;
