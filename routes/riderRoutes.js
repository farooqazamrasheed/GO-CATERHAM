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
  multer().none(),
  checkPermission("topup_wallet"),
  riderController.topUpWallet
);

// Update status
router.put("/status", multer().none(), riderController.updateStatus);

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

// Rider management - for admins with permissions
router.get(
  "/:riderId",
  checkPermission("view_riders"),
  adminController.getRiderDetails
);

module.exports = router;
