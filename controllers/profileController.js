const User = require("../models/User");
const Rider = require("../models/Rider");
const Driver = require("../models/Driver");
const Admin = require("../models/Admin");
const SavedLocation = require("../models/SavedLocation");
const PaymentMethod = require("../models/PaymentMethod");
const UserSettings = require("../models/UserSettings");
const ActiveStatusHistory = require("../models/ActiveStatusHistory");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const { auditLoggers } = require("../middlewares/audit");

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -otp -otpExpiry -resetPasswordToken -resetPasswordExpire"
    );

    if (!user) {
      return sendError(res, "User not found", 404);
    }

    const rider = await Rider.findOne({ user: req.user.id });

    // Get settings
    let settings = await UserSettings.findOne({ user: req.user.id });
    if (!settings) {
      // Create default settings if they don't exist
      settings = await UserSettings.create({ user: req.user.id });
    }

    const profile = {
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address,
        dateOfBirth: user.dateOfBirth,
        preferences: user.preferences,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      },
      rider: rider
        ? {
            rating: rider.rating,
            status: rider.status,
            referralCode: rider.referralCode,
            totalReferrals: rider.referralStats.totalReferrals,
            successfulReferrals: rider.referralStats.successfulReferrals,
          }
        : null,
      settings: settings,
    };

    sendSuccess(res, profile, "Profile retrieved successfully", 200);
  } catch (error) {
    console.error("Get profile error:", error);
    sendError(res, "Failed to retrieve profile", 500);
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const body = req.body || {};
    const { username, fullName, phone, address, dateOfBirth, preferences } =
      body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Validate username if provided
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
      // Check if username is already taken
      const existingUser = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: req.user.id },
      });
      if (existingUser) {
        return sendError(res, "Username already taken", 409);
      }
      user.username = username.toLowerCase();
    }

    // Validate email format if provided
    if (body.email) {
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(body.email)) {
        return sendError(res, "Invalid email format", 400);
      }

      // Check if email is already taken
      const existingUser = await User.findOne({
        email: body.email,
        _id: { $ne: req.user.id },
      });
      if (existingUser) {
        return sendError(res, "Email already in use", 409);
      }

      user.email = body.email;
    }

    // Validate phone format if provided
    if (phone) {
      const phoneRegex = /^\d{11}$/;
      if (!phoneRegex.test(phone)) {
        return sendError(res, "Phone must be exactly 11 digits", 400);
      }
      user.phone = phone;
    }

    // Update other fields
    if (fullName) user.fullName = fullName;
    if (address) user.address = { ...user.address, ...address };
    if (dateOfBirth) user.dateOfBirth = new Date(dateOfBirth);
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    await user.save();

    // Return updated profile
    const updatedProfile = {
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address,
        dateOfBirth: user.dateOfBirth,
        preferences: user.preferences,
        isVerified: user.isVerified,
      },
    };

    sendSuccess(res, updatedProfile, "Profile updated successfully", 200);
  } catch (error) {
    console.error("Update profile error:", error);
    sendError(res, "Failed to update profile", 500);
  }
};

// Get saved locations
exports.getSavedLocations = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const locations = await SavedLocation.find({ rider: rider._id }).sort({
      createdAt: -1,
    });

    sendSuccess(
      res,
      { locations },
      "Saved locations retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get saved locations error:", error);
    sendError(res, "Failed to retrieve saved locations", 500);
  }
};

// Add saved location
exports.addSavedLocation = async (req, res) => {
  try {
    const { name, customName, address, coordinates, placeId, isDefault } =
      req.body;

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Validate required fields
    if (
      !name ||
      !address ||
      !coordinates ||
      !coordinates.lat ||
      !coordinates.lng
    ) {
      return sendError(res, "Name, address, and coordinates are required", 400);
    }

    // Validate location type
    if (!["home", "work", "favorite"].includes(name)) {
      return sendError(res, "Invalid location type", 400);
    }

    // Check if location type already exists (except for favorites)
    if (name !== "favorite") {
      const existingLocation = await SavedLocation.findOne({
        rider: rider._id,
        name: name,
      });
      if (existingLocation) {
        return sendError(res, `${name} location already exists`, 409);
      }
    }

    // Check favorite limit
    if (name === "favorite") {
      const favoriteCount = await SavedLocation.countDocuments({
        rider: rider._id,
        name: "favorite",
      });
      if (favoriteCount >= 10) {
        return sendError(res, "Maximum 10 favorite locations allowed", 400);
      }
    }

    const location = await SavedLocation.create({
      rider: rider._id,
      name,
      customName: name === "favorite" ? customName : undefined,
      address,
      coordinates,
      placeId,
      isDefault: isDefault || false,
    });

    // Real-time notification for location added
    const socketService = require("../services/socketService");
    socketService.notifyLocationAdded(rider._id.toString(), {
      id: location._id,
      name: location.name,
      customName: location.customName,
      address: location.address,
      coordinates: location.coordinates,
      placeId: location.placeId,
      isDefault: location.isDefault,
      createdAt: location.createdAt,
    });

    sendSuccess(res, { location }, "Location saved successfully", 201);
  } catch (error) {
    console.error("Add saved location error:", error);
    sendError(res, "Failed to save location", 500);
  }
};

// Delete saved location
exports.deleteSavedLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const location = await SavedLocation.findOne({
      _id: id,
      rider: rider._id,
    });

    if (!location) {
      return sendError(res, "Location not found", 404);
    }

    await SavedLocation.findByIdAndDelete(id);

    // Real-time notification for location deleted
    const socketService = require("../services/socketService");
    socketService.notifyLocationDeleted(rider._id.toString(), id);

    sendSuccess(res, null, "Location deleted successfully", 200);
  } catch (error) {
    console.error("Delete saved location error:", error);
    sendError(res, "Failed to delete location", 500);
  }
};

// Get payment methods
exports.getPaymentMethods = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const paymentMethods = await PaymentMethod.find({ rider: rider._id }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    const methodsWithMasks = paymentMethods.map((method) => ({
      id: method._id,
      type: method.type,
      isDefault: method.isDefault,
      status: method.status,
      maskedCard: method.maskedCard,
      brand: method.card?.brand,
      expiryMonth: method.card?.expiryMonth,
      expiryYear: method.card?.expiryYear,
      paypalEmail: method.paypal?.email,
      provider: method.provider,
      createdAt: method.createdAt,
    }));

    sendSuccess(
      res,
      { paymentMethods: methodsWithMasks },
      "Payment methods retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get payment methods error:", error);
    sendError(res, "Failed to retrieve payment methods", 500);
  }
};

// Add payment method
exports.addPaymentMethod = async (req, res) => {
  try {
    const { type, card, paypal, paymentToken, provider } = req.body;

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Validate payment method data
    if (type === "card" && (!card || !card.last4 || !card.brand)) {
      return sendError(res, "Card details are required", 400);
    }

    if (type === "paypal" && (!paypal || !paypal.email)) {
      return sendError(res, "PayPal email is required", 400);
    }

    const paymentMethod = await PaymentMethod.create({
      rider: rider._id,
      type,
      card: type === "card" ? card : undefined,
      paypal: type === "paypal" ? paypal : undefined,
      paymentToken,
      provider,
    });

    const response = {
      id: paymentMethod._id,
      type: paymentMethod.type,
      isDefault: paymentMethod.isDefault,
      status: paymentMethod.status,
      maskedCard: paymentMethod.maskedCard,
      brand: paymentMethod.card?.brand,
      provider: paymentMethod.provider,
    };

    // Real-time notification for payment method added
    const socketService = require("../services/socketService");
    socketService.notifyPaymentMethodAdded(rider._id.toString(), {
      id: paymentMethod._id,
      type: paymentMethod.type,
      isDefault: paymentMethod.isDefault,
      status: paymentMethod.status,
      maskedCard: paymentMethod.maskedCard,
      brand: paymentMethod.card?.brand,
      expiryMonth: paymentMethod.card?.expiryMonth,
      expiryYear: paymentMethod.card?.expiryYear,
      paypalEmail: paymentMethod.paypal?.email,
      provider: paymentMethod.provider,
      createdAt: paymentMethod.createdAt,
    });

    sendSuccess(
      res,
      { paymentMethod: response },
      "Payment method added successfully",
      201
    );
  } catch (error) {
    console.error("Add payment method error:", error);
    sendError(res, "Failed to add payment method", 500);
  }
};

// Delete payment method
exports.deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      rider: rider._id,
    });

    if (!paymentMethod) {
      return sendError(res, "Payment method not found", 404);
    }

    await PaymentMethod.findByIdAndDelete(id);

    // Real-time notification for payment method deleted
    const socketService = require("../services/socketService");
    socketService.notifyPaymentMethodDeleted(rider._id.toString(), id);

    sendSuccess(res, null, "Payment method deleted successfully", 200);
  } catch (error) {
    console.error("Delete payment method error:", error);
    sendError(res, "Failed to delete payment method", 500);
  }
};

// Get user settings
exports.getSettings = async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ user: req.user.id });
    if (!settings) {
      settings = await UserSettings.create({ user: req.user.id });
    }

    sendSuccess(res, { settings }, "Settings retrieved successfully", 200);
  } catch (error) {
    console.error("Get settings error:", error);
    sendError(res, "Failed to retrieve settings", 500);
  }
};

// Update user settings
exports.updateSettings = async (req, res) => {
  try {
    const updateData = req.body;

    let settings = await UserSettings.findOne({ user: req.user.id });
    if (!settings) {
      settings = await UserSettings.create({ user: req.user.id });
    }

    // Update settings fields
    Object.keys(updateData).forEach((key) => {
      if (settings[key] !== undefined) {
        settings[key] = { ...settings[key], ...updateData[key] };
      }
    });

    await settings.save();

    sendSuccess(res, { settings }, "Settings updated successfully", 200);
  } catch (error) {
    console.error("Update settings error:", error);
    sendError(res, "Failed to update settings", 500);
  }
};

// Activate Driver
exports.activateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const allowedRoles = ["driver", "admin", "superadmin", "subadmin"];
    if (!allowedRoles.includes(req.user.role))
      return sendError(res, "Unauthorized", 403);
    const driver = await Driver.findById(driverId);
    if (!driver) return sendError(res, "Driver not found", 404);
    // If not admin, check if it's their own account
    if (
      !["admin", "superadmin", "subadmin"].includes(req.user.role) &&
      driver.user.toString() !== req.user.id
    )
      return sendError(res, "Unauthorized", 403);

    await Driver.findByIdAndUpdate(driverId, { activeStatus: "active" });

    const historyData = {
      userId: driver.user,
      userType: "driver",
      action: "activate",
      performedBy: req.user.id,
    };
    historyData.driverId = driverId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: driver.user,
        userType: "driver",
        action: "activate",
        timestamp: new Date(),
        performedBy: driverId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate driver error:", err);
    sendError(res, "Failed to activate account", 500);
  }
};

// Deactivate Driver
exports.deactivateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const allowedRoles = ["driver", "admin", "superadmin", "subadmin"];
    if (!allowedRoles.includes(req.user.role))
      return sendError(res, "Unauthorized", 403);
    const driver = await Driver.findById(driverId);
    if (!driver) return sendError(res, "Driver not found", 404);
    // If not admin, check if it's their own account
    if (
      !["admin", "superadmin", "subadmin"].includes(req.user.role) &&
      driver.user.toString() !== req.user.id
    )
      return sendError(res, "Unauthorized", 403);

    await Driver.findByIdAndUpdate(driverId, { activeStatus: "deactive" });

    const historyData = {
      userId: driver.user,
      userType: "driver",
      action: "deactivate",
      performedBy: req.user.id,
    };
    historyData.driverId = driverId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: driver.user,
        userType: "driver",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: driverId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate driver error:", err);
    sendError(res, "Failed to deactivate account", 500);
  }
};

// Activate Rider
exports.activateRider = async (req, res) => {
  try {
    const { riderId } = req.params;
    const allowedRoles = ["rider", "admin", "superadmin", "subadmin"];
    if (!allowedRoles.includes(req.user.role))
      return sendError(res, "Unauthorized", 403);
    const rider = await Rider.findById(riderId);
    if (!rider) return sendError(res, "Rider not found", 404);
    // If not admin, check if it's their own account
    if (
      !["admin", "superadmin", "subadmin"].includes(req.user.role) &&
      rider.user.toString() !== req.user.id
    )
      return sendError(res, "Unauthorized", 403);

    await Rider.findByIdAndUpdate(riderId, { activeStatus: "active" });

    const historyData = {
      userId: rider.user,
      userType: "rider",
      action: "activate",
      performedBy: req.user.id,
    };
    historyData.riderId = riderId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: rider.user,
        userType: "rider",
        action: "activate",
        timestamp: new Date(),
        performedBy: riderId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate rider error:", err);
    sendError(res, "Failed to activate account", 500);
  }
};

// Deactivate Rider
exports.deactivateRider = async (req, res) => {
  try {
    const { riderId } = req.params;
    const allowedRoles = ["rider", "admin", "superadmin", "subadmin"];
    if (!allowedRoles.includes(req.user.role))
      return sendError(res, "Unauthorized", 403);
    const rider = await Rider.findById(riderId);
    if (!rider) return sendError(res, "Rider not found", 404);
    // If not admin, check if it's their own account
    if (
      !["admin", "superadmin", "subadmin"].includes(req.user.role) &&
      rider.user.toString() !== req.user.id
    )
      return sendError(res, "Unauthorized", 403);

    await Rider.findByIdAndUpdate(riderId, { activeStatus: "deactive" });

    const historyData = {
      userId: rider.user,
      userType: "rider",
      action: "deactivate",
      performedBy: req.user.id,
    };
    historyData.riderId = riderId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: rider.user,
        userType: "rider",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: riderId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate rider error:", err);
    sendError(res, "Failed to deactivate account", 500);
  }
};

// Activate Admin
exports.activateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (req.user.role !== "admin") return sendError(res, "Unauthorized", 403);
    const admin = await Admin.findById(adminId);
    if (!admin || admin.adminType !== "admin")
      return sendError(res, "Admin not found", 404);
    if (admin.user.toString() !== req.user.id)
      return sendError(res, "Unauthorized", 403);

    await Admin.findByIdAndUpdate(adminId, { activeStatus: "active" });

    const historyData = {
      userId: admin.user,
      userType: "admin",
      action: "activate",
      performedBy: req.user.id,
    };
    historyData.adminId = adminId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: admin.user,
        userType: "admin",
        action: "activate",
        timestamp: new Date(),
        performedBy: adminId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate admin error:", err);
    sendError(res, "Failed to activate account", 500);
  }
};

// Deactivate Admin
exports.deactivateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (req.user.role !== "admin") return sendError(res, "Unauthorized", 403);
    const admin = await Admin.findById(adminId);
    if (!admin || admin.adminType !== "admin")
      return sendError(res, "Admin not found", 404);
    if (admin.user.toString() !== req.user.id)
      return sendError(res, "Unauthorized", 403);

    await Admin.findByIdAndUpdate(adminId, { activeStatus: "deactive" });

    const historyData = {
      userId: admin.user,
      userType: "admin",
      action: "deactivate",
      performedBy: req.user.id,
    };
    historyData.adminId = adminId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: admin.user,
        userType: "admin",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: adminId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate admin error:", err);
    sendError(res, "Failed to deactivate account", 500);
  }
};

// Activate Subadmin
exports.activateSubadmin = async (req, res) => {
  try {
    const { subadminId } = req.params;
    if (req.user.role !== "subadmin")
      return sendError(res, "Unauthorized", 403);
    const admin = await Admin.findById(subadminId);
    if (!admin || admin.adminType !== "subadmin")
      return sendError(res, "Subadmin not found", 404);
    if (admin.user.toString() !== req.user.id)
      return sendError(res, "Unauthorized", 403);

    await Admin.findByIdAndUpdate(subadminId, { activeStatus: "active" });

    const historyData = {
      userId: admin.user,
      userType: "admin",
      action: "activate",
      performedBy: req.user.id,
    };
    historyData.adminId = subadminId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: admin.user,
        userType: "admin",
        action: "activate",
        timestamp: new Date(),
        performedBy: subadminId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate subadmin error:", err);
    sendError(res, "Failed to activate account", 500);
  }
};

// Deactivate Subadmin
exports.deactivateSubadmin = async (req, res) => {
  try {
    const { subadminId } = req.params;
    if (req.user.role !== "subadmin")
      return sendError(res, "Unauthorized", 403);
    const admin = await Admin.findById(subadminId);
    if (!admin || admin.adminType !== "subadmin")
      return sendError(res, "Subadmin not found", 404);
    if (admin.user.toString() !== req.user.id)
      return sendError(res, "Unauthorized", 403);

    await Admin.findByIdAndUpdate(subadminId, { activeStatus: "deactive" });

    const historyData = {
      userId: admin.user,
      userType: "admin",
      action: "deactivate",
      performedBy: req.user.id,
    };
    historyData.adminId = subadminId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: admin.user,
        userType: "admin",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: subadminId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate subadmin error:", err);
    sendError(res, "Failed to deactivate account", 500);
  }
};

// Activate Superadmin
exports.activateSuperadmin = async (req, res) => {
  try {
    const { superadminId } = req.params;
    if (req.user.role !== "superadmin")
      return sendError(res, "Unauthorized", 403);
    const admin = await Admin.findById(superadminId);
    if (!admin || admin.adminType !== "superadmin")
      return sendError(res, "Superadmin not found", 404);
    if (admin.user.toString() !== req.user.id)
      return sendError(res, "Unauthorized", 403);

    await Admin.findByIdAndUpdate(superadminId, { activeStatus: "active" });

    const historyData = {
      userId: admin.user,
      userType: "admin",
      action: "activate",
      performedBy: req.user.id,
    };
    historyData.adminId = superadminId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: admin.user,
        userType: "admin",
        action: "activate",
        timestamp: new Date(),
        performedBy: superadminId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate superadmin error:", err);
    sendError(res, "Failed to activate account", 500);
  }
};

// Deactivate Superadmin
exports.deactivateSuperadmin = async (req, res) => {
  try {
    const { superadminId } = req.params;
    if (req.user.role !== "superadmin")
      return sendError(res, "Unauthorized", 403);
    const admin = await Admin.findById(superadminId);
    if (!admin || admin.adminType !== "superadmin")
      return sendError(res, "Superadmin not found", 404);
    if (admin.user.toString() !== req.user.id)
      return sendError(res, "Unauthorized", 403);

    await Admin.findByIdAndUpdate(superadminId, { activeStatus: "deactive" });

    const historyData = {
      userId: admin.user,
      userType: "admin",
      action: "deactivate",
      performedBy: req.user.id,
    };
    historyData.adminId = superadminId;
    await ActiveStatusHistory.create(historyData);

    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: admin.user,
        userType: "admin",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: superadminId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate superadmin error:", err);
    sendError(res, "Failed to deactivate account", 500);
  }
};
