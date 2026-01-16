const Ride = require("../models/Ride");
const Wallet = require("../models/Wallet");
const Payment = require("../models/Payment");
const Rider = require("../models/Rider");
const Driver = require("../models/Driver");
const LiveLocation = require("../models/LiveLocation");
const ActiveStatusHistory = require("../models/ActiveStatusHistory");
const User = require("../models/User");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const socketService = require("../services/socketService");
const path = require("path");
const fs = require("fs");

// Surrey boundary coordinates (approximate polygon for Surrey, UK)
const SURREY_BOUNDARY = {
  type: "Polygon",
  coordinates: [
    [
      [-0.7647820542412376, 51.23981446058468],
      [-0.7875715012305591, 51.3374427274924],
      [-0.6234890626433867, 51.38724570115019],
      [-0.5528255976095124, 51.44765326621072],
      [-0.4912946943742895, 51.4369998383697],
      [-0.4730633156372619, 51.460434099370985],
      [-0.4969920002292554, 51.49591764082311],
      [-0.41599643381312035, 51.48302961671584],
      [-0.4034623609311154, 51.447536045839286],
      [-0.35446553057650476, 51.40490731265197],
      [-0.3350946905903527, 51.35227709578001],
      [-0.27242432621378043, 51.39205851269867],
      [-0.23596156893145803, 51.37214590110136],
      [-0.18810419974732895, 51.34279330808303],
      [-0.12999168002420447, 51.315737863375745],
      [-0.05478725214481983, 51.348487158103154],
      [0.005236573648232934, 51.30684028123139],
      [0.08385939444977453, 51.320372623128776],
      [0.10095132645901117, 51.230557277238916],
      [0.07471019312615113, 51.14568596968138],
      [-0.09279059902101494, 51.11922959976991],
      [-0.13840415849489318, 51.15779247389932],
      [-0.20107452358979572, 51.16493836684967],
      [-0.2990681842990739, 51.12204640044169],
      [-0.47454520463912786, 51.0991543868395],
      [-0.6885988502547775, 51.033302729867955],
      [-0.7375956806094166, 51.09059298445487],
      [-0.7803726437674072, 51.11666890149371],
      [-0.8088591650132173, 51.1567073053445],
      [-0.8452124718280913, 51.192817893194615],
      [-0.7647820542412376, 51.23981446058468],
      [74.43945717928972, 31.48625965811391],
      [74.43745247486578, 31.4863339860257],
      [74.41326528017328, 31.485033239039396],
      [74.40829709964137, 31.48882393695139],
      [74.41069402884509, 31.497259546636712],
      [74.42097903415561, 31.502053012186792],
      [74.43993656513115, 31.496702150972723],
      [74.43950075982167, 31.486296822077165],
    ],
  ],
};

// Haversine formula to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Check if a point is inside Surrey boundary (simple bounding box check)
function isInSurrey(lat, lon) {
  const bounds = SURREY_BOUNDARY.coordinates[0];
  const lats = bounds.map((coord) => coord[1]);
  const lons = bounds.map((coord) => coord[0]);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

// Calculate estimated time to reach (distance / average speed)
function calculateETA(distanceKm, speedKmh = 30) {
  if (distanceKm <= 0) return 0;
  const timeHours = distanceKm / speedKmh;
  return Math.round(timeHours * 60); // Return minutes
}

// Get rider profile (Required by BACKEND_REQUIREMENTS.md)
// GET /api/v1/riders/profile
exports.getRiderProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find rider profile
    const rider = await Rider.findOne({ user: userId }).populate({
      path: "user",
      select: "fullName email phone profileImage"
    });

    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Get user details
    const user = await User.findById(userId).select("fullName email phone profileImage");

    // Format response as per BACKEND_REQUIREMENTS.md
    const profileResponse = {
      rider: {
        _id: rider._id,
        fullName: user?.fullName || "Unknown Rider",
        email: user?.email || null,
        phone: user?.phone || null,
        profileImage: rider.photo?.url || user?.profileImage || null,
        rating: rider.rating || 5.0,
        status: rider.status || "offline",
        referralCode: rider.referralCode || null,
        points: rider.points?.balance || 0,
        currentTier: rider.points?.currentTier || "Bronze"
      }
    };

    sendSuccess(res, profileResponse, "Rider profile retrieved successfully", 200);
  } catch (error) {
    console.error("Get rider profile error:", error);
    sendError(res, "Failed to retrieve rider profile", 500);
  }
};

// Get rider's active ride (Required by BACKEND_REQUIREMENTS.md)
// GET /api/v1/riders/active-ride
exports.getActiveRide = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find rider profile
    const rider = await Rider.findOne({ user: userId });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Find active ride for this rider
    // Active statuses: pending, accepted, arrived, in_progress, searching
    const activeRide = await Ride.findOne({
      rider: rider._id,
      status: { $in: ["pending", "searching", "accepted", "arrived", "in_progress"] }
    })
    .populate({
      path: "driver",
      populate: {
        path: "user",
        select: "fullName phone"
      }
    })
    .sort({ createdAt: -1 });

    if (!activeRide) {
      return sendSuccess(res, { ride: null }, "No active ride found", 200);
    }

    // Get driver's current location if ride is accepted or in progress
    let driverLocation = null;
    if (activeRide.driver && ["accepted", "arrived", "in_progress"].includes(activeRide.status)) {
      const location = await LiveLocation.findOne({ driver: activeRide.driver._id })
        .sort({ timestamp: -1 });
      
      if (location) {
        driverLocation = {
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading || 0,
          speed: location.speed || 0,
          lastUpdated: location.timestamp
        };
      }
    }

    // Format response as per BACKEND_REQUIREMENTS.md
    // CRITICAL FIX: The Ride model stores coordinates as 'lat' and 'lng', not 'latitude' and 'longitude'
    // We need to properly extract these values and ensure they're always present in the response
    const rideResponse = {
      _id: activeRide._id,
      status: activeRide.status,
      driver: activeRide.driver ? {
        id: activeRide.driver._id,
        _id: activeRide.driver._id,
        fullName: activeRide.driver.user?.fullName || "Unknown Driver",
        phone: activeRide.driver.user?.phone || null,
        vehicleType: activeRide.driver.vehicleType || "sedan",
        vehicleNumber: activeRide.driver.numberPlateOfVehicle || null,
        vehicleColor: activeRide.driver.vehicleColor || null,
        rating: activeRide.driver.rating || 5.0,
        currentLocation: driverLocation
      } : null,
      pickup: {
        // FIXED: Use 'lat' and 'lng' from the database, then also provide as 'latitude' and 'longitude' for frontend compatibility
        latitude: activeRide.pickup?.lat || activeRide.pickup?.latitude || null,
        longitude: activeRide.pickup?.lng || activeRide.pickup?.longitude || null,
        lat: activeRide.pickup?.lat || activeRide.pickup?.latitude || null,
        lng: activeRide.pickup?.lng || activeRide.pickup?.longitude || null,
        address: activeRide.pickup?.address || "Pickup Location"
      },
      dropoff: {
        // FIXED: Use 'lat' and 'lng' from the database, then also provide as 'latitude' and 'longitude' for frontend compatibility
        latitude: activeRide.dropoff?.lat || activeRide.dropoff?.latitude || null,
        longitude: activeRide.dropoff?.lng || activeRide.dropoff?.longitude || null,
        lat: activeRide.dropoff?.lat || activeRide.dropoff?.latitude || null,
        lng: activeRide.dropoff?.lng || activeRide.dropoff?.longitude || null,
        address: activeRide.dropoff?.address || "Dropoff Location"
      },
      fare: activeRide.fare || activeRide.estimatedFare || 0,
      estimatedDistance: activeRide.estimatedDistance || 0,
      estimatedDuration: activeRide.estimatedDuration || 0,
      vehicleType: activeRide.vehicleType || "sedan",
      paymentMethod: activeRide.paymentMethod || "cash",
      createdAt: activeRide.createdAt,
      acceptedAt: activeRide.acceptedAt || null,
      startedAt: activeRide.startTime || null
    };

    sendSuccess(res, { ride: rideResponse }, "Active ride retrieved successfully", 200);
  } catch (error) {
    console.error("Get active ride error:", error);
    sendError(res, "Failed to retrieve active ride", 500);
  }
};

// Get rider's past rides with pagination and filtering
exports.getRideHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status, // 'completed', 'cancelled', or undefined for all
    } = req.query;

    // Validate parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return sendError(res, "Invalid page number", 400);
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return sendError(res, "Invalid limit (1-50 allowed)", 400);
    }

    // Build query
    const query = { rider: userId };

    // Add status filter if provided
    if (status) {
      if (!["completed", "cancelled"].includes(status)) {
        return sendError(
          res,
          "Invalid status. Must be 'completed' or 'cancelled'",
          400
        );
      }
      query.status = status;
    }

    // Get total count for pagination
    const totalRides = await Ride.countDocuments(query);
    const totalPages = Math.ceil(totalRides / limitNum);
    const skip = (pageNum - 1) * limitNum;

    // Get rides with pagination
    const rides = await Ride.find(query)
      .populate({
        path: "driver",
        populate: [
          {
            path: "user",
            select: "fullName",
          },
          {
            path: "vehicle",
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Format rides data
    const formattedRides = rides.map((ride) => {
      const driver = ride.driver;
      const vehicle = driver?.vehicle;

      return {
        rideId: ride._id,
        dateTime: ride.createdAt,
        pickupAddress: ride.pickup?.address || "N/A",
        dropoffAddress: ride.dropoff?.address || "N/A",
        driver: driver
          ? {
              name: driver.user?.fullName || "Unknown Driver",
              photo: driver.photo
                ? `/api/v1/drivers/${driver._id}/photo`
                : null,
              rating: driver.rating || 5.0,
            }
          : null,
        vehicle: vehicle
          ? {
              make: vehicle.make || "Unknown",
              model: vehicle.model || "Unknown",
              color: vehicle.color || "Unknown",
              plateNumber: vehicle.numberPlateOfVehicle || "Unknown",
            }
          : null,
        fare: ride.fare || 0,
        distance: ride.actualDistance || ride.estimatedDistance || 0,
        duration: ride.actualDuration || ride.estimatedDuration || 0,
        status: ride.status,
        rating: ride.rating?.riderRating || null,
      };
    });

    const response = {
      rides: formattedRides,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRides,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        limit: limitNum,
      },
      realTimeUpdates: {
        subscribed: true,
        updateInterval: 30000, // 30 seconds for history updates (less frequent than active rides)
        events: ["ride_completed", "ride_cancelled", "ride_history_update"],
      },
    };

    // Subscribe user to real-time ride history updates
    socketService.subscribeToRideHistoryUpdates(userId);

    sendSuccess(res, response, "Ride history retrieved successfully", 200);
  } catch (error) {
    console.error("Get ride history error:", error);
    sendError(res, "Failed to retrieve ride history", 500);
  }
};

// Top-up wallet
// NOTE: This is the legacy wallet top-up method (for manual/admin top-ups)
// For Stripe payment integration, use POST /api/v1/stripe/create-payment-intent
// followed by POST /api/v1/stripe/confirm-payment
exports.topUpWallet = async (req, res) => {
  try {
    const { amount, paymentMethod = "manual" } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || isNaN(numAmount)) {
      return sendError(res, "Invalid amount", 400);
    }

    // For card payments, redirect to Stripe integration
    if (paymentMethod === "card" || paymentMethod === "stripe") {
      return sendError(
        res,
        "For card payments, please use the Stripe payment API: POST /api/v1/stripe/create-payment-intent",
        400
      );
    }

    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user.id });
    }

    wallet.balance += numAmount;
    await wallet.save();

    // Emit real-time wallet update
    socketService.notifyWalletUpdate(req.user.id, {
      _id: wallet._id,
      balance: wallet.balance,
      currency: wallet.currency,
      transactions: wallet.transactions,
      updatedAt: wallet.updatedAt,
    });

    // Create a Payment record for wallet top-up
    const payment = await Payment.create({
      rider: req.user.id,
      amount: numAmount,
      status: "paid",
      paymentMethod: paymentMethod === "manual" ? "cash" : paymentMethod,
      description: `Manual wallet top-up (${paymentMethod})`,
    });

    // Add transaction to wallet
    const newTransaction = {
      type: "topup",
      amount: numAmount,
      payment: payment._id,
      description: `Wallet top-up via ${paymentMethod}`,
    };
    wallet.transactions.push(newTransaction);
    await wallet.save();

    // Emit real-time transaction notification
    socketService.notifyWalletTransaction(req.user.id, {
      ...newTransaction,
      _id: wallet.transactions[wallet.transactions.length - 1]._id,
      timestamp: new Date(),
    });

    sendSuccess(res, { wallet, payment }, "Wallet topped up successfully", 200);
  } catch (err) {
    console.error("Top-up wallet error:", err);
    sendError(res, "Failed to top up wallet", 500);
  }
};

// Update rider status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body || {}; // online/offline
    if (!["online", "offline"].includes(status)) {
      return sendError(res, "Invalid status. Must be online or offline", 400);
    }

    const rider = await Rider.findOneAndUpdate(
      { user: req.user.id },
      { status },
      { new: true }
    );

    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Emit real-time status update
    socketService.notifyRiderStatusUpdate(req.user.id, status);

    sendSuccess(res, { rider }, "Status updated successfully", 200);
  } catch (err) {
    console.error("Update status error:", err);
    sendError(res, "Failed to update status", 500);
  }
};

// Get rider dashboard data
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude } = req.query;

    // Validate location parameters
    if (!latitude || !longitude) {
      return sendError(
        res,
        "User location (latitude, longitude) is required",
        400
      );
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);

    if (isNaN(userLat) || isNaN(userLon)) {
      return sendError(res, "Invalid latitude or longitude", 400);
    }

    // Get rider profile
    const rider = await Rider.findOne({ user: userId });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Calculate current month date range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    // Calculate previous month date range
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59
    );

    // Get monthly ride statistics
    const [currentMonthRides, lastMonthRides] = await Promise.all([
      Ride.countDocuments({
        rider: userId,
        status: "completed",
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      }),
      Ride.countDocuments({
        rider: userId,
        status: "completed",
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
    ]);

    // Calculate percentage change
    let ridesChangePercent = 0;
    if (lastMonthRides > 0) {
      ridesChangePercent = Math.round(
        ((currentMonthRides - lastMonthRides) / lastMonthRides) * 100
      );
    } else if (currentMonthRides > 0) {
      ridesChangePercent = 100; // If no rides last month but has rides this month
    }

    // Get wallet balance (total saved amount)
    const wallet = await Wallet.findOne({ user: userId });
    const totalSaved = wallet ? wallet.balance : 0;

    // Get nearby available drivers
    const nearbyDrivers = await getNearbyDrivers(userLat, userLon);

    // Extract first name from full name
    const firstName = req.user.fullName
      ? req.user.fullName.split(" ")[0]
      : "User";

    const dashboardData = {
      welcomeMessage: `Welcome back, ${firstName}!`,
      stats: {
        totalRides: {
          count: currentMonthRides,
          changePercent: ridesChangePercent,
          description: "This month's journey",
        },
        totalSaved: {
          amount: totalSaved,
          currency: "GBP",
          formatted: `£${totalSaved.toFixed(2)}`,
        },
        rating: rider.rating || 5.0,
      },
      nearbyDrivers,
      mapConfig: {
        surreyBoundary: SURREY_BOUNDARY,
        userLocation: {
          latitude: userLat,
          longitude: userLon,
        },
      },
    };

    sendSuccess(
      res,
      dashboardData,
      "Dashboard data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Dashboard error:", error);
    sendError(res, "Failed to retrieve dashboard data", 500);
  }
};

// Upload rider photo (Required by BACKEND_REQUIREMENTS.md)
// POST /api/v1/riders/photo
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, "No photo file provided", 400);
    }

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];

    if (!allowedTypes.includes(req.file.mimetype)) {
      return sendError(
        res,
        "Invalid file type. Only JPEG, JPG, and PNG are allowed",
        400
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      return sendError(res, "File too large. Maximum size is 5MB", 400);
    }

    // Update rider photo information
    const photoUrl = `/uploads/riders/${req.file.filename}`;
    rider.photo = {
      url: photoUrl,
      filename: req.file.filename,
      uploadedAt: new Date(),
      mimetype: req.file.mimetype,
      size: req.file.size,
    };

    await rider.save();

    // Response format as per BACKEND_REQUIREMENTS.md
    sendSuccess(
      res,
      {
        photoUrl: photoUrl
      },
      "Photo uploaded successfully",
      200
    );
  } catch (error) {
    console.error("Upload photo error:", error);
    sendError(res, "Failed to upload photo", 500);
  }
};

// Get rider photo
exports.getPhoto = async (req, res) => {
  try {
    const { riderId } = req.params;

    const rider = await Rider.findById(riderId);
    if (!rider || !rider.photo || !rider.photo.filename) {
      return sendError(res, "Photo not found", 404);
    }

    const photoPath = path.join(
      __dirname,
      "../uploads/riders",
      rider.photo.filename
    );

    // Check if file exists
    if (!fs.existsSync(photoPath)) {
      return sendError(res, "Photo file not found", 404);
    }

    // Set appropriate headers
    res.setHeader("Content-Type", rider.photo.mimetype);
    res.setHeader("Content-Length", rider.photo.size);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Stream the file
    const fileStream = fs.createReadStream(photoPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Get photo error:", error);
    sendError(res, "Failed to retrieve photo", 500);
  }
};

// Deactivate rider account
exports.deactivateAccount = async (req, res) => {
  try {
    const { riderId, password, reason } = req.body;

    // Validate required fields
    if (!riderId || !password || !reason) {
      return sendError(res, "riderId, password, and reason are required", 400);
    }

    // Find rider
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    // Check if it's the rider's own account
    if (rider.user.toString() !== req.user.id) {
      return sendError(res, "Unauthorized to deactivate this account", 403);
    }

    // Find user to verify password
    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, "Invalid password", 401);
    }

    // Check if already deactivated
    if (rider.activeStatus === "deactive") {
      return sendError(res, "Account is already deactivated", 400);
    }

    // Update activeStatus to "deactive" and isDeactivated to true
    rider.activeStatus = "deactive";
    rider.isDeactivated = true;
    await rider.save();

    // Create ActiveStatusHistory
    await ActiveStatusHistory.create({
      userId: req.user.id,
      userType: "rider",
      riderId: rider._id,
      action: "deactivate",
      performedBy: rider._id,
      reason: reason,
      timestamp: new Date(),
    });

    // Notify via WebSocket (optional)
    socketService.notifyRiderStatusUpdate(rider._id.toString(), "deactivated");

    sendSuccess(res, null, "Account deactivated successfully", 200);
  } catch (error) {
    console.error("Deactivate account error:", error);
    sendError(res, "Failed to deactivate account", 500);
  }
};

// Activate rider account
exports.activateAccount = async (req, res) => {
  try {
    const { riderId, password, reason } = req.body;

    // Validate required fields
    if (!riderId || !password) {
      return sendError(res, "riderId and password are required", 400);
    }

    // Find rider
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    // Check if it's the rider's own account
    if (rider.user.toString() !== req.user.id) {
      return sendError(res, "Unauthorized to activate this account", 403);
    }

    // Find user to verify password
    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, "Invalid password", 401);
    }

    // Check if already activated
    if (rider.activeStatus === "active") {
      return sendError(res, "Account is already activated", 400);
    }

    // Update activeStatus to "active" and isDeactivated to false
    rider.activeStatus = "active";
    rider.isDeactivated = false;
    await rider.save();

    // Create ActiveStatusHistory
    await ActiveStatusHistory.create({
      userId: req.user.id,
      userType: "rider",
      riderId: rider._id,
      action: "activate",
      performedBy: rider._id,
      reason: reason || "Self-activation",
      timestamp: new Date(),
    });

    // Notify via WebSocket (optional)
    socketService.notifyRiderStatusUpdate(rider._id.toString(), "activated");

    sendSuccess(res, null, "Account activated successfully", 200);
  } catch (error) {
    console.error("Activate account error:", error);
    sendError(res, "Failed to activate account", 500);
  }
};

// Get available drivers near a location (Required by BACKEND_REQUIREMENTS.md)
// GET /api/v1/riders/available-drivers
exports.getAvailableDrivers = async (req, res) => {
  try {
    const { latitude, longitude, radius, vehicleType } = req.query;

    // Validate required parameters
    if (!latitude || !longitude) {
      return sendError(res, "Latitude and longitude are required", 400);
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const searchRadius = radius ? parseFloat(radius) / 1000 : 5; // Convert meters to km, default 5km (5000m as per spec)

    if (isNaN(userLat) || isNaN(userLon)) {
      return sendError(res, "Invalid latitude or longitude", 400);
    }

    if (isNaN(searchRadius) || searchRadius <= 0 || searchRadius > 50) {
      return sendError(res, "Invalid radius (must be 1-50000 meters)", 400);
    }

    // Validate vehicleType if provided
    const validVehicleTypes = [
      "sedan", "suv", "electric", "hatchback", "coupe",
      "convertible", "wagon", "pickup", "van", "motorcycle"
    ];
    if (vehicleType && !validVehicleTypes.includes(vehicleType)) {
      return sendError(res, `Invalid vehicleType. Must be one of: ${validVehicleTypes.join(", ")}`, 400);
    }

    // Get nearby drivers with optional vehicleType filter
    const nearbyDrivers = await getNearbyDrivers(
      userLat,
      userLon,
      searchRadius,
      vehicleType
    );

    // Format response as per BACKEND_REQUIREMENTS.md specification
    const formattedDrivers = nearbyDrivers.map(driver => ({
      id: driver.driverId,
      name: driver.driverName,
      rating: driver.rating || 4.5,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber || "N/A",
      currentLocation: {
        latitude: driver.location.latitude,
        longitude: driver.location.longitude
      },
      distance: Math.round(driver.distance * 1000), // Convert km to meters as per spec
      estimatedFare: calculateEstimatedFare(driver.distance, driver.vehicleType)
    }));

    sendSuccess(
      res,
      { 
        drivers: formattedDrivers
      },
      "Available drivers retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get available drivers error:", error);
    sendError(res, "Failed to retrieve available drivers", 500);
  }
};

// Helper function to calculate estimated fare
function calculateEstimatedFare(distanceKm, vehicleType = "sedan") {
  const baseFares = {
    sedan: 5.00,
    suv: 7.00,
    electric: 6.00,
    hatchback: 4.50,
    coupe: 6.50,
    convertible: 8.00,
    wagon: 6.00,
    pickup: 7.50,
    van: 8.50,
    motorcycle: 3.50
  };
  
  const perKmRates = {
    sedan: 1.50,
    suv: 2.00,
    electric: 1.75,
    hatchback: 1.25,
    coupe: 1.75,
    convertible: 2.25,
    wagon: 1.75,
    pickup: 2.00,
    van: 2.50,
    motorcycle: 1.00
  };

  const baseFare = baseFares[vehicleType] || baseFares.sedan;
  const perKmRate = perKmRates[vehicleType] || perKmRates.sedan;
  
  const totalFare = baseFare + (distanceKm * perKmRate);
  return parseFloat(totalFare.toFixed(2));
}

/**
 * Diagnostic endpoint to check why drivers are not appearing
 * GET /api/v1/riders/debug-drivers?latitude=X&longitude=Y
 */
exports.debugAvailableDrivers = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return sendError(res, "Latitude and longitude are required", 400);
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Get ALL driver locations (not just recent)
    const allLocations = await LiveLocation.find().populate({
      path: "driver",
      populate: { path: "user", select: "fullName" }
    });

    const debugInfo = {
      searchLocation: { latitude: userLat, longitude: userLon },
      totalLocationsInDB: allLocations.length,
      analysis: []
    };

    for (const location of allLocations) {
      const isRecent = location.timestamp >= fiveMinutesAgo;
      const ageMinutes = Math.round((Date.now() - location.timestamp) / 1000 / 60);
      const distance = calculateDistance(userLat, userLon, location.latitude, location.longitude);
      
      const driverAnalysis = {
        driverId: location.driver?._id || "N/A",
        driverName: location.driver?.user?.fullName || "Unknown",
        location: { lat: location.latitude, lng: location.longitude },
        distanceKm: Math.round(distance * 100) / 100,
        withinRange: distance <= 5,
        locationAge: `${ageMinutes} minutes`,
        isLocationRecent: isRecent,
        driverStatus: location.driver?.status || "N/A",
        isApproved: location.driver?.isApproved || "N/A",
        activeStatus: location.driver?.activeStatus || "N/A",
        issues: []
      };

      // Check for issues
      if (!isRecent) {
        driverAnalysis.issues.push(`Location is ${ageMinutes} min old (must be < 5 min)`);
      }
      if (location.driver?.status !== "online") {
        driverAnalysis.issues.push(`Driver status is "${location.driver?.status}" (must be "online")`);
      }
      if (location.driver?.isApproved !== "approved") {
        driverAnalysis.issues.push(`Driver isApproved is "${location.driver?.isApproved}" (must be "approved")`);
      }
      if (location.driver?.activeStatus !== "active") {
        driverAnalysis.issues.push(`Driver activeStatus is "${location.driver?.activeStatus}" (must be "active")`);
      }
      if (distance > 5) {
        driverAnalysis.issues.push(`Distance ${distance.toFixed(2)} km exceeds 5km limit`);
      }

      driverAnalysis.wouldAppear = driverAnalysis.issues.length === 0;
      debugInfo.analysis.push(driverAnalysis);
    }

    // Summary
    debugInfo.summary = {
      driversWithRecentLocation: debugInfo.analysis.filter(d => d.isLocationRecent).length,
      driversWithinRange: debugInfo.analysis.filter(d => d.withinRange).length,
      driversOnline: debugInfo.analysis.filter(d => d.driverStatus === "online").length,
      driversApproved: debugInfo.analysis.filter(d => d.isApproved === "approved").length,
      driversActive: debugInfo.analysis.filter(d => d.activeStatus === "active").length,
      driversWouldAppear: debugInfo.analysis.filter(d => d.wouldAppear).length,
    };

    sendSuccess(res, debugInfo, "Driver debug information", 200);
  } catch (error) {
    console.error("Debug drivers error:", error);
    sendError(res, "Failed to debug drivers", 500);
  }
};

// Helper function to get nearby available drivers
async function getNearbyDrivers(userLat, userLon, maxDistanceKm = 5, vehicleType = null) {
  try {
    console.log("DEBUG [getNearbyDrivers]: Searching for drivers near:", {
      userLat,
      userLon,
      maxDistanceKm,
      vehicleType
    });

    // Get all recent live locations (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Check total locations in DB
    const totalLocations = await LiveLocation.countDocuments();
    console.log("DEBUG [getNearbyDrivers]: Total LiveLocation records:", totalLocations);

    // Also get count of stale locations to help debug
    const staleLocationsCount = await LiveLocation.countDocuments({
      timestamp: { $lt: fiveMinutesAgo }
    });
    console.log("DEBUG [getNearbyDrivers]: Stale locations (>5 min old):", staleLocationsCount);

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
    }).populate({
      path: "driver",
      populate: {
        path: "user",
        select: "fullName",
      },
    });

    console.log("DEBUG [getNearbyDrivers]: Found", recentLocations.length, "recent locations (within 5 min)");
    
    // If no recent locations but there are stale ones, log details
    if (recentLocations.length === 0 && staleLocationsCount > 0) {
      const mostRecentStale = await LiveLocation.findOne().sort({ timestamp: -1 }).populate("driver");
      if (mostRecentStale) {
        const ageMinutes = Math.round((Date.now() - mostRecentStale.timestamp) / 1000 / 60);
        console.log("DEBUG [getNearbyDrivers]: WARNING - No recent locations! Most recent is", ageMinutes, "minutes old from driver:", mostRecentStale.driver?._id);
      }
    }

    const driversWithDistance = [];
    let filteredOut = {
      noDriver: 0,
      notOnline: 0,
      notApproved: 0,
      outsideBoundary: 0,
      tooFar: 0
    };

    for (const location of recentLocations) {
      // Check if driver is online, approved, and active
      if (!location.driver) {
        filteredOut.noDriver++;
        continue;
      }
      if (location.driver.status !== "online") {
        filteredOut.notOnline++;
        console.log("DEBUG [getNearbyDrivers]: Driver filtered - not online:", {
          driverId: location.driver._id,
          status: location.driver.status
        });
        continue;
      }
      if (location.driver.isApproved !== "approved") {
        filteredOut.notApproved++;
        console.log("DEBUG [getNearbyDrivers]: Driver filtered - not approved:", {
          driverId: location.driver._id,
          isApproved: location.driver.isApproved
        });
        continue;
      }
      // Filter by activeStatus === "active" as per BACKEND_CHANGES_REQUIRED.md
      if (location.driver.activeStatus !== "active") {
        filteredOut.notActive = (filteredOut.notActive || 0) + 1;
        console.log("DEBUG [getNearbyDrivers]: Driver filtered - not active:", {
          driverId: location.driver._id,
          activeStatus: location.driver.activeStatus
        });
        continue;
      }

      // Filter by vehicleType if specified
      if (vehicleType && location.driver.vehicleType !== vehicleType) {
        filteredOut.wrongVehicleType = (filteredOut.wrongVehicleType || 0) + 1;
        continue;
      }

      // Check if driver is within Surrey boundary (disabled for testing)
      const inBoundary = isInSurrey(location.latitude, location.longitude);
      if (!inBoundary) {
        console.log("DEBUG [getNearbyDrivers]: Driver outside Surrey boundary (allowing for testing):", {
          driverId: location.driver._id,
          lat: location.latitude,
          lng: location.longitude
        });
        // For testing: Allow drivers outside boundary
        // In production, uncomment the following:
        // filteredOut.outsideBoundary++;
        // continue;
      }

      // Calculate distance
      const distance = calculateDistance(
        userLat,
        userLon,
        location.latitude,
        location.longitude
      );

      // Debug: Log distance calculation for each driver
      console.log("DEBUG [getNearbyDrivers]: Distance calculation:", {
        driverId: location.driver._id,
        driverLocation: { lat: location.latitude, lng: location.longitude },
        userLocation: { lat: userLat, lng: userLon },
        calculatedDistance: distance.toFixed(2) + " km",
        maxAllowed: maxDistanceKm + " km",
        withinRange: distance <= maxDistanceKm
      });

      // Only include drivers within specified distance
      if (distance <= maxDistanceKm) {
        // Calculate ETA (estimated time of arrival)
        const eta = calculateETA(distance, location.speed || 30);

        driversWithDistance.push({
          driverId: location.driver._id,
          driverName: location.driver.user?.fullName || "Unknown Driver",
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          heading: location.heading || 0,
          vehicleType: location.driver.vehicleType || "sedan",
          vehicleNumber: location.driver.numberPlateOfVehicle || null,
          rating: location.driver.rating || 4.5,
          distance: Math.round(distance * 10) / 10, // Round to 1 decimal place
          eta: eta,
          speed: location.speed || 0,
          lastUpdated: location.timestamp,
        });
      } else {
        filteredOut.tooFar++;
        console.log("DEBUG [getNearbyDrivers]: Driver TOO FAR:", {
          driverId: location.driver._id,
          distance: distance.toFixed(2) + " km",
          maxAllowed: maxDistanceKm + " km"
        });
      }
    }

    console.log("DEBUG [getNearbyDrivers]: Final results:", {
      totalRecent: recentLocations.length,
      availableDrivers: driversWithDistance.length,
      filteredOut
    });

    // Sort by distance (closest first) and limit to 50 drivers
    return driversWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);
  } catch (error) {
    console.error("ERROR [getNearbyDrivers]:", error);
    return [];
  }
}
