const Permission = require("../models/Permission");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { sendSuccess, sendError } = require("../utils/responseHelper");

// Create a new permission
exports.createPermission = async (req, res) => {
  try {
    const { name, description } = req.body;
    const createdBy = req.user.id;

    // Validate required fields
    if (!name || !description) {
      return sendError(res, "Name and description are required", 400);
    }

    // Check if permission name already exists
    const existingPermission = await Permission.findOne({
      name: name.toLowerCase(),
    });
    if (existingPermission) {
      return sendError(res, "Permission with this name already exists", 409);
    }

    // Check if user can create permissions (superadmin or admin)
    const admin = await Admin.findOne({ user: createdBy });
    if (
      !admin ||
      (admin.adminType !== "superadmin" && admin.adminType !== "admin")
    ) {
      return sendError(
        res,
        "Only superadmin and admin can create permissions",
        403
      );
    }

    const permission = await Permission.create({
      name: name.toLowerCase(),
      description,
      createdBy,
    });

    await permission.populate("createdBy", "fullName email");

    sendSuccess(res, { permission }, "Permission created successfully", 201);
  } catch (err) {
    console.error("Create permission error:", err);
    sendError(res, "Failed to create permission", 500);
  }
};

// Get all permissions with pagination
exports.getPermissions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Permission.countDocuments();
    const permissions = await Permission.find()
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        permissions,
        pagination: {
          currentPage: page,
          totalPages,
          totalPermissions: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Permissions retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get permissions error:", err);
    sendError(res, "Failed to retrieve permissions", 500);
  }
};

// Get single permission by ID
exports.getPermission = async (req, res) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findById(id).populate(
      "createdBy",
      "fullName email"
    );

    if (!permission) {
      return sendError(res, "Permission not found", 404);
    }

    sendSuccess(res, { permission }, "Permission retrieved successfully", 200);
  } catch (err) {
    console.error("Get permission error:", err);
    sendError(res, "Failed to retrieve permission", 500);
  }
};

// Update permission
exports.updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user.id;

    const permission = await Permission.findById(id);
    if (!permission) {
      return sendError(res, "Permission not found", 404);
    }

    // Check if permission is system locked
    if (permission.systemLocked) {
      return sendError(res, "Cannot edit system-locked permission", 403);
    }

    // Check permissions to edit
    const admin = await Admin.findOne({ user: userId });
    if (!admin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Only superadmin can edit all permissions, admin can only edit their own permissions
    if (
      admin.adminType !== "superadmin" &&
      permission.createdBy.toString() !== userId
    ) {
      return sendError(res, "You can only edit permissions you created", 403);
    }

    // Update fields
    if (name) permission.name = name.toLowerCase();
    if (description) permission.description = description;

    await permission.save();
    await permission.populate("createdBy", "fullName email");

    sendSuccess(res, { permission }, "Permission updated successfully", 200);
  } catch (err) {
    console.error("Update permission error:", err);
    sendError(res, "Failed to update permission", 500);
  }
};

// Toggle permission active/inactive
exports.togglePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const permission = await Permission.findById(id);
    if (!permission) {
      return sendError(res, "Permission not found", 404);
    }

    // Check if permission is system locked
    if (permission.systemLocked) {
      return sendError(res, "Cannot toggle system-locked permission", 403);
    }

    // Check permissions to toggle
    const admin = await Admin.findOne({ user: userId });
    if (!admin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Only superadmin can toggle all permissions, admin can only toggle their own permissions
    if (
      admin.adminType !== "superadmin" &&
      permission.createdBy.toString() !== userId
    ) {
      return sendError(res, "You can only toggle permissions you created", 403);
    }

    // Toggle active status
    permission.active = !permission.active;
    await permission.save();
    await permission.populate("createdBy", "fullName email");

    sendSuccess(
      res,
      { permission },
      `Permission ${
        permission.active ? "activated" : "deactivated"
      } successfully`,
      200
    );
  } catch (err) {
    console.error("Toggle permission error:", err);
    sendError(res, "Failed to toggle permission", 500);
  }
};
