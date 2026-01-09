// middlewares/permission.js
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const { sendError } = require("../utils/responseHelper");

/**
 * Permission-based access control middleware
 * @param {...string} requiredPermissions - List of required permissions
 * @returns {Function} Express middleware function
 */
module.exports = function checkPermission(...requiredPermissions) {
  return async (req, res, next) => {
    try {
      // Must be authenticated first
      if (!req.user || !req.user.id) {
        return sendError(res, "Authorization token missing", 401);
      }

      const userRole = req.user.role;

      // For admin and subadmin, check admin profile and permissions
      if (userRole === "admin" || userRole === "subadmin") {
        const admin = await Admin.findOne({ user: req.user.id });

        if (!admin) {
          return sendError(res, "Admin profile not found", 404);
        }

        // Superadmin has all permissions - bypass checks
        if (admin.adminType === "superadmin") {
          return next();
        }

        // Admin type has most permissions by default (except creating other admins/superadmins)
        if (admin.adminType === "admin") {
          // Admin can do everything except superadmin-only actions
          const superadminOnlyPermissions = [
            "create_superadmin",
            "delete_superadmin",
            "manage_superadmin"
          ];
          
          // Check if required permission is superadmin-only
          const requiresSuperadmin = requiredPermissions.some(perm => 
            superadminOnlyPermissions.includes(perm)
          );
          
          if (!requiresSuperadmin) {
            return next(); // Admin bypasses most permission checks
          }
        }

        const adminWithPermissions = await Admin.findOne({ user: req.user.id })
          .populate({
            path: "assignedPermissions.permissionId",
            model: "Permission",
          })
          .populate({
            path: "assignedRoles",
            populate: {
              path: "permissions",
              model: "Permission",
            },
          });

        if (!adminWithPermissions) {
          return sendError(res, "Admin profile not found", 404);
        }

        // Collect all permissions from direct assignments and roles
        const userPermissions = new Set();

        // Add directly assigned permissions (check expiration)
        admin.assignedPermissions.forEach((perm) => {
          // Check if permission is expired
          if (!perm.expiresAt || perm.expiresAt > new Date()) {
            userPermissions.add(perm.permissionId.name);
          }
        });

        // Add permissions from assigned roles (check active status)
        admin.assignedRoles.forEach((role) => {
          role.permissions.forEach((perm) => {
            if (perm.active) {
              userPermissions.add(perm.name);
            }
          });
        });

        // Check permission dependencies and add dependent permissions
        const Permission = require("../models/Permission");
        const allPermissions = await Permission.find().populate("dependencies");
        const dependencyMap = new Map();

        allPermissions.forEach((perm) => {
          dependencyMap.set(
            perm.name,
            perm.dependencies.map((dep) => dep.name)
          );
        });

        // Add dependent permissions
        const expandedPermissions = new Set(userPermissions);
        for (const perm of userPermissions) {
          const deps = dependencyMap.get(perm) || [];
          deps.forEach((dep) => expandedPermissions.add(dep));
        }

        userPermissions.clear();
        expandedPermissions.forEach((perm) => userPermissions.add(perm));

        // Check if user has all required permissions
        const hasAllPermissions = requiredPermissions.every((perm) =>
          userPermissions.has(perm)
        );

        if (!hasAllPermissions) {
          return sendError(
            res,
            `Insufficient permissions. Required: [${requiredPermissions.join(
              ", "
            )}]`,
            403
          );
        }

        return next();
      }

      // For driver and rider, use role-based access (backward compatibility)
      // This can be extended later with specific permissions if needed
      return next();
    } catch (err) {
      console.error("Permission middleware error:", err);
      return sendError(res, "Server error during permission check", 500);
    }
  };
};

/**
 * Role-based access control middleware (backward compatibility)
 * @param {...string} allowedRoles - List of allowed roles
 * @returns {Function} Express middleware function
 */
module.exports.checkRole = function checkRole(...allowedRoles) {
  return (req, res, next) => {
    try {
      // Must be authenticated first
      if (!req.user || !req.user.role) {
        return sendError(res, "Authorization token missing", 401);
      }

      const userRole = req.user.role;

      // If no roles provided → allow any logged-in user
      if (allowedRoles.length === 0) {
        return next();
      }

      // Check role
      if (!allowedRoles.includes(userRole)) {
        return sendError(
          res,
          `Access denied. Required role(s): [${allowedRoles.join(
            ", "
          )}]. Your role: ${userRole}.`,
          403
        );
      }

      next();
    } catch (err) {
      console.error("Role check middleware error:", err);
      return sendError(res, "Server error during role check", 500);
    }
  };
};
