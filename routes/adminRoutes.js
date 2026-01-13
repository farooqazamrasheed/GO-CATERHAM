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
  checkPermission("verify_documents"),
  auditLoggers.approveDriver, // Reuse existing logger for document verification
  adminController.verifyDocument
);
router.post(
  "/driver/:driverId/message",
  parseFormData,
  checkPermission("manage_drivers"),
  adminController.sendMessageToDriver
);

// Active status history - must come before :driverId routes
router.get(
  "/drivers/active-history",
  checkRole("admin", "superadmin"),
  adminController.getDriverActiveHistory
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
router.put(
  "/drivers/:driverId/activate",
  checkPermission("manage_drivers"),
  adminController.activateDriverAccount
);
router.put(
  "/drivers/:driverId/deactivate",
  parseFormData,
  checkPermission("manage_drivers"),
  adminController.deactivateDriverAccount
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

// Active status history - must come before general routes
router.get(
  "/riders/active-history",
  checkRole("admin", "superadmin"),
  adminController.getRiderActiveHistory
);

// Rider management - view riders
router.get(
  "/riders",
  checkPermission("view_riders"),
  adminController.getRiders
);
router.get(
  "/riders/:riderId",
  checkPermission("view_riders"),
  adminController.getRiderDetails
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
router.put(
  "/riders/:riderId/activate",
  checkPermission("manage_riders"),
  adminController.activateRiderAccount
);
router.put(
  "/riders/:riderId/deactivate",
  parseFormData,
  checkPermission("manage_riders"),
  adminController.deactivateRiderAccount
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

// Active status history - must come before :id routes
router.get(
  "/admins/active-history",
  checkRole("admin", "superadmin"),
  adminController.getAdminActiveHistory
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
router.get(
  "/admins/:id",
  checkPermission("view_admins"),
  adminController.getAdminDetails
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
router.put(
  "/admins/:adminId/activate",
  checkPermission("manage_admin_permissions"),
  adminController.activateAdminAccount
);
router.put(
  "/admins/:adminId/deactivate",
  checkPermission("manage_admin_permissions"),
  adminController.deactivateAdminAccount
);

// Active status history - combined
router.get(
  "/active-history",
  checkRole("admin", "superadmin"),
  adminController.getAllActiveHistory
);


// ==================== ANALYTICS ROUTES ====================

/**
 * @route   GET /api/v1/admin/analytics
 * @desc    Get comprehensive analytics dashboard
 * @access  Admin, Superadmin, Subadmin
 */
router.get(
  "/analytics",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getAnalyticsDashboard
);

/**
 * @route   GET /api/v1/admin/analytics/revenue
 * @desc    Get revenue analytics with filters
 * @query   startDate, endDate, groupBy (day|week|month|year)
 * @access  Admin, Superadmin, Subadmin
 */
router.get(
  "/analytics/revenue",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getRevenueAnalytics
);

/**
 * @route   GET /api/v1/admin/analytics/rides
 * @desc    Get ride statistics with filters
 * @query   startDate, endDate
 * @access  Admin, Superadmin, Subadmin
 */
router.get(
  "/analytics/rides",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getRideStatistics
);

/**
 * @route   GET /api/v1/admin/analytics/top-drivers
 * @desc    Get top performing drivers
 * @query   limit (default 10), sortBy (rides|revenue|rating|earnings), startDate, endDate
 * @access  Admin, Superadmin, Subadmin
 */
router.get(
  "/analytics/top-drivers",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getTopDrivers
);

/**
 * @route   GET /api/v1/admin/analytics/top-riders
 * @desc    Get top riders by activity
 * @query   limit (default 10), sortBy (rides|spent|rating), startDate, endDate
 * @access  Admin, Superadmin, Subadmin
 */
router.get(
  "/analytics/top-riders",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getTopRiders
);

/**
 * @route   GET /api/v1/admin/analytics/realtime
 * @desc    Get real-time analytics summary (lightweight for frequent polling/websocket)
 * @access  Admin, Superadmin, Subadmin
 */
router.get(
  "/analytics/realtime",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.getRealTimeAnalytics
);

module.exports = router;
