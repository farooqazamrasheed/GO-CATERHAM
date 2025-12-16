const Driver = require("../models/Driver");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const Rider = require("../models/Rider");
const Ride = require("../models/Ride");
const Payment = require("../models/Payment");
const ActiveStatusHistory = require("../models/ActiveStatusHistory");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const { auditLoggers } = require("../middlewares/audit");
const { driverPhotoUpload } = require("../config/multerConfig");
const bcrypt = require("bcryptjs");
const notificationService = require("../services/notificationService");

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

    // Check if driver has uploaded and verified all required documents before approval
    const requiredDocuments = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];

    const uploadedDocuments = requiredDocuments.filter(
      (doc) =>
        driver.documents && driver.documents[doc] && driver.documents[doc].url
    );

    if (uploadedDocuments.length < requiredDocuments.length) {
      return sendError(
        res,
        `Driver must upload all required documents before approval. Uploaded: ${uploadedDocuments.length}/${requiredDocuments.length}`,
        400
      );
    }

    const verifiedDocuments = requiredDocuments.filter(
      (doc) =>
        driver.documents &&
        driver.documents[doc] &&
        driver.documents[doc].verified
    );

    if (verifiedDocuments.length < requiredDocuments.length) {
      return sendError(
        res,
        `All documents must be verified by admin before approval. Verified: ${verifiedDocuments.length}/${requiredDocuments.length}`,
        400
      );
    }

    driver.isApproved = "approved";
    driver.verificationStatus = "verified";
    driver.status = "online"; // Set to online when approved

    // Clear rejection data on approval
    driver.rejectionMessage = undefined;
    driver.lastRejectedAt = undefined;
    driver.rejectedBy = undefined;

    await driver.save();

    // Set user isVerified to true for admin verification
    const user = await User.findByIdAndUpdate(driver.user, {
      isVerified: true,
    });

    // Send approval notification
    try {
      await notificationService.sendDriverApprovedNotification(user);
    } catch (notificationError) {
      console.error(
        "Driver approval notification failed:",
        notificationError.message
      );
      // Continue without failing the approval
    }

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

    const requiredDocuments = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];

    // Check verification status of documents
    const allDocumentsUploaded = requiredDocuments.every(
      (doc) =>
        driver.documents && driver.documents[doc] && driver.documents[doc].url
    );

    const allDocumentsVerified = requiredDocuments.every(
      (doc) =>
        driver.documents &&
        driver.documents[doc] &&
        driver.documents[doc].verified
    );

    let rejectionMessage = "Your application was rejected by admin.";

    if (!allDocumentsUploaded) {
      rejectionMessage =
        "Your application was rejected because not all required documents were uploaded. Please upload all required documents and reapply.";
    } else if (!allDocumentsVerified) {
      // Find unverified documents
      const unverifiedDocs = requiredDocuments.filter(
        (doc) => !driver.documents[doc].verified
      );
      rejectionMessage = `Your application was rejected because the following documents are not verified: ${unverifiedDocs.join(
        ", "
      )}. Please upload verified copies of these documents and reapply.`;
    }

    // Update rejection details
    driver.isApproved = "rejected";
    driver.status = "offline"; // Set to offline for rejected drivers
    driver.verificationStatus = "unverified"; // Reset verification
    driver.rejectionCount += 1;
    driver.rejectionMessage = rejectionMessage;
    driver.lastRejectedAt = new Date();
    driver.rejectedBy = req.user.id;

    await driver.save();

    sendSuccess(
      res,
      {
        driver,
        message:
          "Driver rejected successfully. Driver can reapply with updated documents.",
      },
      "Driver rejected",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Reject driver without document verification check (custom rejection)
exports.rejectDriverCustom = async (req, res, next) => {
  try {
    const { rejectionMessage } = req.body;

    if (!rejectionMessage) {
      return sendError(res, "Rejection message is required", 400);
    }

    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: req.params.driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Update rejection details
    driver.isApproved = "rejected";
    driver.status = "offline"; // Set to offline for rejected drivers
    driver.verificationStatus = "unverified"; // Reset verification
    driver.rejectionCount += 1;
    driver.rejectionMessage = rejectionMessage;
    driver.lastRejectedAt = new Date();
    driver.rejectedBy = req.user.id;

    await driver.save();

    sendSuccess(
      res,
      {
        driver,
        message: "Driver rejected successfully with custom message.",
      },
      "Driver rejected",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Verify individual document
exports.verifyDocument = async (req, res, next) => {
  try {
    const { driverId, documentType } = req.params;

    // Validate document type
    const validDocumentTypes = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];

    if (!validDocumentTypes.includes(documentType)) {
      return sendError(res, "Invalid document type", 400);
    }

    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if document exists
    if (
      !driver.documents ||
      !driver.documents[documentType] ||
      !driver.documents[documentType].url
    ) {
      return sendError(res, "Document not uploaded", 400);
    }

    // Update document verification
    driver.documents[documentType].verified = true;
    driver.documents[documentType].verifiedAt = new Date();
    driver.documents[documentType].verifiedBy = req.user.id;

    await driver.save();

    sendSuccess(
      res,
      {
        driver,
        verifiedDocument: documentType,
      },
      "Document verified successfully",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Create a new driver
exports.createDriver = async (req, res) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      password,
      vehicle,
      licenseNumber,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
    } = req.body;
    const createdBy = req.user.id;

    // Validate required fields
    if (!username || !fullName || !email || !password || !vehicle) {
      return sendError(
        res,
        "username, fullName, email, password, and vehicle are required",
        400
      );
    }

    // Validate phone format (11 digits for UK/Surrey)
    const phoneRegex = /^\d{11}$/;
    if (phone && !phoneRegex.test(phone)) {
      return sendError(res, "Phone must be exactly 11 digits", 400);
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, "Email already registered", 409);
    }

    // Check if username already exists
    const existingUsername = await User.findOne({
      username: username.toLowerCase(),
    });
    if (existingUsername) {
      return sendError(res, "Username already taken", 409);
    }

    // Create user
    const user = await User.create({
      username: username.toLowerCase(),
      fullName,
      email: email.toLowerCase(),
      phone,
      password,
      role: "driver", // Always driver
      isVerified: false, // Like public signup - needs admin approval
    });

    // Create driver profile
    const driverData = {
      user: user._id,
      vehicle,
      isApproved: "pending", // Pending approval status
      status: "offline", // Offline until approved
      verificationStatus: "unverified", // Unverified until approved
      photo: null,
    };

    // Add optional fields if provided
    if (licenseNumber) driverData.licenseNumber = licenseNumber;
    if (vehicleModel) driverData.vehicleModel = vehicleModel;
    if (vehicleYear) driverData.vehicleYear = vehicleYear;
    if (vehicleColor) driverData.vehicleColor = vehicleColor;
    if (vehicleType) driverData.vehicleType = vehicleType;
    if (numberPlateOfVehicle)
      driverData.numberPlateOfVehicle = numberPlateOfVehicle;

    const driver = await Driver.create(driverData);

    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          username: user.username,
        },
        driver,
      },
      "Driver created successfully",
      201
    );
  } catch (err) {
    console.error("Create driver error:", err);
    sendError(res, "Failed to create driver", 500);
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
      username,
      fullName,
      email,
      phone,
      password,
      adminType,
      assignedPermissions,
      assignedRoles,
    } = req.body;
    const createdBy = req.user.id;

    // Validate required fields
    if (!username || !fullName || !email || !password || !adminType) {
      return sendError(
        res,
        "username, fullName, email, password, and adminType are required",
        400
      );
    }

    // Validate phone format (11 digits for UK/Surrey)
    const phoneRegex = /^\d{11}$/;
    if (phone && !phoneRegex.test(phone)) {
      return sendError(res, "Phone must be exactly 11 digits", 400);
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

    // Validate permissions and roles before creating user
    let processedPermissions = [];
    if (assignedPermissions && Array.isArray(assignedPermissions)) {
      // Support both simple array and detailed objects
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
    }

    let validatedRoles = [];
    if (assignedRoles && Array.isArray(assignedRoles)) {
      // Validate roles exist
      const validRoles = await Role.find({ _id: { $in: assignedRoles } });
      if (validRoles.length !== assignedRoles.length) {
        return sendError(res, "One or more roles are invalid", 400);
      }
      validatedRoles = assignedRoles;
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, "Email already registered", 409);
    }

    // Create user
    const user = await User.create({
      username,
      fullName,
      email,
      phone,
      password,
      role: adminType, // admin or subadmin
      isVerified: true, // Admins created via RBAC are verified
    });

    // Create admin profile
    const adminData = {
      user: user._id,
      adminType,
    };

    // Assign validated permissions and roles
    if (processedPermissions.length > 0) {
      adminData.assignedPermissions = processedPermissions;
    }

    if (validatedRoles.length > 0) {
      adminData.assignedRoles = validatedRoles;
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

// Update admin permissions and roles
exports.updateAdminPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      adminType,
      assignedPermissions, // Replace all permissions
      assignedRoles, // Replace all roles
      addPermissions, // Add to existing permissions
      addRoles, // Add to existing roles
    } = req.body;
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

    if (adminType && !["admin", "subadmin"].includes(adminType)) {
      return sendError(res, "adminType must be 'admin' or 'subadmin'", 400);
    }

    // Validate and process permissions to add
    let permissionsToAdd = [];
    if (addPermissions && Array.isArray(addPermissions)) {
      for (const perm of addPermissions) {
        if (typeof perm === "string") {
          const permissionExists = await Permission.findById(perm);
          if (!permissionExists) {
            return sendError(res, `Permission ${perm} does not exist`, 400);
          }
          // Check if permission already assigned
          const alreadyAssigned = targetAdmin.assignedPermissions.some(
            (p) => p.permissionId.toString() === perm
          );
          if (!alreadyAssigned) {
            permissionsToAdd.push({
              permissionId: perm,
              grantedBy: userId,
              grantedAt: new Date(),
            });
          }
        } else if (typeof perm === "object" && perm.permissionId) {
          const permissionExists = await Permission.findById(perm.permissionId);
          if (!permissionExists) {
            return sendError(
              res,
              `Permission ${perm.permissionId} does not exist`,
              400
            );
          }
          // Check if permission already assigned
          const alreadyAssigned = targetAdmin.assignedPermissions.some(
            (p) => p.permissionId.toString() === perm.permissionId
          );
          if (!alreadyAssigned) {
            permissionsToAdd.push({
              permissionId: perm.permissionId,
              expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
              grantedBy: userId,
              grantedAt: new Date(),
            });
          }
        }
      }
    }

    // Validate and process roles to add
    let rolesToAdd = [];
    if (addRoles && Array.isArray(addRoles)) {
      const validRoles = await Role.find({ _id: { $in: addRoles } });
      if (validRoles.length !== addRoles.length) {
        return sendError(res, "One or more roles to add are invalid", 400);
      }
      // Check if roles already assigned
      rolesToAdd = addRoles.filter(
        (roleId) =>
          !targetAdmin.assignedRoles.some(
            (existingRole) => existingRole.toString() === roleId
          )
      );
    }

    // Validate permissions to replace
    let processedPermissions = [];
    if (assignedPermissions && Array.isArray(assignedPermissions)) {
      for (const perm of assignedPermissions) {
        if (typeof perm === "string") {
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
    }

    // Validate roles to replace
    let validatedRoles = [];
    if (assignedRoles && Array.isArray(assignedRoles)) {
      const validRoles = await Role.find({ _id: { $in: assignedRoles } });
      if (validRoles.length !== assignedRoles.length) {
        return sendError(res, "One or more roles are invalid", 400);
      }
      validatedRoles = assignedRoles;
    }

    // Update Admin adminType if provided
    if (adminType) {
      targetAdmin.adminType = adminType;
    }

    // Apply updates based on operation type
    let updateMessage = "Admin permissions updated successfully";

    if (assignedPermissions && processedPermissions.length > 0) {
      // Replace all permissions
      targetAdmin.assignedPermissions = processedPermissions;
      updateMessage = "Admin permissions replaced successfully";
    } else if (addPermissions && permissionsToAdd.length > 0) {
      // Add to existing permissions
      targetAdmin.assignedPermissions = [
        ...targetAdmin.assignedPermissions,
        ...permissionsToAdd,
      ];
      updateMessage = "Permissions added to admin successfully";
    }

    if (assignedRoles && validatedRoles.length > 0) {
      // Replace all roles
      targetAdmin.assignedRoles = validatedRoles;
      updateMessage = assignedPermissions
        ? "Admin permissions and roles replaced successfully"
        : "Admin roles replaced successfully";
    } else if (addRoles && rolesToAdd.length > 0) {
      // Add to existing roles
      targetAdmin.assignedRoles = [...targetAdmin.assignedRoles, ...rolesToAdd];
      updateMessage =
        assignedPermissions || addPermissions
          ? "Permissions and roles added to admin successfully"
          : "Roles added to admin successfully";
    }

    // Check if any updates were made
    if (
      (!assignedPermissions || processedPermissions.length === 0) &&
      (!addPermissions || permissionsToAdd.length === 0) &&
      (!assignedRoles || validatedRoles.length === 0) &&
      (!addRoles || rolesToAdd.length === 0) &&
      !adminType
    ) {
      return sendError(
        res,
        "No valid permissions, roles, or adminType provided for update",
        400
      );
    }

    await targetAdmin.save();
    await targetAdmin.populate("assignedPermissions", "name description");
    await targetAdmin.populate("assignedRoles", "name description");

    sendSuccess(res, { admin: targetAdmin }, updateMessage, 200);
  } catch (err) {
    console.error("Update admin permissions error:", err);
    sendError(res, "Failed to update admin permissions", 500);
  }
};

// Update admin profile
exports.updateAdminProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { fullName, username, email, phone, password } = body;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - allow subadmins to update profiles
    if (
      currentAdmin.adminType === "admin" &&
      targetAdmin.adminType === "admin" &&
      currentAdmin._id.toString() !== targetAdmin._id.toString()
    ) {
      return sendError(res, "Admin cannot modify other admin profiles", 403);
    }

    // Validate profile fields if provided
    if (username) {
      if (username.length < 3 || username.length > 30) {
        return sendError(
          res,
          "Username must be between 3 and 30 characters",
          400
        );
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return sendError(
          res,
          "Username can only contain letters, numbers, and underscores",
          400
        );
      }
      // Check uniqueness
      const existingUsername = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: targetAdmin.user },
      });
      if (existingUsername) {
        return sendError(res, "Username already taken", 409);
      }
    }

    if (email) {
      // Check uniqueness
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: targetAdmin.user },
      });
      if (existingEmail) {
        return sendError(res, "Email already registered", 409);
      }
    }

    if (phone) {
      const phoneRegex = /^\d{11}$/;
      if (!phoneRegex.test(phone)) {
        return sendError(res, "Phone must be exactly 11 digits", 400);
      }
      // Check uniqueness
      const existingPhone = await User.findOne({
        phone,
        _id: { $ne: targetAdmin.user },
      });
      if (existingPhone) {
        return sendError(res, "Phone already registered", 409);
      }
    }

    // Prepare User updates
    const userUpdates = {};
    if (fullName) userUpdates.fullName = fullName;
    if (username) userUpdates.username = username.toLowerCase();
    if (email) userUpdates.email = email.toLowerCase();
    if (phone) userUpdates.phone = phone;
    if (password) {
      const saltRounds = 10;
      userUpdates.password = await bcrypt.hash(password, saltRounds);
    }

    // Check if any updates were provided
    if (Object.keys(userUpdates).length === 0) {
      return sendError(res, "No valid profile updates provided", 400);
    }

    // Update User
    await User.findByIdAndUpdate(targetAdmin.user, userUpdates);

    // Get updated user data
    const updatedUser = await User.findById(
      targetAdmin.user,
      "fullName username email phone"
    );

    sendSuccess(
      res,
      { user: updatedUser },
      "Admin profile updated successfully",
      200
    );
  } catch (err) {
    console.error("Update admin profile error:", err);
    sendError(res, "Failed to update admin profile", 500);
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

// Driver Management Functions

// Get verified drivers
exports.getVerifiedDrivers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { verificationStatus: "verified" };

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        drivers,
        pagination: {
          currentPage: page,
          totalPages,
          totalDrivers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Verified drivers retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get verified drivers error:", err);
    sendError(res, "Failed to retrieve verified drivers", 500);
  }
};

// Get unverified drivers
exports.getUnverifiedDrivers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { verificationStatus: "unverified" };

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        drivers,
        pagination: {
          currentPage: page,
          totalPages,
          totalDrivers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Unverified drivers retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get unverified drivers error:", err);
    sendError(res, "Failed to retrieve unverified drivers", 500);
  }
};

// Get all drivers with pagination and filtering
exports.getDrivers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    let query = {};

    // Filter by approval status
    if (req.query.isApproved) {
      query.isApproved = req.query.isApproved; // Can be "pending", "approved", "rejected"
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by vehicle type
    if (req.query.vehicleType) {
      query.vehicleType = req.query.vehicleType;
    }

    // Filter by verification status
    if (req.query.verificationStatus) {
      query.verificationStatus = req.query.verificationStatus;
    }

    // Search by name, email, or license number
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { licenseNumber: searchRegex },
        { numberPlateOfVehicle: searchRegex },
      ];
      // Also search in user fields
      const userIds = await User.find({
        $or: [
          { fullName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
        ],
      }).select("_id");
      query.$or.push({ user: { $in: userIds.map((u) => u._id) } });
    }

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        drivers,
        pagination: {
          currentPage: page,
          totalPages,
          totalDrivers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Drivers retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get drivers error:", err);
    sendError(res, "Failed to retrieve drivers", 500);
  }
};

// Get driver details by ID
exports.getDriverDetails = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName");

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    sendSuccess(res, { driver }, "Driver details retrieved successfully", 200);
  } catch (err) {
    console.error("Get driver details error:", err);
    sendError(res, "Failed to retrieve driver details", 500);
  }
};

// Update driver profile
exports.updateDriverProfile = async (req, res) => {
  try {
    const { driverId } = req.params;
    const {
      licenseNumber,
      vehicle,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
      rating,
      isApproved,
      status,
    } = req.body;
    const userId = req.user.id;

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - subadmin can update drivers, admin can update drivers, superadmin can update all
    if (currentAdmin.adminType === "subadmin") {
      // Subadmin can only update basic driver info, not approval status
      if (isApproved !== undefined) {
        return sendError(res, "Subadmin cannot change approval status", 403);
      }
    }

    // Validate license number uniqueness if changed
    if (licenseNumber && licenseNumber !== targetDriver.licenseNumber) {
      const existingLicense = await Driver.findOne({
        licenseNumber,
        _id: { $ne: driverId },
      });
      if (existingLicense) {
        return sendError(res, "License number already registered", 409);
      }
    }

    // Validate number plate uniqueness if changed
    if (
      numberPlateOfVehicle &&
      numberPlateOfVehicle !== targetDriver.numberPlateOfVehicle
    ) {
      const existingPlate = await Driver.findOne({
        numberPlateOfVehicle,
        _id: { $ne: driverId },
      });
      if (existingPlate) {
        return sendError(res, "Number plate already registered", 409);
      }
    }

    // Update driver fields
    const updateFields = {};
    if (licenseNumber !== undefined) updateFields.licenseNumber = licenseNumber;
    if (vehicle !== undefined) updateFields.vehicle = vehicle;
    if (vehicleModel !== undefined) updateFields.vehicleModel = vehicleModel;
    if (vehicleYear !== undefined) updateFields.vehicleYear = vehicleYear;
    if (vehicleColor !== undefined) updateFields.vehicleColor = vehicleColor;
    if (vehicleType !== undefined) updateFields.vehicleType = vehicleType;
    if (numberPlateOfVehicle !== undefined)
      updateFields.numberPlateOfVehicle = numberPlateOfVehicle;
    if (rating !== undefined) updateFields.rating = rating;
    if (isApproved !== undefined && currentAdmin.adminType !== "subadmin") {
      if (!["pending", "approved", "rejected"].includes(isApproved)) {
        return sendError(
          res,
          "isApproved must be 'pending', 'approved', or 'rejected'",
          400
        );
      }
      updateFields.isApproved = isApproved;
    }
    if (status !== undefined) updateFields.status = status;

    // Check if any updates were provided
    if (Object.keys(updateFields).length === 0) {
      return sendError(res, "No valid updates provided", 400);
    }

    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      updateFields,
      { new: true }
    ).populate("user", "fullName email phone");

    sendSuccess(
      res,
      { driver: updatedDriver },
      "Driver profile updated successfully",
      200
    );
  } catch (err) {
    console.error("Update driver profile error:", err);
    sendError(res, "Failed to update driver profile", 500);
  }
};

// Delete driver
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const userId = req.user.id;

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - subadmin can delete drivers, admin can delete drivers, superadmin can delete all
    // No restrictions for driver deletion in hierarchy

    // Delete driver profile and user
    await Driver.findByIdAndDelete(driverId);
    await User.findByIdAndDelete(targetDriver.user);

    sendSuccess(res, null, "Driver deleted successfully", 200);
  } catch (err) {
    console.error("Delete driver error:", err);
    sendError(res, "Failed to delete driver", 500);
  }
};

// Suspend or activate driver
exports.manageDriverStatus = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { action } = req.body; // 'suspend' or 'activate'
    const userId = req.user.id;

    if (!["suspend", "activate"].includes(action)) {
      return sendError(res, "Action must be 'suspend' or 'activate'", 400);
    }

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - subadmin can manage driver status, admin can, superadmin can
    // For now, no restrictions

    let newStatus;
    if (action === "suspend") {
      newStatus = "offline"; // Set to offline when suspended
      // Could add a suspended field to Driver model in future
    } else if (action === "activate") {
      newStatus = "offline"; // Set to offline, driver can go online themselves
    }

    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      { status: newStatus },
      { new: true }
    ).populate("user", "fullName email phone");

    const message =
      action === "suspend"
        ? "Driver suspended successfully"
        : "Driver activated successfully";

    sendSuccess(res, { driver: updatedDriver }, message, 200);
  } catch (err) {
    console.error("Manage driver status error:", err);
    sendError(res, "Failed to manage driver status", 500);
  }
};

// Upload driver photo
exports.uploadDriverPhoto = [
  driverPhotoUpload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendError(res, "No file uploaded", 400);
      }

      const { driverId } = req.params;

      const driver = await Driver.findById(driverId);
      if (!driver) {
        return sendError(res, "Driver not found", 404);
      }

      // Delete old photo if exists
      if (driver.photo && driver.photo.url) {
        const fs = require("fs");
        const path = require("path");
        const oldPath = path.join(
          __dirname,
          "../uploads/drivers",
          path.basename(driver.photo.url)
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Generate URL for the uploaded file
      const photoUrl = `/uploads/drivers/${req.file.filename}`;
      driver.photo = {
        url: photoUrl,
        uploadedAt: new Date(),
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
      };
      await driver.save();

      sendSuccess(
        res,
        {
          photo: driver.photo,
          message: "Driver photo uploaded successfully",
        },
        "Driver photo updated successfully",
        200
      );
    } catch (error) {
      console.error("Upload driver photo error:", error);
      sendError(res, "Failed to upload driver photo", 500);
    }
  },
];

// Suspend rider
exports.suspendRider = async (req, res) => {
  try {
    const { riderId } = req.params;
    const { suspensionMessage } = req.body;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    rider.isSuspended = true;
    rider.status = "suspended";
    rider.suspensionMessage =
      suspensionMessage ||
      "Your account has been suspended by admin. Please contact admin to resolve this issue.";
    rider.suspendedAt = new Date();
    rider.suspendedBy = req.user.id;

    await rider.save();

    sendSuccess(
      res,
      {
        rider: {
          id: rider._id,
          isSuspended: rider.isSuspended,
          status: rider.status,
          suspensionMessage: rider.suspensionMessage,
          suspendedAt: rider.suspendedAt,
        },
      },
      "Rider suspended successfully",
      200
    );
  } catch (err) {
    console.error("Suspend rider error:", err);
    sendError(res, "Failed to suspend rider", 500);
  }
};

// Unsuspend rider
exports.unsuspendRider = async (req, res) => {
  try {
    const { riderId } = req.params;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    rider.isSuspended = false;
    rider.status = "offline"; // Set to offline, rider can go online themselves
    rider.suspensionMessage = undefined;
    rider.suspendedAt = undefined;
    rider.suspendedBy = undefined;

    await rider.save();

    sendSuccess(
      res,
      {
        rider: {
          id: rider._id,
          isSuspended: rider.isSuspended,
          status: rider.status,
        },
      },
      "Rider unsuspended successfully",
      200
    );
  } catch (err) {
    console.error("Unsuspend rider error:", err);
    sendError(res, "Failed to unsuspend rider", 500);
  }
};

// Get all riders with pagination and filtering
exports.getRiders = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    let query = {};

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Search by name, email, or phone
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { "user.fullName": searchRegex },
        { "user.email": searchRegex },
        { "user.phone": searchRegex },
      ];
    }

    // Get total count
    const total = await Rider.countDocuments(query);

    // Get riders with user details and ride counts
    const riders = await Rider.find(query)
      .populate("user", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get ride counts for each rider
    const riderIds = riders.map((rider) => rider._id);
    const rideCounts = await Ride.aggregate([
      { $match: { rider: { $in: riderIds } } },
      { $group: { _id: "$rider", totalRides: { $sum: 1 } } },
    ]);

    // Create a map of rider ID to total rides
    const rideCountMap = {};
    rideCounts.forEach((count) => {
      rideCountMap[count._id.toString()] = count.totalRides;
    });

    // Format response
    const formattedRiders = riders.map((rider) => ({
      riderId: rider._id,
      name: rider.user?.fullName || "N/A",
      contact: {
        email: rider.user?.email || "N/A",
        phone: rider.user?.phone || "N/A",
      },
      totalRides: rideCountMap[rider._id.toString()] || 0,
      status: rider.status,
      rating: rider.rating,
      isSuspended: rider.isSuspended,
      createdAt: rider.createdAt,
    }));

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        riders: formattedRiders,
        pagination: {
          currentPage: page,
          totalPages,
          totalRiders: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Riders retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get riders error:", err);
    sendError(res, "Failed to retrieve riders", 500);
  }
};

// Get dashboard counters
exports.getDashboard = async (req, res) => {
  try {
    // Riders counts
    const totalRiders = await Rider.countDocuments();
    const activeRiders = await Rider.countDocuments({ status: "online" });
    const inactiveRiders = await Rider.countDocuments({ status: "offline" });
    const activeStatusActiveRiders = await Rider.countDocuments({
      activeStatus: "active",
    });
    const activeStatusInactiveRiders = await Rider.countDocuments({
      activeStatus: "deactive",
    });

    // Drivers counts
    const totalDrivers = await Driver.countDocuments();
    const activeDrivers = await Driver.countDocuments({
      status: { $in: ["online", "busy"] },
    });
    const inactiveDrivers = await Driver.countDocuments({ status: "offline" });
    const activeStatusActiveDrivers = await Driver.countDocuments({
      activeStatus: "active",
    });
    const activeStatusInactiveDrivers = await Driver.countDocuments({
      activeStatus: "deactive",
    });

    // Rides count
    const totalRides = await Ride.countDocuments();

    // Revenue - sum of paid payments
    const revenueResult = await Payment.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const revenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // Admins counts
    const totalAdmins = await Admin.countDocuments();
    const activeAdmins = await Admin.countDocuments({ status: "online" });
    const inactiveAdmins = await Admin.countDocuments({ status: "offline" });

    const dashboard = {
      riders: {
        total: totalRiders,
        active: activeRiders,
        inactive: inactiveRiders,
        activeStatus: {
          active: activeStatusActiveRiders,
          inactive: activeStatusInactiveRiders,
        },
      },
      drivers: {
        total: totalDrivers,
        active: activeDrivers,
        inactive: inactiveDrivers,
        activeStatus: {
          active: activeStatusActiveDrivers,
          inactive: activeStatusInactiveDrivers,
        },
      },
      rides: totalRides,
      revenue: revenue,
      admins: {
        total: totalAdmins,
        active: activeAdmins,
        inactive: inactiveAdmins,
      },
    };

    sendSuccess(res, dashboard, "Dashboard data retrieved successfully", 200);
  } catch (err) {
    console.error("Get dashboard error:", err);
    sendError(res, "Failed to retrieve dashboard data", 500);
  }
};

// Get all rides with pagination and filtering
exports.getRides = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    let query = {};

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    // Search by rider or driver name
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      // Search in rider and driver user fullName
      const riderUserIds = await User.find({
        fullName: searchRegex,
        role: "rider",
      }).select("_id");
      const driverUserIds = await User.find({
        fullName: searchRegex,
        role: "driver",
      }).select("_id");
      const driverIds = await Driver.find({
        user: { $in: driverUserIds.map((u) => u._id) },
      }).select("_id");

      query.$or = [
        { rider: { $in: riderUserIds.map((u) => u._id) } },
        { driver: { $in: driverIds.map((d) => d._id) } },
      ];
    }

    const total = await Ride.countDocuments(query);
    const rides = await Ride.find(query)
      .populate("rider", "fullName")
      .populate("driver", "user")
      .populate({
        path: "driver",
        populate: {
          path: "user",
          select: "fullName",
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedRides = rides.map((ride) => ({
      rideId: ride._id,
      riderFullName: ride.rider?.fullName || "N/A",
      driverFullName: ride.driver?.user?.fullName || "N/A",
      route: `${ride.pickup?.address || "N/A"} to ${
        ride.dropoff?.address || "N/A"
      }`,
      distance: ride.actualDistance || ride.estimatedDistance || 0,
      fare: ride.fare || ride.estimatedFare || 0,
      status: ride.status,
      createdAt: ride.createdAt,
    }));

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        rides: formattedRides,
        pagination: {
          currentPage: page,
          totalPages,
          totalRides: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Rides retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get rides error:", err);
    sendError(res, "Failed to retrieve rides", 500);
  }
};

// Get ride details by ID
exports.getRideDetails = async (req, res) => {
  try {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId)
      .populate("rider", "fullName email phone")
      .populate("driver", "user vehicle")
      .populate({
        path: "driver",
        populate: {
          path: "user",
          select: "fullName email phone",
        },
      });

    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    sendSuccess(res, { ride }, "Ride details retrieved successfully", 200);
  } catch (err) {
    console.error("Get ride details error:", err);
    sendError(res, "Failed to retrieve ride details", 500);
  }
};

// Get admin active status history
exports.getAdminActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userType: "admin" };

    const total = await ActiveStatusHistory.countDocuments(query);
    const history = await ActiveStatusHistory.find(query)
      .populate("userId", "fullName email")
      .populate("adminId", "adminType")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Admin active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get admin active history error:", err);
    sendError(res, "Failed to retrieve admin active status history", 500);
  }
};

// Get driver active status history
exports.getDriverActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userType: "driver" };

    const total = await ActiveStatusHistory.countDocuments(query);
    const history = await ActiveStatusHistory.find(query)
      .populate("userId", "fullName email")
      .populate("driverId", "vehicle numberPlateOfVehicle")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Driver active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get driver active history error:", err);
    sendError(res, "Failed to retrieve driver active status history", 500);
  }
};

// Get rider active status history
exports.getRiderActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userType: "rider" };

    const total = await ActiveStatusHistory.countDocuments(query);
    const history = await ActiveStatusHistory.find(query)
      .populate("userId", "fullName email")
      .populate("riderId", "rating")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Rider active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get rider active history error:", err);
    sendError(res, "Failed to retrieve rider active status history", 500);
  }
};

// Get all active status history
exports.getAllActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await ActiveStatusHistory.countDocuments();
    const history = await ActiveStatusHistory.find()
      .populate("userId", "fullName email")
      .populate("driverId", "vehicle numberPlateOfVehicle")
      .populate("adminId", "adminType")
      .populate("riderId", "rating")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "All active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get all active history error:", err);
    sendError(res, "Failed to retrieve all active status history", 500);
  }
};
