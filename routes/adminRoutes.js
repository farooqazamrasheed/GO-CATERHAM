const express = require("express");
const router = express.Router();
const multer = require("multer");

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const { checkRole } = require("../middlewares/permission");
const { auditLoggers } = require("../middlewares/audit");

const adminController = require("../controllers/adminController");

// Middleware to parse form data for admin routes
const parseFormData = multer().none();

// All routes require authentication
router.use(auth);

// Driver management - create driver
router.post(
  "/drivers",
  parseFormData,
  checkPermission("create_admin"), // Reuse create_admin permission for driver creation
  auditLoggers.createAdmin, // Reuse existing logger
  adminController.createDriver
);

// Driver management - admin and subadmin with permission
router.put(
  "/driver/:driverId/approve",
  checkPermission("approve_driver"),
  auditLoggers.approveDriver,
  adminController.approveDriver
);
router.put(
  "/driver/:driverId/reject",
  checkPermission("reject_driver"),
  auditLoggers.rejectDriver,
  adminController.rejectDriver
);
router.put(
  "/driver/:driverId/reject-custom",
  parseFormData,
  checkPermission("reject_driver"),
  auditLoggers.rejectDriver,
  adminController.rejectDriverCustom
);
router.put(
  "/driver/:driverId/document/:documentType/verify",
  checkPermission("approve_driver"),
  auditLoggers.approveDriver, // Reuse existing logger
  adminController.verifyDocument
);

// Full driver management - view drivers
router.get(
  "/drivers",
  checkPermission("view_drivers"),
  adminController.getDrivers
);
router.get(
  "/drivers/verified",
  checkPermission("view_drivers"),
  adminController.getVerifiedDrivers
);
router.get(
  "/drivers/unverified",
  checkPermission("view_drivers"),
  adminController.getUnverifiedDrivers
);
router.get(
  "/drivers/:driverId",
  checkPermission("view_drivers"),
  adminController.getDriverDetails
);

// Full driver management - manage drivers
router.put(
  "/drivers/:driverId/profile",
  parseFormData,
  checkPermission("manage_drivers"),
  auditLoggers.updateAdminPermissions, // Reuse existing logger
  adminController.updateDriverProfile
);
router.put(
  "/drivers/:driverId/status",
  parseFormData,
  checkPermission("manage_drivers"),
  auditLoggers.updateAdminPermissions, // Reuse existing logger
  adminController.manageDriverStatus
);
router.delete(
  "/drivers/:driverId",
  checkPermission("manage_drivers"),
  auditLoggers.deleteDriver,
  adminController.deleteDriver
);
router.post(
  "/drivers/:driverId/photo",
  checkPermission("manage_drivers"),
  ...adminController.uploadDriverPhoto
);

// Admin status - any admin role
router.put(
  "/status",
  checkRole("admin", "superadmin", "subadmin"),
  parseFormData,
  adminController.updateStatus
);

// Dashboard - any admin role
router.get(
  "/dashboard",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getDashboard
);

// Rider management - view riders
router.get(
  "/riders",
  checkPermission("view_riders"),
  adminController.getRiders
);
router.put(
  "/riders/:riderId/suspend",
  parseFormData,
  checkPermission("manage_riders"),
  adminController.suspendRider
);
router.put(
  "/riders/:riderId/unsuspend",
  checkPermission("manage_riders"),
  adminController.unsuspendRider
);

// Ride management - view rides
router.get(
  "/rides",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getRides
);
router.get(
  "/rides/:rideId",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getRideDetails
);

// Admin management - only superadmin and admin
router.post(
  "/admins",
  parseFormData,
  checkPermission("create_admin"),
  auditLoggers.createAdmin,
  adminController.createAdmin
);
router.get(
  "/admins",
  checkPermission("view_admins"),
  adminController.getAdmins
);
router.put(
  "/admins/:id/permissions",
  parseFormData,
  checkPermission("manage_admin_permissions"),
  auditLoggers.updateAdminPermissions,
  adminController.updateAdminPermissions
);
router.put(
  "/admins/:id/profile",
  parseFormData,
  checkPermission("manage_admin_permissions"),
  auditLoggers.updateAdminPermissions, // Reuse the same logger
  adminController.updateAdminProfile
);
router.delete(
  "/admins/:id",
  checkPermission("delete_admin"),
  auditLoggers.deleteAdmin,
  adminController.deleteAdmin
);

module.exports = router;
