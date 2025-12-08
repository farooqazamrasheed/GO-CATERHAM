const Role = require("../models/Role");
const Permission = require("../models/Permission");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { sendSuccess, sendError } = require("../utils/responseHelper");

// Create a new role
exports.createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const createdBy = req.user.id;

    // Validate required fields
    if (!name || !description || !permissions || !Array.isArray(permissions)) {
      return sendError(
        res,
        "Name, description, and permissions array are required",
        400
      );
    }

    // Check if role name already exists
    const existingRole = await Role.findOne({ name: name.toLowerCase() });
    if (existingRole) {
      return sendError(res, "Role with this name already exists", 409);
    }

    // Validate permissions exist
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
    });
    if (validPermissions.length !== permissions.length) {
      return sendError(res, "One or more permissions are invalid", 400);
    }

    // Check if user can create roles (superadmin or admin)
    const admin = await Admin.findOne({ user: createdBy });
    if (
      !admin ||
      (admin.adminType !== "superadmin" && admin.adminType !== "admin")
    ) {
      return sendError(res, "Only superadmin and admin can create roles", 403);
    }

    const role = await Role.create({
      name: name.toLowerCase(),
      description,
      permissions,
      createdBy,
    });

    await role.populate("permissions", "name description");
    await role.populate("createdBy", "fullName email");

    sendSuccess(res, { role }, "Role created successfully", 201);
  } catch (err) {
    console.error("Create role error:", err);
    sendError(res, "Failed to create role", 500);
  }
};

// Get all roles with pagination
exports.getRoles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Role.countDocuments();
    const roles = await Role.find()
      .populate("permissions", "name description")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        roles,
        pagination: {
          currentPage: page,
          totalPages,
          totalRoles: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Roles retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get roles error:", err);
    sendError(res, "Failed to retrieve roles", 500);
  }
};

// Get single role by ID
exports.getRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id)
      .populate("permissions", "name description")
      .populate("createdBy", "fullName email");

    if (!role) {
      return sendError(res, "Role not found", 404);
    }

    sendSuccess(res, { role }, "Role retrieved successfully", 200);
  } catch (err) {
    console.error("Get role error:", err);
    sendError(res, "Failed to retrieve role", 500);
  }
};

// Update role
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const userId = req.user.id;

    const role = await Role.findById(id);
    if (!role) {
      return sendError(res, "Role not found", 404);
    }

    // Check permissions to edit
    const admin = await Admin.findOne({ user: userId });
    if (!admin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Only superadmin can edit all roles, admin can only edit their own roles
    if (
      admin.adminType !== "superadmin" &&
      role.createdBy.toString() !== userId
    ) {
      return sendError(res, "You can only edit roles you created", 403);
    }

    // Validate permissions if provided
    if (permissions && Array.isArray(permissions)) {
      const validPermissions = await Permission.find({
        _id: { $in: permissions },
      });
      if (validPermissions.length !== permissions.length) {
        return sendError(res, "One or more permissions are invalid", 400);
      }
    }

    // Update fields
    if (name) role.name = name.toLowerCase();
    if (description) role.description = description;
    if (permissions) role.permissions = permissions;

    await role.save();
    await role.populate("permissions", "name description");
    await role.populate("createdBy", "fullName email");

    sendSuccess(res, { role }, "Role updated successfully", 200);
  } catch (err) {
    console.error("Update role error:", err);
    sendError(res, "Failed to update role", 500);
  }
};

// Delete role
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const role = await Role.findById(id);
    if (!role) {
      return sendError(res, "Role not found", 404);
    }

    // Check permissions to delete
    const admin = await Admin.findOne({ user: userId });
    if (!admin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Only superadmin can delete all roles, admin can only delete their own roles
    if (
      admin.adminType !== "superadmin" &&
      role.createdBy.toString() !== userId
    ) {
      return sendError(res, "You can only delete roles you created", 403);
    }

    // Check if role is assigned to any admin
    const assignedAdmins = await Admin.find({
      assignedRoles: id,
    });

    if (assignedAdmins.length > 0) {
      return sendError(
        res,
        "Cannot delete role that is assigned to admins",
        400
      );
    }

    await Role.findByIdAndDelete(id);

    sendSuccess(res, null, "Role deleted successfully", 200);
  } catch (err) {
    console.error("Delete role error:", err);
    sendError(res, "Failed to delete role", 500);
  }
};
