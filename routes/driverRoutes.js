const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const multer = require("multer");
const { sendError } = require("../utils/responseHelper");
const { driverPhotoUpload } = require("../config/multerConfig");

const driverController = require("../controllers/driverController");
const adminController = require("../controllers/adminController");
const driverPayoutController = require("../controllers/driverPayoutController");

// Middleware to parse form data for non-file routes
const parseFormData = multer().none();

// Public routes
router.get("/", adminController.getDrivers);

// All routes require authentication
router.use(auth);

// Driver dashboard
router.get(
  "/dashboard",
  checkPermission("view_dashboard"),
  driverController.getDashboard
);

// View past rides
router.get(
  "/rides",
  driverController.getRideHistory
);

// Driver profile management
router.get(
  "/profile",
  checkPermission("view_profile"),
  driverController.getProfile
);
router.put(
  "/profile",
  checkPermission("update_profile"),
  parseFormData,
  driverController.updateProfile
);

// Driver status management
router.get(
  "/status",
  checkPermission("view_profile"),
  driverController.getCurrentStatus
);
router.put(
  "/status",
  checkPermission("update_status"),
  parseFormData,
  driverController.updateStatus
);

// Driver verification status
router.get(
  "/verification/status",
  checkPermission("view_profile"),
  driverController.getVerificationStatus
);

// Photo management
router.post(
  "/photo",
  checkPermission("upload_photo"),
  driverPhotoUpload.single("photo"),
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
  driverController.uploadPhoto
);
router.get(
  "/:driverId/photo",
  checkPermission("view_driver_photo"),
  driverController.getPhoto
);

// Location updates (real-time during active rides)
router.post(
  "/location",
  checkPermission("update_location"),
  parseFormData,
  driverController.updateLocation
);

// Earnings reports
router.get(
  "/earnings/report",
  checkPermission("view_earnings"),
  driverController.getEarningsReport
);
router.get(
  "/earnings/download",
  checkPermission("view_earnings"),
  driverController.downloadEarningsReport
);

// Account deactivation
router.put(
  "/deactivate",
  checkPermission("update_profile"),
  parseFormData,
  driverController.deactivateAccount
);

// Account activation
router.put(
  "/activate",
  checkPermission("update_profile"),
  parseFormData,
  driverController.activateAccount
);

// Driver earnings
router.get(
  "/earnings",
  checkPermission("view_earnings"),
  driverController.getEarningsReport
);

// Driver Stripe earnings summary and payout
router.get(
  "/earnings/summary",
  checkPermission("view_earnings"),
  driverPayoutController.getEarnings
);

router.post(
  "/earnings/payout",
  checkPermission("request_payout"),
  parseFormData,
  driverPayoutController.requestPayout
);

// Driver stats
router.get(
  "/stats",
  checkPermission("view_profile"),
  driverController.getStats
);

// Ride request management - driver accepts/rejects ride requests
const rideController = require("../controllers/rideController");

// Accept ride request
router.post(
  "/ride-requests/:rideId/respond",
  parseFormData,
  checkPermission("accept_ride"),
  async (req, res) => {
    const { action, reason } = req.body;
    
    if (action === "accept") {
      return rideController.acceptRide(req, res);
    } else if (action === "reject") {
      return rideController.rejectRide(req, res);
    } else {
      return require("../utils/responseHelper").sendError(
        res,
        "Invalid action. Must be 'accept' or 'reject'",
        400
      );
    }
  }
);

// Alternative: separate accept/reject endpoints
router.put(
  "/ride-requests/:rideId/accept",
  parseFormData,
  checkPermission("accept_ride"),
  rideController.acceptRide
);

router.put(
  "/ride-requests/:rideId/reject",
  parseFormData,
  checkPermission("reject_ride"),
  rideController.rejectRide
);

// Document re-upload route
router.put(
  "/document/:documentType/reupload",
  (req, res, next) => {
    const { documentUpload } = require("../config/multerConfig");
    const upload = documentUpload.single(req.params.documentType);
    upload(req, res, (err) => {
      if (err) {
        return sendError(res, err.message || "Error uploading document", 400);
      }
      next();
    });
  },
  driverController.reUploadDocument
);

// Driver management - for admins with permissions
router.get(
  "/:driverId",
  checkPermission("view_drivers"),
  adminController.getDriverDetails
);

module.exports = router;
