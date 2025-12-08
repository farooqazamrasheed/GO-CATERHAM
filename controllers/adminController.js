const Driver = require("../models/Driver");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const { auditLoggers } = require("../middlewares/audit");
const bcrypt = require("bcryptjs");

// Approve or reject driver
exports.approveDriver = async (req, res, next) => {
  try {
    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: req.params.driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    driver.isApproved = true;
    await driver.save();

    // Set user isVerified to true for admin verification
    await User.findByIdAndUpdate(driver.user, { isVerified: true });

    sendSuccess(res, { driver }, "Driver approved", 200);
  } catch (err) {
    next(err);
  }
};

exports.rejectDriver = async (req, res, next) => {
  try {
    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: req.params.driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    driver.isApproved = false;
    await driver.save();

    sendSuccess(res, { driver }, "Driver rejected", 200);
  } catch (err) {
    next(err);
  }
};

// Update admin status
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body; // online/offline
    if (!["online", "offline"].includes(status)) {
      return sendError(res, "Invalid status. Must be online or offline", 400);
    }

    const admin = await Admin.findOneAndUpdate(
      { user: req.user.id },
      { status },
      { new: true }
    );

    if (!admin) {
      return sendError(res, "Admin profile not found", 404);
    }

    sendSuccess(res, { admin }, "Admin status updated", 200);
  } catch (err) {
    next(err);
  }
};

// Create a new admin or subadmin
exports.createAdmin = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      adminType,
      assignedPermissions,
      assignedRoles,
    } = req.body;
    const createdBy = req.user.id;

    // Validate required fields
    if (!fullName || !email || !password || !adminType) {
      return sendError(
        res,
        "fullName, email, password, and adminType are required",
        400
      );
    }

    // Validate adminType
    if (!["admin", "subadmin"].includes(adminType)) {
      return sendError(res, "adminType must be 'admin' or 'subadmin'", 400);
    }

    // Check if creator has permission
    const creatorAdmin = await Admin.findOne({ user: createdBy });
    if (!creatorAdmin) {
      return sendError(res, "Creator admin profile not found", 404);
    }

    // Only superadmin can create admin, admin can create subadmin
    if (creatorAdmin.adminType === "subadmin") {
      return sendError(res, "Subadmin cannot create other admins", 403);
    }

    if (creatorAdmin.adminType === "admin" && adminType === "admin") {
      return sendError(res, "Admin cannot create other admins", 403);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, "Email already registered", 409);
    }

    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      role: adminType, // admin or subadmin
    });

    // Create admin profile
    const adminData = {
      user: user._id,
      adminType,
    };

    // Handle permissions and roles if provided
    if (assignedPermissions && Array.isArray(assignedPermissions)) {
      // Support both simple array and detailed objects
      const processedPermissions = [];

      for (const perm of assignedPermissions) {
        if (typeof perm === "string") {
          // Simple permission ID
          const permissionExists = await Permission.findById(perm);
          if (!permissionExists) {
            return sendError(res, `Permission ${perm} does not exist`, 400);
          }
          processedPermissions.push({
            permissionId: perm,
            grantedBy: createdBy,
            grantedAt: new Date(),
          });
        } else if (typeof perm === "object" && perm.permissionId) {
          // Detailed permission object
          const permissionExists = await Permission.findById(perm.permissionId);
          if (!permissionExists) {
            return sendError(
              res,
              `Permission ${perm.permissionId} does not exist`,
              400
            );
          }
          processedPermissions.push({
            permissionId: perm.permissionId,
            expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
            grantedBy: createdBy,
            grantedAt: new Date(),
          });
        }
      }

      adminData.assignedPermissions = processedPermissions;
    }

    if (assignedRoles && Array.isArray(assignedRoles)) {
      // Validate roles exist
      const validRoles = await Role.find({ _id: { $in: assignedRoles } });
      if (validRoles.length !== assignedRoles.length) {
        return sendError(res, "One or more roles are invalid", 400);
      }
      adminData.assignedRoles = assignedRoles;
    }

    const admin = await Admin.create(adminData);

    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
        admin,
      },
      `${adminType} created successfully`,
      201
    );
  } catch (err) {
    console.error("Create admin error:", err);
    sendError(res, "Failed to create admin", 500);
  }
};

// Get all subadmins (for admin) or all admins/subadmins (for superadmin)
exports.getAdmins = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    let query = {};

    if (userAdmin.adminType === "admin") {
      // Admin can only see subadmins they created
      query = { adminType: "subadmin" };
      // Note: In a real implementation, you'd track who created whom
    }
    // Superadmin can see all

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Admin.countDocuments(query);
    const admins = await Admin.find(query)
      .populate("user", "fullName email")
      .populate("assignedPermissions", "name description")
      .populate("assignedRoles", "name description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        admins,
        pagination: {
          currentPage: page,
          totalPages,
          totalAdmins: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Admins retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get admins error:", err);
    sendError(res, "Failed to retrieve admins", 500);
  }
};

// Update subadmin permissions
exports.updateAdminPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedPermissions, assignedRoles } = req.body;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks
    if (currentAdmin.adminType === "subadmin") {
      return sendError(res, "Subadmin cannot modify permissions", 403);
    }

    if (
      currentAdmin.adminType === "admin" &&
      targetAdmin.adminType === "admin"
    ) {
      return sendError(res, "Admin cannot modify other admin permissions", 403);
    }

    // Validate permissions if provided
    if (assignedPermissions && Array.isArray(assignedPermissions)) {
      const processedPermissions = [];

      for (const perm of assignedPermissions) {
        if (typeof perm === "string") {
          // Simple permission ID
          const permissionExists = await Permission.findById(perm);
          if (!permissionExists) {
            return sendError(res, `Permission ${perm} does not exist`, 400);
          }
          processedPermissions.push({
            permissionId: perm,
            grantedBy: userId,
            grantedAt: new Date(),
          });
        } else if (typeof perm === "object" && perm.permissionId) {
          // Detailed permission object
          const permissionExists = await Permission.findById(perm.permissionId);
          if (!permissionExists) {
            return sendError(
              res,
              `Permission ${perm.permissionId} does not exist`,
              400
            );
          }
          processedPermissions.push({
            permissionId: perm.permissionId,
            expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
            grantedBy: userId,
            grantedAt: new Date(),
          });
        }
      }

      targetAdmin.assignedPermissions = processedPermissions;
    }

    // Validate roles if provided
    if (assignedRoles && Array.isArray(assignedRoles)) {
      const validRoles = await Role.find({ _id: { $in: assignedRoles } });
      if (validRoles.length !== assignedRoles.length) {
        return sendError(res, "One or more roles are invalid", 400);
      }
      targetAdmin.assignedRoles = assignedRoles;
    }

    await targetAdmin.save();
    await targetAdmin.populate("assignedPermissions", "name description");
    await targetAdmin.populate("assignedRoles", "name description");

    sendSuccess(
      res,
      { admin: targetAdmin },
      "Admin permissions updated successfully",
      200
    );
  } catch (err) {
    console.error("Update admin permissions error:", err);
    sendError(res, "Failed to update admin permissions", 500);
  }
};

// Delete subadmin
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks
    if (currentAdmin.adminType === "subadmin") {
      return sendError(res, "Subadmin cannot delete admins", 403);
    }

    if (
      currentAdmin.adminType === "admin" &&
      targetAdmin.adminType === "admin"
    ) {
      return sendError(res, "Admin cannot delete other admins", 403);
    }

    // Delete admin profile and user
    await Admin.findByIdAndDelete(id);
    await User.findByIdAndDelete(targetAdmin.user);

    sendSuccess(res, null, "Admin deleted successfully", 200);
  } catch (err) {
    console.error("Delete admin error:", err);
    sendError(res, "Failed to delete admin", 500);
  }
};
