const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const multer = require("multer");
const path = require("path");

const driverController = require("../controllers/driverController");

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/drivers");
    // Create directory if it doesn't exist
    require("fs").mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "driver-" +
        req.user.id +
        "-" +
        uniqueSuffix +
        path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only JPEG, JPG, and PNG are allowed"),
        false
      );
    }
  },
});

// All routes require authentication
router.use(auth);

// Driver dashboard
router.get(
  "/dashboard",
  checkPermission("view_dashboard"),
  driverController.getDashboard
);

// Driver profile management
router.post(
  "/profile",
  checkPermission("create_profile"),
  driverController.createProfile
);
router.get(
  "/profile",
  checkPermission("view_profile"),
  driverController.getProfile
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
  upload.single("photo"),
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

module.exports = router;
