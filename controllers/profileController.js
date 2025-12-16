const User = require("../models/User");
const Rider = require("../models/Rider");
const Driver = require("../models/Driver");
const Admin = require("../models/Admin");
const SavedLocation = require("../models/SavedLocation");
const PaymentMethod = require("../models/PaymentMethod");
const UserSettings = require("../models/UserSettings");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const { profilePictureUpload } = require("../config/multerConfig");
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
        profilePicture: user.profilePicture,
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
    const { fullName, phone, address, dateOfBirth, preferences } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Validate email format if provided
    if (req.body.email) {
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(req.body.email)) {
        return sendError(res, "Invalid email format", 400);
      }

      // Check if email is already taken
      const existingUser = await User.findOne({
        email: req.body.email,
        _id: { $ne: req.user.id },
      });
      if (existingUser) {
        return sendError(res, "Email already in use", 409);
      }

      user.email = req.body.email;
    }

    // Validate phone format if provided
    if (phone) {
      const phoneRegex = /^\d{10,15}$/;
      if (!phoneRegex.test(phone)) {
        return sendError(res, "Invalid phone number format", 400);
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
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePicture: user.profilePicture,
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

// Upload profile picture
exports.uploadProfilePicture = [
  profilePictureUpload.single("profilePicture"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendError(res, "No file uploaded", 400);
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return sendError(res, "User not found", 404);
      }

      // Delete old profile picture if exists
      if (user.profilePicture) {
        const oldPath = path.join(
          __dirname,
          "../uploads/profiles",
          path.basename(user.profilePicture)
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Generate URL for the uploaded file
      const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;
      user.profilePicture = profilePictureUrl;
      await user.save();

      sendSuccess(
        res,
        {
          profilePicture: profilePictureUrl,
          message: "Profile picture uploaded successfully",
        },
        "Profile picture updated successfully",
        200
      );
    } catch (error) {
      console.error("Upload profile picture error:", error);
      sendError(res, "Failed to upload profile picture", 500);
    }
  },
];

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

    const location = await SavedLocation.create({
      rider: rider._id,
      name,
      customName: name === "favorite" ? customName : undefined,
      address,
      coordinates,
      placeId,
      isDefault: isDefault || false,
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
