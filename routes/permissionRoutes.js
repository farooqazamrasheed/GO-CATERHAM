const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const permissionController = require("../controllers/permissionController");

// All routes require authentication
router.use(auth);

// Create permission - only superadmin and admin
router.post(
  "/",
  checkPermission("create_permission"),
  permissionController.createPermission
);

// Get all permissions with pagination - accessible to superadmin, admin, subadmin
router.get(
  "/",
  checkPermission("view_permissions"),
  permissionController.getPermissions
);

// Get single permission - accessible to superadmin, admin, subadmin
router.get(
  "/:id",
  checkPermission("view_permissions"),
  permissionController.getPermission
);

// Update permission - only superadmin and admin (can only edit their own permissions)
router.put(
  "/:id",
  checkPermission("edit_permission"),
  permissionController.updatePermission
);

module.exports = router;
