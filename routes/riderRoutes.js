const express = require("express");
const router = express.Router();
const multer = require("multer");
const { sendError } = require("../utils/responseHelper");
const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const { riderPhotoUpload } = require("../config/multerConfig");
const riderController = require("../controllers/riderController");
const adminController = require("../controllers/adminController");
const profileController = require("../controllers/profileController");

// Middleware to parse form data for non-file routes
const parseFormData = multer().none();

// Public routes
router.get("/", adminController.getRiders);

// All rider routes require authentication
router.use(auth);

// View past rides
router.get(
  "/rides",
  riderController.getRideHistory
);

// Top-up wallet
router.post(
  "/wallet/topup",
  multer().none(),
  checkPermission("topup_wallet"),
  riderController.topUpWallet
);

// Update status
router.put("/status", multer().none(), riderController.updateStatus);

// Deactivate account
router.put(
  "/deactivate",
  checkPermission("update_profile"),
  parseFormData,
  riderController.deactivateAccount
);

// Activate account
router.put(
  "/activate",
  checkPermission("update_profile"),
  parseFormData,
  riderController.activateAccount
);

// Get dashboard data
router.get(
  "/dashboard",
  checkPermission("view_dashboard"),
  riderController.getDashboard
);

// Update rider profile
router.put(
  "/profile",
  multer().none(),
  checkPermission("update_profile"),
  profileController.updateProfile
);

// Photo management
router.post(
  "/photo",
  checkPermission("upload_photo"),
  riderPhotoUpload.single("photo"),
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading.
      return sendError(res, err.message, 400);
    } else if (err) {
      // An unknown error occurred when uploading.
      return sendError(res, err.message, 400);
    }
    next();
  },
  riderController.uploadPhoto
);
router.get(
  "/:riderId/photo",
  checkPermission("view_rider_photo"),
  riderController.getPhoto
);

// Get available drivers near a location
router.get(
  "/available-drivers",
  riderController.getAvailableDrivers
);

// Debug endpoint to check why drivers are not appearing (for troubleshooting)
router.get(
  "/debug-drivers",
  checkPermission("view_dashboard"),
  riderController.debugAvailableDrivers
);

// Rider management - for admins with permissions
router.get(
  "/:riderId",
  checkPermission("view_riders"),
  adminController.getRiderDetails
);

module.exports = router;
