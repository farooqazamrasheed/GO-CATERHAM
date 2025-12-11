const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const { checkRole } = require("../middlewares/permission");
const { auditLoggers } = require("../middlewares/audit");

const adminController = require("../controllers/adminController");

// All routes require authentication
router.use(auth);

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

// Full driver management - view drivers
router.get(
  "/drivers",
  checkPermission("view_drivers"),
  adminController.getDrivers
);
router.get(
  "/drivers/:driverId",
  checkPermission("view_drivers"),
  adminController.getDriverDetails
);

// Full driver management - manage drivers
router.put(
  "/drivers/:driverId/profile",
  checkPermission("manage_drivers"),
  auditLoggers.updateAdminPermissions, // Reuse existing logger
  adminController.updateDriverProfile
);
router.put(
  "/drivers/:driverId/status",
  checkPermission("manage_drivers"),
  auditLoggers.updateAdminPermissions, // Reuse existing logger
  adminController.manageDriverStatus
);
router.delete(
  "/drivers/:driverId",
  checkPermission("manage_drivers"),
  auditLoggers.deleteAdmin, // Reuse existing logger
  adminController.deleteDriver
);

// Admin status - any admin role
router.put(
  "/status",
  checkRole("admin", "superadmin", "subadmin"),
  adminController.updateStatus
);

// Admin management - only superadmin and admin
router.post(
  "/admins",
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
  checkPermission("manage_admin_permissions"),
  auditLoggers.updateAdminPermissions,
  adminController.updateAdminPermissions
);
router.put(
  "/admins/:id/profile",
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
