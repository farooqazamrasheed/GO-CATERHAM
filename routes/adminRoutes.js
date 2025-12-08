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
router.delete(
  "/admins/:id",
  checkPermission("delete_admin"),
  auditLoggers.deleteAdmin,
  adminController.deleteAdmin
);

module.exports = router;
