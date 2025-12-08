const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Permission = require("../models/Permission");

/**
 * Service class for RBAC-related operations
 */
class RBACService {
  /**
   * Get all permissions for a user (admin/subadmin)
   * @param {string} userId - User ID
   * @returns {Promise<Set<string>>} Set of permission names
   */
  static async getUserPermissions(userId) {
    const admin = await Admin.findOne({ user: userId })
      .populate("assignedPermissions")
      .populate({
        path: "assignedRoles",
        populate: {
          path: "permissions",
          model: "Permission",
        },
      });

    if (!admin) {
      return new Set();
    }

    const permissions = new Set();

    // Add directly assigned permissions
    admin.assignedPermissions.forEach((perm) => {
      permissions.add(perm.name);
    });

    // Add permissions from assigned roles
    admin.assignedRoles.forEach((role) => {
      role.permissions.forEach((perm) => {
        permissions.add(perm.name);
      });
    });

    return permissions;
  }

  /**
   * Check if user has specific permission
   * @param {string} userId - User ID
   * @param {string} permission - Permission name to check
   * @returns {Promise<boolean>} True if user has permission
   */
  static async hasPermission(userId, permission) {
    const userPermissions = await this.getUserPermissions(userId);
    return userPermissions.has(permission);
  }

  /**
   * Check if user has all required permissions
   * @param {string} userId - User ID
   * @param {string[]} requiredPermissions - Array of required permission names
   * @returns {Promise<boolean>} True if user has all permissions
   */
  static async hasAllPermissions(userId, requiredPermissions) {
    const userPermissions = await this.getUserPermissions(userId);
    return requiredPermissions.every((perm) => userPermissions.has(perm));
  }

  /**
   * Get admin hierarchy level
   * @param {string} adminType - Type of admin
   * @returns {number} Hierarchy level (higher number = more permissions)
   */
  static getAdminLevel(adminType) {
    const levels = {
      subadmin: 1,
      admin: 2,
      superadmin: 3,
    };
    return levels[adminType] || 0;
  }

  /**
   * Check if admin can manage another admin
   * @param {string} managerAdminType - Type of managing admin
   * @param {string} targetAdminType - Type of target admin
   * @returns {boolean} True if can manage
   */
  static canManageAdmin(managerAdminType, targetAdminType) {
    const managerLevel = this.getAdminLevel(managerAdminType);
    const targetLevel = this.getAdminLevel(targetAdminType);

    // Superadmin can manage everyone
    if (managerAdminType === "superadmin") return true;

    // Admin can manage subadmins only
    if (managerAdminType === "admin" && targetAdminType === "subadmin")
      return true;

    // Subadmin cannot manage anyone
    return false;
  }

  /**
   * Validate permission assignment
   * @param {string[]} permissionIds - Permission IDs to validate
   * @returns {Promise<boolean>} True if all permissions exist
   */
  static async validatePermissions(permissionIds) {
    if (!Array.isArray(permissionIds)) return false;

    const permissions = await Permission.find({ _id: { $in: permissionIds } });
    return permissions.length === permissionIds.length;
  }

  /**
   * Validate role assignment
   * @param {string[]} roleIds - Role IDs to validate
   * @returns {Promise<boolean>} True if all roles exist
   */
  static async validateRoles(roleIds) {
    if (!Array.isArray(roleIds)) return false;

    const roles = await Role.find({ _id: { $in: roleIds } });
    return roles.length === roleIds.length;
  }

  /**
   * Get default permissions for admin types
   * @param {string} adminType - Type of admin
   * @returns {string[]} Array of default permission names
   */
  static getDefaultPermissions(adminType) {
    const defaultPermissions = {
      superadmin: ["*"], // All permissions
      admin: [
        "create_role",
        "edit_role",
        "delete_role",
        "view_roles",
        "create_permission",
        "edit_permission",
        "delete_permission",
        "view_permissions",
        "create_admin",
        "view_admins",
        "manage_admin_permissions",
        "delete_admin",
        "approve_driver",
        "reject_driver",
        "view_drivers",
        "view_riders",
        "view_rides",
        "view_payments",
      ],
      subadmin: [], // Assigned by admin
    };

    return defaultPermissions[adminType] || [];
  }
}

module.exports = RBACService;
