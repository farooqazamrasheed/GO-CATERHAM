// controllers/authController.js
const User = require("../models/User");
const Driver = require("../models/Driver");
const Rider = require("../models/Rider");
const Admin = require("../models/Admin");
const ActiveStatusHistory = require("../models/ActiveStatusHistory");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const bcrypt = require("bcryptjs");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const {
  generateToken,
  generateRefreshToken,
  verifyToken,
} = require("../utils/jwt");
const notificationService = require("../services/notificationService");

// ================= SIGNUP =================
exports.signup = async (req, res) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      password,
      confirmPassword,
      role,
      vehicle,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
      licenseNumber,
      referralCode, // For riders
      // Document uploads will be handled separately
    } = req.body;

    // Validate confirmPassword
    if (password !== confirmPassword) {
      return sendError(res, "Password and confirm password do not match", 400);
    }

    // Validate phone format (11 digits for UK/Surrey)
    const phoneRegex = /^\d{11}$/;
    if (phone && !phoneRegex.test(phone)) {
      return sendError(res, "Phone must be exactly 11 digits", 400);
    }

    // Validate username
    if (!username) {
      return sendError(res, "Username is required", 400);
    }

    // Sanitize username: replace spaces with underscores
    const sanitizedUsername = username.replace(/\s+/g, "_");

    // Check username format and length
    if (sanitizedUsername.length < 3 || sanitizedUsername.length > 30) {
      return sendError(
        res,
        "Username must be between 3 and 30 characters",
        400
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(sanitizedUsername)) {
      return sendError(
        res,
        "Username can only contain letters, numbers, and underscores",
        400
      );
    }

    // Validate required fields based on role
    if (role === "rider") {
      if (!fullName || !email || !phone || !password) {
        return sendError(
          res,
          "fullName, email, phone, password are required for rider",
          400
        );
      }
    } else if (role === "driver") {
      if (
        !fullName ||
        !email ||
        !phone ||
        !vehicle ||
        !numberPlateOfVehicle ||
        !licenseNumber ||
        !password
      ) {
        return sendError(
          res,
          "fullName, email, phone, vehicle, numberPlateOfVehicle, licenseNumber, password are required for driver",
          400
        );
      }

      // Validate vehicle year if provided
      if (
        vehicleYear &&
        (vehicleYear < 1900 || vehicleYear > new Date().getFullYear() + 1)
      ) {
        return sendError(res, "Invalid vehicle year", 400);
      }

      // Validate vehicle type if provided
      const validVehicleTypes = [
        "sedan",
        "suv",
        "electric",
        "hatchback",
        "coupe",
        "convertible",
        "wagon",
        "pickup",
        "van",
        "motorcycle",
      ];
      if (vehicleType && !validVehicleTypes.includes(vehicleType)) {
        return sendError(res, "Invalid vehicle type", 400);
      }

      // Check for duplicate license number and number plate BEFORE creating user
      const existingDriver = await Driver.findOne({
        $or: [
          { licenseNumber: licenseNumber.trim() },
          { numberPlateOfVehicle: numberPlateOfVehicle.trim() },
        ],
      });

      if (existingDriver) {
        const field =
          existingDriver.licenseNumber === licenseNumber.trim()
            ? "License number"
            : "Number plate";
        return sendError(res, `${field} already registered`, 409);
      }
    } else if (role === "admin") {
      if (!fullName || !email || !password) {
        return sendError(
          res,
          "fullName, email, password are required for admin",
          400
        );
      }
    } else {
      return sendError(res, "Invalid role", 400);
    }

    // Check username uniqueness
    const existingUsername = await User.findOne({
      username: sanitizedUsername.toLowerCase(),
    });
    if (existingUsername) {
      return sendError(res, "Username already taken", 409);
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser)
      return sendError(res, "Email or phone already registered", 409);

    let userData = {
      username: sanitizedUsername.toLowerCase(),
      fullName,
      email,
      phone,
      password,
      role,
    };
    let sendVerification = false;
    let message = "User created";

    if (role === "admin") {
      userData.isVerified = true;
      message = "Admin user created";
    } else if (role === "driver") {
      userData.isVerified = false;
      message = "Driver user created, awaiting admin verification";
    } else if (role === "rider") {
      userData.isVerified = true;
      sendVerification = true;
      message = "Rider created, verification email sent";
    }

    const user = await User.create(userData);

    // Create profiles and prepare profile info based on role
    let profileInfo = null;

    try {
      if (role === "driver") {
        const driverProfile = await Driver.create({
          user: user._id,
          licenseNumber: licenseNumber.trim(),
          vehicle,
          vehicleModel,
          vehicleYear,
          vehicleColor,
          vehicleType: vehicleType || "sedan",
          numberPlateOfVehicle,
          photo: null,
          activeStatus: "active",
        });

        // Calculate estimated approval time (24-48 hours from now)
        const estimatedApprovalTime = new Date(
          Date.now() + 48 * 60 * 60 * 1000
        );

        // Create initial activation history
        await ActiveStatusHistory.create({
          userId: user._id,
          userType: "driver",
          driverId: driverProfile._id,
          action: "activate",
          performedBy: driverProfile._id,
          timestamp: new Date(),
        });

        profileInfo = {
          onlineStatus: driverProfile.status,
          activeStatus: driverProfile.activeStatus,
          driverId: driverProfile._id, // Include this for frontend
          vehicleDetails: {
            vehicle: driverProfile.vehicle,
            vehicleModel: driverProfile.vehicleModel,
            vehicleYear: driverProfile.vehicleYear,
            vehicleColor: driverProfile.vehicleColor,
            vehicleType: driverProfile.vehicleType,
            numberPlate: driverProfile.numberPlateOfVehicle,
          },
          todaysEarnings: 0,
          verificationStatus: {
            isVerified: false,
            estimatedApprovalTime,
            submittedAt: new Date(),
            documentsRequired: [
              "drivingLicenseFront",
              "drivingLicenseBack",
              "cnicFront",
              "cnicBack",
              "vehicleRegistration",
              "insuranceCertificate",
              "vehiclePhotoFront",
              "vehiclePhotoSide",
            ],
            documentsUploaded: [], // Empty initially
            documentsStatus: "pending", // Status: pending, incomplete, complete
            nextStep: "upload_documents", // Tell frontend what to do next
            uploadEndpoint: `/api/v1/drivers/${driverProfile._id}/documents`,
          },
        };
      } else if (role === "rider") {
        // Handle referral code logic
        let referredBy = null;
        let uniqueReferralCode = null;

        if (referralCode) {
          // Find the rider who has this referral code
          const referrer = await Rider.findOne({
            referralCode: referralCode.trim(),
          });
          if (referrer) {
            referredBy = referrer._id;
          }
        }

        // Generate unique referral code for this rider
        let attempts = 0;
        do {
          uniqueReferralCode = generateReferralCode();
          attempts++;
        } while (
          (await Rider.findOne({ referralCode: uniqueReferralCode })) &&
          attempts < 10
        );

        const riderProfile = await Rider.create({
          user: user._id,
          referralCode: uniqueReferralCode,
          referredBy,
          photo: null,
          activeStatus: "active",
        });

        // Notify referrer that their referral code was used
        if (referredBy) {
          const notificationService = require("../services/notificationService");
          const socketService = require("../services/socketService");

          // Update referrer's referral stats
          await Rider.findByIdAndUpdate(referredBy, {
            $inc: {
              "referralStats.totalReferrals": 1,
            },
          });

          // Notify referrer via WebSocket
          socketService.notifyReferralCodeUsed(referredBy.toString(), {
            newReferral: {
              userId: user._id,
              fullName: fullName,
              email: email,
              signupDate: new Date(),
            },
            referralStats: {
              totalReferrals:
                (await Rider.findById(referredBy)).referralStats
                  .totalReferrals + 1,
            },
          });
        }

        // Create initial activation history
        await ActiveStatusHistory.create({
          userId: user._id,
          userType: "rider",
          riderId: riderProfile._id,
          action: "activate",
          performedBy: riderProfile._id,
          timestamp: new Date(),
        });

        profileInfo = {
          onlineStatus: riderProfile.status,
          activeStatus: riderProfile.activeStatus,
          totalRides: 0,
          rating: riderProfile.rating,
          savedAmount: 0,
          referralCode: riderProfile.referralCode,
          referredBy: riderProfile.referredBy,
          photo: riderProfile.photo,
        };
      } else if (role === "admin") {
        const adminProfile = await Admin.create({
          user: user._id,
          adminType: "admin", // Regular admin, not superadmin
          activeStatus: "active",
        });

        // Create initial activation history
        await ActiveStatusHistory.create({
          userId: user._id,
          userType: "admin",
          adminId: adminProfile._id,
          action: "activate",
          performedBy: adminProfile._id,
          timestamp: new Date(),
        });

        profileInfo = {
          onlineStatus: "online",
          activeStatus: adminProfile.activeStatus,
          permissions: "full_access",
          role: "administrator",
          adminType: adminProfile.adminType,
        };
      }
    } catch (profileError) {
      // If profile creation fails, delete the created user to maintain data integrity
      await User.findByIdAndDelete(user._id);
      console.error(
        "Profile creation failed, user deleted:",
        profileError.message
      );

      // Return appropriate error message
      if (profileError.code === 11000) {
        return sendError(
          res,
          "Duplicate key error. Please check your license number or other unique fields.",
          409
        );
      }

      return sendError(
        res,
        "Failed to create user profile. Please try again.",
        500
      );
    }

    // Send verification email if needed
    if (sendVerification) {
      try {
        const verificationToken = crypto.randomBytes(20).toString("hex");
        const verificationUrl = `${req.protocol}://${req.get(
          "host"
        )}/api/auth/verify-email/${verificationToken}`;

        await sendEmail(
          email,
          "Verify your email",
          `Click here: ${verificationUrl}`
        );
      } catch (emailError) {
        console.error("Email sending failed:", emailError.message);
        // Continue without failing the signup
      }
    }

    // Send welcome notification
    try {
      await notificationService.sendWelcomeEmail(user, role);
    } catch (notificationError) {
      console.error("Welcome notification failed:", notificationError.message);
      // Continue without failing the signup
    }

    // Generate tokens for automatic login
    const token = generateToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Return complete response with user, tokens, and profile
    sendSuccess(
      res,
      {
        user,
        token,
        refreshToken,
        profile: profileInfo,
      },
      message,
      201
    );
  } catch (err) {
    console.error("Signup error:", err);
    sendError(res, "Failed to create user account", 500);
  }
};

// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { identifier, password, role } = req.body; // identifier can be username, email or phone

    // Restrict roles to rider/driver/admin/superadmin/subadmin only
    if (
      !["rider", "driver", "admin", "superadmin", "subadmin"].includes(role)
    ) {
      return sendError(
        res,
        "Invalid role. Only rider, driver, admin, superadmin, and subadmin roles are allowed for login",
        400
      );
    }

    console.log("Login attempt for identifier:", identifier, "role:", role);
    const user = await User.findOne({
      $or: [
        { username: identifier.toLowerCase() },
        { email: identifier },
        { phone: identifier },
      ],
      role,
    });
    console.log("User found:", user ? "Yes" : "No");
    if (!user) {
      return sendError(res, "Username, email or phone number not found", 401);
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return sendError(
        res,
        "Account is temporarily locked due to too many failed login attempts. Try again later",
        423
      );
    }

    // Check if the specific role collection exists and set status to online
    let profileData = {};
    if (user.role === "rider") {
      const rider = await Rider.findOne({ user: user._id });
      if (!rider) return sendError(res, "Rider profile not found", 404);

      // Check if rider is suspended
      if (rider.isSuspended) {
        return sendError(
          res,
          rider.suspensionMessage ||
            "Your account has been suspended by admin. Please contact admin to resolve this issue.",
          403
        );
      }

      // Update status to online if not suspended
      const updatedRider = await Rider.findOneAndUpdate(
        { user: user._id },
        { status: "online" },
        { new: true }
      );
      profileData = updatedRider;
    } else if (user.role === "driver") {
      // Check if driver is approved
      const driver = await Driver.findOne({ user: user._id });
      if (!driver) return sendError(res, "Driver profile not found", 404);

      // Set status based on approval
      const newStatus = driver.isApproved === "approved" ? "online" : "offline";
      const updatedDriver = await Driver.findOneAndUpdate(
        { user: user._id },
        { status: newStatus },
        { new: true }
      );
      profileData = updatedDriver;
    } else if (user.role === "admin" || user.role === "superadmin") {
      const admin = await Admin.findOneAndUpdate(
        { user: user._id },
        { status: "online" },
        { new: true }
      );
      if (!admin) return sendError(res, "Admin profile not found", 404);
      profileData = admin;
    }

    const isMatch = await user.comparePassword(password);
    console.log("Password match:", isMatch);
    if (!isMatch) {
      // Increment failed attempts
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 3) {
        user.lockUntil = Date.now() + 1 * 60 * 1000; // 1 minute
        user.failedLoginAttempts = 0; // Reset attempts
      }
      await user.save();
      return sendError(res, "Invalid password", 401);
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    console.log("User isVerified:", user.isVerified);
    if (!user.isVerified && user.role !== "driver")
      return sendError(res, "Email not verified", 403);

    const token = generateToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Get profile information
    let profileInfo = {};
    if (role === "rider") {
      // Calculate total rides
      const Ride = require("../models/Ride");
      const totalRides = await Ride.countDocuments({
        rider: user._id,
        status: "completed",
      });

      // Get wallet balance
      const Wallet = require("../models/Wallet");
      const wallet = await Wallet.findOne({ user: user._id });
      const savedAmount = wallet ? wallet.balance : 0;

      // Calculate total spent
      const totalSpent = await Ride.aggregate([
        { $match: { rider: user._id, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]);
      const totalSpentAmount = totalSpent.length > 0 ? totalSpent[0].total : 0;

      // Referral earnings
      const referralEarnings = profileData.referralStats
        ? profileData.referralStats.totalEarnedFromReferrals
        : 0;

      profileInfo = {
        riderId: profileData._id,
        userId: profileData.user,
        referralCode: profileData.referralCode,
        referredBy: profileData.referredBy,
        rating: profileData.rating,
        onlineStatus: profileData.status,
        isSuspended: profileData.isSuspended,
        suspensionMessage: profileData.suspensionMessage,
        suspendedAt: profileData.suspendedAt,
        suspendedBy: profileData.suspendedBy,
        points: profileData.points,
        referralStats: profileData.referralStats,
        photo: profileData.photo,
        activeStatus: profileData.activeStatus,
        createdAt: profileData.createdAt,
        updatedAt: profileData.updatedAt,
        // Dashboard data
        totalRides,
        savedAmount,
        totalSpent: totalSpentAmount,
        referralEarnings,
        // User data
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        dateOfBirth: user.dateOfBirth,
        preferences: user.preferences,
        isVerified: user.isVerified,
        userCreatedAt: user.createdAt,
        userUpdatedAt: user.updatedAt,
      };
    } else if (role === "driver") {
      // Calculate earnings
      const Ride = require("../models/Ride");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todaysEarningsAgg = await Ride.aggregate([
        {
          $match: {
            driver: profileData._id,
            status: "completed",
            updatedAt: { $gte: today, $lt: tomorrow },
          },
        },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]);
      const todaysEarnings =
        todaysEarningsAgg.length > 0 ? todaysEarningsAgg[0].total : 0;

      // Weekly earnings (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weeklyEarningsAgg = await Ride.aggregate([
        {
          $match: {
            driver: profileData._id,
            status: "completed",
            updatedAt: { $gte: weekAgo },
          },
        },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]);
      const weeklyEarnings =
        weeklyEarningsAgg.length > 0 ? weeklyEarningsAgg[0].total : 0;

      // Monthly earnings (last 30 days)
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthlyEarningsAgg = await Ride.aggregate([
        {
          $match: {
            driver: profileData._id,
            status: "completed",
            updatedAt: { $gte: monthAgo },
          },
        },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]);
      const monthlyEarnings =
        monthlyEarningsAgg.length > 0 ? monthlyEarningsAgg[0].total : 0;

      // Total earnings
      const totalEarningsAgg = await Ride.aggregate([
        {
          $match: {
            driver: profileData._id,
            status: "completed",
          },
        },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]);
      const totalEarnings =
        totalEarningsAgg.length > 0 ? totalEarningsAgg[0].total : 0;

      // Ride stats
      const totalRides = await Ride.countDocuments({ driver: profileData._id });
      const completedRides = await Ride.countDocuments({
        driver: profileData._id,
        status: "completed",
      });
      const cancelledRides = await Ride.countDocuments({
        driver: profileData._id,
        status: "cancelled",
      });

      profileInfo = {
        driverId: profileData._id,
        userId: profileData.user,
        licenseNumber: profileData.licenseNumber,
        vehicle: profileData.vehicle,
        vehicleModel: profileData.vehicleModel,
        vehicleYear: profileData.vehicleYear,
        vehicleColor: profileData.vehicleColor,
        vehicleType: profileData.vehicleType,
        numberPlateOfVehicle: profileData.numberPlateOfVehicle,
        photo: profileData.photo,
        documents: profileData.documents,
        onlineStatus: profileData.status,
        verificationStatus: profileData.verificationStatus,
        isApproved: profileData.isApproved,
        rejectionCount: profileData.rejectionCount,
        rejectionMessage: profileData.rejectionMessage,
        lastRejectedAt: profileData.lastRejectedAt,
        rejectedBy: profileData.rejectedBy,
        rating: profileData.rating,
        activeStatus: profileData.activeStatus,
        createdAt: profileData.createdAt,
        updatedAt: profileData.updatedAt,
        // Earnings report
        todaysEarnings,
        weeklyEarnings,
        monthlyEarnings,
        totalEarnings,
        // Dashboard
        totalRides,
        completedRides,
        cancelledRides,
        // User data
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        dateOfBirth: user.dateOfBirth,
        preferences: user.preferences,
        isVerified: user.isVerified,
        userCreatedAt: user.createdAt,
        userUpdatedAt: user.updatedAt,
      };
    } else if (
      role === "admin" ||
      role === "superadmin" ||
      role === "subadmin"
    ) {
      // Populate assigned permissions and roles
      await profileData.populate("assignedPermissions.permissionId");
      await profileData.populate("assignedRoles");

      profileInfo = {
        adminId: profileData._id,
        userId: profileData.user,
        adminType: profileData.adminType,
        onlineStatus: profileData.status,
        activeStatus: profileData.activeStatus,
        assignedPermissions: profileData.assignedPermissions,
        assignedRoles: profileData.assignedRoles,
        createdAt: profileData.createdAt,
        updatedAt: profileData.updatedAt,
        // User data
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        dateOfBirth: user.dateOfBirth,
        preferences: user.preferences,
        isVerified: user.isVerified,
        userCreatedAt: user.createdAt,
        userUpdatedAt: user.updatedAt,
      };
    }

    sendSuccess(
      res,
      { token, refreshToken, user, profile: profileInfo },
      "Login successful",
      200
    );
  } catch (err) {
    console.error("Login error:", err);
    sendError(res, "Login failed", 500);
  }
};

// ================= LOGOUT DRIVER =================
exports.logoutDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    await Driver.findByIdAndUpdate(driverId, { status: "offline" });
    sendSuccess(res, null, "Driver logged out successfully", 200);
  } catch (err) {
    console.error("Logout driver error:", err);
    sendError(res, "Logout failed", 500);
  }
};

// ================= LOGOUT RIDER =================
exports.logoutRider = async (req, res) => {
  try {
    const { riderId } = req.params;
    await Rider.findByIdAndUpdate(riderId, { status: "offline" });
    sendSuccess(res, null, "Rider logged out successfully", 200);
  } catch (err) {
    console.error("Logout rider error:", err);
    sendError(res, "Logout failed", 500);
  }
};

// ================= LOGOUT ADMIN =================
exports.logoutAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    await Admin.findByIdAndUpdate(adminId, { status: "offline" });
    sendSuccess(res, null, "Admin logged out successfully", 200);
  } catch (err) {
    console.error("Logout admin error:", err);
    sendError(res, "Logout failed", 500);
  }
};

// ================= LOGOUT SUBADMIN =================
exports.logoutSubadmin = async (req, res) => {
  try {
    const { subadminId } = req.params;
    const admin = await Admin.findById(subadminId);
    if (!admin || admin.adminType !== "subadmin") {
      return sendError(res, "Subadmin not found", 404);
    }
    await Admin.findByIdAndUpdate(subadminId, { status: "offline" });
    sendSuccess(res, null, "Subadmin logged out successfully", 200);
  } catch (err) {
    console.error("Logout subadmin error:", err);
    sendError(res, "Logout failed", 500);
  }
};

// ================= LOGOUT SUPERADMIN =================
exports.logoutSuperadmin = async (req, res) => {
  try {
    const { superadminId } = req.params;
    const admin = await Admin.findById(superadminId);
    if (!admin || admin.adminType !== "superadmin") {
      return sendError(res, "Superadmin not found", 404);
    }
    await Admin.findByIdAndUpdate(superadminId, { status: "offline" });
    sendSuccess(res, null, "Superadmin logged out successfully", 200);
  } catch (err) {
    console.error("Logout superadmin error:", err);
    sendError(res, "Logout failed", 500);
  }
};

// ================= REFRESH TOKEN =================
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) return sendError(res, "Refresh token missing", 400);

    let decoded;
    try {
      decoded = verifyToken(refreshToken, true); // verify refresh token
    } catch (err) {
      return sendError(res, "Invalid or expired refresh token", 401);
    }

    const user = await User.findById(decoded.id);
    if (!user) return sendError(res, "User not found", 404);

    const newAccessToken = generateToken({ id: user._id, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user._id });

    sendSuccess(
      res,
      { token: newAccessToken, refreshToken: newRefreshToken },
      "Token refreshed",
      200
    );
  } catch (err) {
    console.error("Refresh token error:", err);
    sendError(res, "Failed to refresh token", 500);
  }
};

// Password strength validation
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /\d/.test(password);

  if (password.length < minLength) {
    return "Password must be at least 8 characters long";
  }
  if (!hasLetters || !hasNumbers) {
    return "Password must contain both letters and numbers";
  }
  return null; // valid
};

// Generate unique referral code
const generateReferralCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ================= FORGOT PASSWORD - REQUEST OTP =================
exports.requestOTP = async (req, res) => {
  try {
    const { email, role } = req.body;

    // Restrict roles
    if (!["rider", "driver", "admin"].includes(role)) {
      return sendError(res, "Invalid role", 400);
    }

    const user = await User.findOne({ email, role });
    if (!user) return sendError(res, "User not found", 404);

    // Check rate limiting (1 minute between requests)
    if (user.lastOtpRequest && Date.now() - user.lastOtpRequest < 60 * 1000) {
      const remainingTime = Math.ceil(
        (60 * 1000 - (Date.now() - user.lastOtpRequest)) / 1000
      );
      return sendError(
        res,
        `Please wait ${remainingTime} seconds before requesting another OTP`,
        429
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP details
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    user.otpAttempts = 0;
    user.lastOtpRequest = Date.now();
    await user.save();

    // Mask email
    const emailParts = email.split("@");
    const maskedEmail =
      emailParts[0].charAt(0) +
      "***" +
      emailParts[0].slice(-1) +
      "@" +
      emailParts[1];

    // Send OTP email
    try {
      await sendEmail(
        email,
        "Password Reset OTP",
        `Your OTP for password reset is: ${otp}. This OTP is valid for 10 minutes.`
      );
    } catch (emailError) {
      console.error("OTP email sending failed:", emailError.message);
      return sendError(res, "Failed to send OTP email", 500);
    }

    sendSuccess(
      res,
      {
        maskedEmail,
        otpExpiry: user.otpExpiry,
        nextRequestAfter: new Date(user.lastOtpRequest.getTime() + 60 * 1000),
      },
      "OTP sent to your email",
      200
    );
  } catch (err) {
    console.error("Request OTP error:", err);
    sendError(res, "Failed to request OTP", 500);
  }
};

// ================= FORGOT PASSWORD - VERIFY OTP =================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, role } = req.body;

    // Restrict roles
    if (!["rider", "driver", "admin"].includes(role)) {
      return sendError(res, "Invalid role", 400);
    }

    console.log("Verify OTP request for:", email, role);
    const user = await User.findOne({ email, role });
    console.log("User found:", !!user);
    if (!user) return sendError(res, "User not found", 404);

    console.log("User OTP data:", {
      hasOtp: !!user.otp,
      otpExpiry: user.otpExpiry,
      currentTime: Date.now(),
      isExpired: user.otpExpiry < Date.now(),
      attempts: user.otpAttempts,
    });

    // Check if OTP exists and not expired
    if (!user.otp || !user.otpExpiry || user.otpExpiry < Date.now()) {
      return sendError(res, "OTP expired or not found", 400);
    }

    // Check max attempts
    if (user.otpAttempts >= 5) {
      return sendError(res, "Maximum OTP attempts exceeded", 429);
    }

    // Debug logging
    console.log("=== OTP DEBUG ===");
    console.log(
      "Stored OTP:",
      `"${user.otp}"`,
      "Type:",
      typeof user.otp,
      "Length:",
      user.otp.length
    );
    console.log(
      "Provided OTP:",
      `"${otp}"`,
      "Type:",
      typeof otp,
      "Length:",
      otp.length
    );
    console.log("OTP Match:", user.otp === otp);
    console.log("=================");

    // Verify OTP
    if (user.otp !== otp) {
      user.otpAttempts += 1;
      await user.save();
      const remainingAttempts = 5 - user.otpAttempts;
      return sendError(
        res,
        `Invalid OTP. ${remainingAttempts} attempts remaining`,
        400
      );
    }

    // Generate reset token (valid for 15 minutes)
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    // Clear OTP fields
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    user.lastOtpRequest = undefined;

    await user.save();

    sendSuccess(res, { resetToken }, "OTP verified successfully", 200);
  } catch (err) {
    console.error("Verify OTP error:", err);
    sendError(res, "Failed to verify OTP", 500);
  }
};

// ================= FORGOT PASSWORD - RESET PASSWORD =================
exports.resetPassword = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    // Check password confirmation
    if (password !== confirmPassword) {
      return sendError(res, "Passwords do not match", 400);
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return sendError(res, passwordError, 400);
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return sendError(res, "Reset token invalid or expired", 400);

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    sendSuccess(res, null, "Password reset successful", 200);
  } catch (err) {
    console.error("Reset password error:", err);
    sendError(res, "Failed to reset password", 500);
  }
};
