const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const roleController = require("../controllers/roleController");

// All routes require authentication
router.use(auth);

// Create role - only superadmin and admin
router.post("/", checkPermission("create_role"), roleController.createRole);

// Get all roles with pagination - accessible to superadmin, admin, subadmin
router.get("/", checkPermission("view_roles"), roleController.getRoles);

// Get single role - accessible to superadmin, admin, subadmin
router.get("/:id", checkPermission("view_roles"), roleController.getRole);

// Update role - only superadmin and admin (can only edit their own roles)
router.put("/:id", checkPermission("edit_role"), roleController.updateRole);

// Delete role - only superadmin and admin (can only delete their own roles)
router.delete(
  "/:id",
  checkPermission("delete_role"),
  roleController.deleteRole
);

module.exports = router;
