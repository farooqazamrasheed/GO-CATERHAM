const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const LiveLocation = require("../models/LiveLocation");
const User = require("../models/User");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const path = require("path");
const fs = require("fs");

// Document Status Transition Validation Helper
const validateStatusTransition = (currentStatus, action, document) => {
  // Define valid transitions
  const validTransitions = {
    verify: ['not_uploaded', 'uploaded', 'pending_verification', 'rejected'],
    reject: ['uploaded', 'pending_verification'],
    mark_missing: ['not_uploaded'],
    reupload: ['rejected', 'not_uploaded']
  };

  // Check if document exists for certain actions
  if ((action === 'verify' || action === 'reject') && !document.url) {
    return {
      valid: false,
      message: `Cannot ${action} a document that hasn't been uploaded`
    };
  }

  // Check if document is already verified
  if (action === 'verify' && currentStatus === 'verified') {
    return {
      valid: false,
      message: 'Document is already verified. No need to verify again.'
    };
  }

  // Cannot reject verified documents
  if (action === 'reject' && currentStatus === 'verified') {
    return {
      valid: false,
      message: 'Cannot reject a verified document. Please unverify it first or contact support.'
    };
  }

  // Cannot mark uploaded document as missing
  if (action === 'mark_missing' && document.url) {
    return {
      valid: false,
      message: 'Cannot mark an uploaded document as missing. The document exists in the system.'
    };
  }

  // Special validation for reupload
  if (action === 'reupload' && currentStatus === 'verified') {
    return {
      valid: false,
      message: 'Cannot re-upload a verified document. Your document has already been approved.'
    };
  }

  if (action === 'reupload' && currentStatus === 'pending_verification') {
    return {
      valid: false,
      message: 'Document is currently pending verification. Please wait for admin review before re-uploading.'
    };
  }

  // Check if current status allows this action
  if (validTransitions[action] && !validTransitions[action].includes(currentStatus)) {
    const statusMap = {
      not_uploaded: 'not uploaded',
      uploaded: 'uploaded',
      pending_verification: 'pending verification',
      verified: 'verified',
      rejected: 'rejected'
    };
    return {
      valid: false,
      message: `Cannot ${action} a document with status "${statusMap[currentStatus] || currentStatus}"`
    };
  }

  return { valid: true };
};

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

// Upload driver photo
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, "No photo file provided", 400);
    }

    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
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

    // Update driver photo information
    driver.photo = {
      url: `/uploads/drivers/${req.file.filename}`,
      filename: req.file.filename,
      uploadedAt: new Date(),
      mimetype: req.file.mimetype,
      size: req.file.size,
    };

    await driver.save();

    sendSuccess(
      res,
      {
        photo: driver.photo,
      },
      "Photo uploaded successfully",
      200
    );
  } catch (error) {
    console.error("Upload photo error:", error);
    sendError(res, "Failed to upload photo", 500);
  }
};

// Get driver photo
exports.getPhoto = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId);
    if (!driver || !driver.photo || !driver.photo.filename) {
      return sendError(res, "Photo not found", 404);
    }

    const photoPath = path.join(
      __dirname,
      "../uploads/drivers",
      driver.photo.filename
    );

    // Check if file exists
    if (!fs.existsSync(photoPath)) {
      return sendError(res, "Photo file not found", 404);
    }

    // Set appropriate headers
    res.setHeader("Content-Type", driver.photo.mimetype);
    res.setHeader("Content-Length", driver.photo.size);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Stream the file
    const fileStream = fs.createReadStream(photoPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Get photo error:", error);
    sendError(res, "Failed to retrieve photo", 500);
  }
};

// Get current driver status
exports.getCurrentStatus = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    sendSuccess(
      res,
      { status: driver.status },
      "Status retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get current status error:", error);
    sendError(res, "Failed to retrieve status", 500);
  }
};

// Get driver verification status
exports.getVerificationStatus = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Map isApproved to verification status
    let verificationStatus = "unverified";
    if (driver.isApproved === "approved") {
      verificationStatus = "verified";
    } else if (driver.isApproved === "pending") {
      verificationStatus = "pending";
    } else if (driver.isApproved === "rejected") {
      verificationStatus = "rejected";
    }

    // Driver can only go online if approved
    const canGoOnline = driver.isApproved === "approved";

    sendSuccess(
      res,
      {
        verificationStatus,
        canGoOnline,
        rejectionReason: null, // Can be added later if rejection reasons are implemented
      },
      "Verification status retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get verification status error:", error);
    sendError(res, "Failed to retrieve verification status", 500);
  }
};

// Update driver status
exports.updateStatus = async (req, res) => {
  try {
    const { status, latitude, longitude, heading, speed } = req.body;

    if (!["online", "offline", "busy"].includes(status)) {
      return sendError(
        res,
        "Invalid status. Must be online, offline, or busy",
        400
      );
    }

    const driver = await Driver.findOneAndUpdate(
      { user: req.user.id },
      { status },
      { new: true }
    );

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    let locationWarning = null;
    let locationSaved = false;

    // If going online and location is provided, create/update location
    if (status === "online" && latitude && longitude) {
      console.log("DEBUG [updateStatus]: Driver going online with location:", {
        driverId: driver._id,
        latitude,
        longitude,
        isApproved: driver.isApproved,
        vehicleType: driver.vehicleType
      });

      // Create or update live location so driver appears in searches
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      const locationData = {
        driver: driver._id,
        latitude: lat,
        longitude: lng,
        heading: heading ? parseFloat(heading) : 0,
        speed: speed ? parseFloat(speed) : 0,
        timestamp: new Date(),
        location: {
          type: "Point",
          coordinates: [lng, lat] // GeoJSON format: [longitude, latitude]
        }
      };

      const locationResult = await LiveLocation.findOneAndUpdate(
        { driver: driver._id },
        locationData,
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false }
      );

      console.log("DEBUG [updateStatus]: Location saved for online driver:", {
        locationId: locationResult._id,
        timestamp: locationResult.timestamp,
        lat: locationResult.latitude,
        lng: locationResult.longitude
      });
      locationSaved = true;
    } else if (status === "online" && (!latitude || !longitude)) {
      // Driver going online without location - they won't appear in rider searches!
      console.log("DEBUG [updateStatus]: WARNING - Driver going online WITHOUT location. Driver will NOT appear in rider searches!");
      locationWarning = "You are online but your location was not sent. You will NOT appear in rider searches until you send your location. Please ensure GPS is enabled and call POST /api/v1/drivers/location with your coordinates.";
    }

    // Real-time notification for status update
    const socketService = require("../services/socketService");
    socketService.notifyDriverStatusUpdate(driver._id.toString(), status);

    // Notify nearby riders about driver status change (for online/offline changes)
    await socketService.notifyNearbyRidersAboutDriverStatus(
      driver._id.toString(),
      status,
      {
        vehicleType: driver.vehicleType,
        user: driver.user,
      }
    );

    // Notify admins about driver status change
    await socketService.notifyAdminDriverStatusUpdate(driver, status);

    // Include warning in response if driver went online without location
    const responseData = { driver };
    if (status === "online") {
      responseData.locationSaved = locationSaved;
      responseData.isVisible = locationSaved; // Whether driver is visible to riders
    }
    if (locationWarning) {
      responseData.warning = locationWarning;
      responseData.requiresLocation = true;
      responseData.locationEndpoint = "POST /api/v1/drivers/location";
    }

    sendSuccess(res, responseData, locationWarning || "Status updated successfully", 200);
  } catch (error) {
    console.error("Update status error:", error);
    sendError(res, "Failed to update status", 500);
  }
};

// Get driver profile
exports.getProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id })
      .populate("user", "fullName email phone")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName");

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    sendSuccess(res, { driver }, "Profile retrieved successfully", 200);
  } catch (error) {
    console.error("Get profile error:", error);
    sendError(res, "Failed to retrieve profile", 500);
  }
};

// Update driver profile
exports.updateProfile = async (req, res) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      vehicle,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
      licenseExpiryDate,
      licenseNumber,
    } = req.body;

    // Find the driver
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    // Update user fields if provided
    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: req.user.id },
      });
      if (existingUser) {
        return sendError(res, "Username already taken", 409);
      }
      user.username = username.toLowerCase();
    }

    if (fullName !== undefined) {
      user.fullName = fullName;
    }

    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.user.id },
      });
      if (existingUser) {
        return sendError(res, "Email already taken", 409);
      }
      user.email = email.toLowerCase();
    }

    if (phone !== undefined) {
      const phoneRegex = /^\d{11}$/;
      if (!phoneRegex.test(phone)) {
        return sendError(res, "Phone must be exactly 11 digits", 400);
      }
      user.phone = phone;
    }

    // Update driver fields if provided
    if (vehicle !== undefined) {
      driver.vehicle = vehicle;
    }

    if (vehicleModel !== undefined) {
      driver.vehicleModel = vehicleModel;
    }

    if (vehicleYear !== undefined) {
      driver.vehicleYear = vehicleYear;
    }

    if (vehicleColor !== undefined) {
      driver.vehicleColor = vehicleColor;
    }

    if (vehicleType !== undefined) {
      const validTypes = [
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
      if (!validTypes.includes(vehicleType)) {
        return sendError(res, "Invalid vehicle type", 400);
      }
      driver.vehicleType = vehicleType;
    }

    if (numberPlateOfVehicle !== undefined) {
      // Check if number plate is already taken by another driver
      const existingDriver = await Driver.findOne({
        numberPlateOfVehicle,
        _id: { $ne: driver._id },
      });
      if (existingDriver) {
        return sendError(res, "Number plate already registered", 409);
      }
      driver.numberPlateOfVehicle = numberPlateOfVehicle;
    }

    if (licenseNumber !== undefined) {
      // Check if license number is already taken by another driver
      const existingDriver = await Driver.findOne({
        licenseNumber,
        _id: { $ne: driver._id },
      });
      if (existingDriver) {
        return sendError(res, "License number already registered", 409);
      }
      driver.licenseNumber = licenseNumber;
    }

    // Save changes
    await user.save();
    await driver.save();

    // Send real-time WebSocket notifications
    const socketService = require("../services/socketService");

    // Notify driver about profile update
    socketService.notifyDriverProfileUpdate(driver._id.toString(), {
      updatedFields: Object.keys(req.body),
      timestamp: new Date(),
    });

    // Notify dashboard subscribers about profile changes
    socketService.notifyDriverDashboardUpdate(
      driver._id.toString(),
      {
        profile: {
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          vehicle: driver.vehicle,
          vehicleModel: driver.vehicleModel,
          vehicleType: driver.vehicleType,
          status: driver.status,
        },
      },
      "profile"
    );

    // Return updated profile
    const updatedDriver = await Driver.findOne({ user: req.user.id })
      .populate("user", "username fullName email phone")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName");

    sendSuccess(
      res,
      { driver: updatedDriver },
      "Profile updated successfully",
      200
    );
  } catch (error) {
    console.error("Update profile error:", error);
    sendError(res, "Failed to update profile", 500);
  }
};

// Get driver dashboard data
exports.getDashboard = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { latitude, longitude } = req.query;

    // Validate location parameters
    if (!latitude || !longitude) {
      return sendError(
        res,
        "Driver location (latitude, longitude) is required",
        400
      );
    }

    const driverLat = parseFloat(latitude);
    const driverLon = parseFloat(longitude);

    if (isNaN(driverLat) || isNaN(driverLon)) {
      return sendError(res, "Invalid latitude or longitude", 400);
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: driverId });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Calculate date ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    // Get earnings and ride statistics
    const [todayStats, weekStats, monthStats, totalStats] = await Promise.all([
      // Today's stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$fare" },
            rides: { $sum: 1 },
          },
        },
      ]),

      // This week's stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: weekStart, $lt: weekEnd },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$fare" },
            rides: { $sum: 1 },
          },
        },
      ]),

      // This month's stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: monthStart, $lte: monthEnd },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$fare" },
            rides: { $sum: 1 },
          },
        },
      ]),

      // Total stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$fare" },
            totalRides: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Extract stats
    const todayEarnings = todayStats[0]?.earnings || 0;
    const todayRides = todayStats[0]?.rides || 0;
    const weekEarnings = weekStats[0]?.earnings || 0;
    const weekRides = weekStats[0]?.rides || 0;
    const monthEarnings = monthStats[0]?.earnings || 0;
    const monthRides = monthStats[0]?.rides || 0;
    const totalEarnings = totalStats[0]?.totalEarnings || 0;
    const totalRides = totalStats[0]?.totalRides || 0;

    // Check for active ride
    const activeRide = await Ride.findOne({
      driver: driver._id,
      status: { $in: ["accepted", "arrived", "in_progress"] },
    });

    // Get nearby drivers and ride requests
    const [nearbyDrivers, nearbyRideRequests, hotZones] = await Promise.all([
      getNearbyDriversForDriver(driverLat, driverLon, driver._id),
      getNearbyRideRequests(driverLat, driverLon),
      getHotZones(),
    ]);

    // Extract first name
    const firstName = req.user.fullName
      ? req.user.fullName.split(" ")[0]
      : "Driver";

    const dashboardData = {
      driver: {
        name: req.user.fullName,
        firstName: firstName,
        status: driver.status,
        rating: driver.rating || 5.0,
        totalRides: totalRides,
        totalEarnings: totalEarnings,
        activeRideId: activeRide?._id || null,
      },
      earnings: {
        today: {
          amount: todayEarnings,
          formatted: `£${todayEarnings.toFixed(2)}`,
          rides: todayRides,
        },
        week: {
          amount: weekEarnings,
          formatted: `£${weekEarnings.toFixed(2)}`,
          rides: weekRides,
        },
        month: {
          amount: monthEarnings,
          formatted: `£${monthEarnings.toFixed(2)}`,
          rides: monthRides,
        },
      },
      stats: {
        todayRides: todayRides,
        weekRides: weekRides,
        monthRides: monthRides,
        totalRides: totalRides,
      },
      mapData: {
        driverLocation: {
          latitude: driverLat,
          longitude: driverLon,
        },
        nearbyDrivers: nearbyDrivers,
        hotZones: hotZones,
        nearbyRideRequests: nearbyRideRequests,
        surreyBoundary: SURREY_BOUNDARY,
      },
    };

    sendSuccess(
      res,
      dashboardData,
      "Driver dashboard data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Driver dashboard error:", error);
    sendError(res, "Failed to retrieve dashboard data", 500);
  }
};

// Helper function to get nearby drivers for driver dashboard
async function getNearbyDriversForDriver(
  driverLat,
  driverLon,
  currentDriverId
) {
  try {
    // Get all recent live locations (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
      driver: { $ne: currentDriverId }, // Exclude current driver
    }).populate({
      path: "driver",
      populate: {
        path: "user",
        select: "fullName",
      },
    });

    const driversWithDistance = [];

    for (const location of recentLocations) {
      // Check if driver is online and approved
      if (
        !location.driver ||
        location.driver.status !== "online" ||
        location.driver.isApproved !== "approved"
      ) {
        continue;
      }

      // Check if driver is within Surrey boundary
      if (!isInSurrey(location.latitude, location.longitude)) {
        continue;
      }

      // Calculate distance
      const distance = calculateDistance(
        driverLat,
        driverLon,
        location.latitude,
        location.longitude
      );

      // Only include drivers within 10km
      if (distance <= 10) {
        driversWithDistance.push({
          driverId: location.driver._id,
          driverName: location.driver.user?.fullName || "Unknown Driver",
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          heading: location.heading || 0,
          vehicleType: location.driver.vehicleType || "sedan",
          distance: Math.round(distance * 10) / 10,
          status: location.driver.status,
          lastUpdated: location.timestamp,
        });
      }
    }

    // Sort by distance and limit to 20 drivers
    return driversWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20);
  } catch (error) {
    console.error("Error getting nearby drivers for driver:", error);
    return [];
  }
}

// Get driver earnings report
exports.getEarningsReport = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { period = "month", startDate, endDate } = req.query;

    // Calculate date range
    let start, end;
    const now = new Date();

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      switch (period) {
        case "day":
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = new Date(start);
          end.setDate(start.getDate() + 1);
          break;
        case "week":
          start = new Date(now);
          start.setDate(now.getDate() - now.getDay()); // Start of week
          end = new Date(start);
          end.setDate(start.getDate() + 7);
          break;
        case "month":
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
      }
    }

    // Get completed rides in date range
    const rides = await Ride.find({
      driver: driverId,
      status: "completed",
      endTime: { $gte: start, $lt: end },
    }).sort({ endTime: -1 });

    // Calculate summary statistics
    const totalRides = rides.length;
    const totalEarnings = rides.reduce(
      (sum, ride) => sum + (ride.driverEarnings || 0),
      0
    );
    const totalTips = rides.reduce((sum, ride) => sum + (ride.tips || 0), 0);
    const totalBonuses = rides.reduce(
      (sum, ride) => sum + (ride.bonuses || 0),
      0
    );
    const totalBaseFares = rides.reduce(
      (sum, ride) => sum + (ride.fare || 0),
      0
    );
    const averageEarningsPerRide =
      totalRides > 0 ? totalEarnings / totalRides : 0;

    // Calculate tax (assuming 20% VAT on earnings)
    const taxRate = 0.2;
    const grossEarnings = totalEarnings;
    const taxAmount = grossEarnings * taxRate;
    const netEarnings = grossEarnings - taxAmount;

    // Group rides by date for daily breakdown
    const dailyBreakdown = {};
    rides.forEach((ride) => {
      const date = ride.endTime.toISOString().split("T")[0]; // YYYY-MM-DD format
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          date,
          earnings: 0,
          rides: 0,
          hoursWorked: 0,
          tips: 0,
          bonuses: 0,
        };
      }

      dailyBreakdown[date].earnings += ride.driverEarnings || 0;
      dailyBreakdown[date].rides += 1;
      dailyBreakdown[date].tips += ride.tips || 0;
      dailyBreakdown[date].bonuses += ride.bonuses || 0;

      // Calculate hours worked (from start to end time)
      if (ride.startTime && ride.endTime) {
        const hours = (ride.endTime - ride.startTime) / (1000 * 60 * 60); // hours
        dailyBreakdown[date].hoursWorked += hours;
      }
    });

    // Convert to array and sort by date
    const dailyBreakdownArray = Object.values(dailyBreakdown).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    // Calculate chart data (earnings over time)
    const chartData = dailyBreakdownArray.map((day) => ({
      date: day.date,
      earnings: Math.round(day.earnings * 100) / 100,
      rides: day.rides,
    }));

    const response = {
      period: {
        type: period,
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
      },
      summary: {
        totalRides,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        averageEarningsPerRide: Math.round(averageEarningsPerRide * 100) / 100,
        currency: "GBP",
      },
      breakdown: {
        baseFares: Math.round(totalBaseFares * 100) / 100,
        tips: Math.round(totalTips * 100) / 100,
        bonuses: Math.round(totalBonuses * 100) / 100,
        grossEarnings: Math.round(grossEarnings * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        netEarnings: Math.round(netEarnings * 100) / 100,
        taxRate: taxRate * 100, // percentage
      },
      dailyBreakdown: dailyBreakdownArray.map((day) => ({
        date: day.date,
        earnings: Math.round(day.earnings * 100) / 100,
        rides: day.rides,
        hoursWorked: Math.round(day.hoursWorked * 100) / 100,
        tips: Math.round(day.tips * 100) / 100,
        bonuses: Math.round(day.bonuses * 100) / 100,
      })),
      chartData,
      generatedAt: new Date().toISOString(),
    };

    sendSuccess(res, response, "Earnings report generated successfully", 200);
  } catch (error) {
    console.error("Get earnings report error:", error);
    sendError(res, "Failed to generate earnings report", 500);
  }
};

// Generate PDF earnings report
exports.downloadEarningsReport = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { period = "month", startDate, endDate } = req.query;

    // Get earnings data (reuse the logic from getEarningsReport)
    const earningsData = await getEarningsData(
      driverId,
      period,
      startDate,
      endDate
    );

    // Generate PDF content (simplified - in production use pdfkit or puppeteer)
    const pdfContent = generateEarningsPDF(earningsData);

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=earnings-report-${period}-${
        new Date().toISOString().split("T")[0]
      }.pdf`
    );

    // For now, return JSON (in production, return actual PDF buffer)
    // const pdfBuffer = await generatePDF(pdfContent);
    // res.send(pdfBuffer);

    sendSuccess(
      res,
      {
        message: "PDF report generated successfully",
        downloadUrl: `/api/v1/drivers/earnings/download?period=${period}`,
        reportData: earningsData,
      },
      "PDF report generated successfully",
      200
    );
  } catch (error) {
    console.error("Download earnings report error:", error);
    sendError(res, "Failed to generate PDF report", 500);
  }
};

// Helper function to get earnings data
async function getEarningsData(driverId, period, startDate, endDate) {
  // Calculate date range (same logic as getEarningsReport)
  let start, end;
  const now = new Date();

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else {
    switch (period) {
      case "day":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(start);
        end.setDate(start.getDate() + 1);
        break;
      case "week":
        start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        end = new Date(start);
        end.setDate(start.getDate() + 7);
        break;
      case "month":
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
    }
  }

  const rides = await Ride.find({
    driver: driverId,
    status: "completed",
    endTime: { $gte: start, $lt: end },
  }).sort({ endTime: -1 });

  const totalRides = rides.length;
  const totalEarnings = rides.reduce(
    (sum, ride) => sum + (ride.driverEarnings || 0),
    0
  );
  const totalTips = rides.reduce((sum, ride) => sum + (ride.tips || 0), 0);
  const totalBonuses = rides.reduce(
    (sum, ride) => sum + (ride.bonuses || 0),
    0
  );

  return {
    period: {
      type: period,
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    },
    summary: {
      totalRides,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
    },
    breakdown: {
      baseFares:
        Math.round((totalEarnings - totalTips - totalBonuses) * 100) / 100,
      tips: Math.round(totalTips * 100) / 100,
      bonuses: Math.round(totalBonuses * 100) / 100,
    },
  };
}

// Helper function to generate PDF content (simplified)
function generateEarningsPDF(data) {
  return {
    title: `Earnings Report - ${data.period.type}`,
    period: `${data.period.startDate} to ${data.period.endDate}`,
    summary: data.summary,
    breakdown: data.breakdown,
    generatedAt: new Date().toISOString(),
  };
}

// Helper function to get nearby ride requests
async function getNearbyRideRequests(driverLat, driverLon) {
  try {
    // Get pending ride requests within last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const pendingRides = await Ride.find({
      status: "searching",
      createdAt: { $gte: twoMinutesAgo },
    }).populate({
      path: "rider",
      select: "fullName rating photo",
    });

    const rideRequests = [];

    for (const ride of pendingRides) {
      // Calculate distance from driver to pickup location
      const distance = calculateDistance(
        driverLat,
        driverLon,
        ride.pickup.latitude,
        ride.pickup.longitude
      );

      // Only include rides within 5km
      if (distance <= 5) {
        // Calculate ETA to pickup (assuming average speed of 25 km/h in city)
        const etaToPickup = calculateETA(distance, 25); // 25 km/h average city speed

        // Calculate expiry time (15 seconds from now)
        const expiresAt = new Date(Date.now() + 15 * 1000);
        const timeLeft = 15; // seconds

        // Get rider information
        const rider = ride.rider;
        const riderInfo = rider
          ? {
              name: rider.fullName || "Unknown Rider",
              rating: rider.rating || 5.0,
              photo: rider.photo ? `/api/v1/riders/${rider._id}/photo` : null,
            }
          : null;

        rideRequests.push({
          rideId: ride._id,
          rider: riderInfo,
          pickupLocation: {
            latitude: ride.pickup.latitude,
            longitude: ride.pickup.longitude,
            address: ride.pickup.address,
          },
          dropoffLocation: {
            latitude: ride.dropoff.latitude,
            longitude: ride.dropoff.longitude,
            address: ride.dropoff.address,
          },
          distance: Math.round(distance * 10) / 10,
          estimatedTimeToPickup: etaToPickup,
          estimatedFare: ride.estimatedFare || 0,
          vehicleType: ride.vehicleType,
          expiresAt: expiresAt.toISOString(),
          timeLeft: timeLeft,
          createdAt: ride.createdAt,
        });
      }
    }

    // Sort by distance and limit to 10 requests
    return rideRequests.sort((a, b) => a.distance - b.distance).slice(0, 10);
  } catch (error) {
    console.error("Error getting nearby ride requests:", error);
    return [];
  }
}

// Update driver location (real-time during active rides)
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, heading, speed, timestamp } = req.body;
    const driverId = req.user.id;

    // Validate required fields
    if (!latitude || !longitude) {
      return sendError(res, "Latitude and longitude are required", 400);
    }

    // Validate coordinate ranges
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return sendError(res, "Invalid latitude or longitude coordinates", 400);
    }

    // Validate Surrey boundary (warn but don't reject for now - testing purposes)
    const inSurrey = isInSurrey(latitude, longitude);
    if (!inSurrey) {
      console.log("DEBUG [updateLocation]: WARNING - Location is outside Surrey boundary:", {
        latitude,
        longitude,
        driverId: req.user.id
      });
      // For testing: Allow location updates outside Surrey but log warning
      // In production, uncomment the following:
      // return sendError(res, "Location must be within Surrey boundary", 400);
    }

    // Optional validations
    if (heading !== undefined && (heading < 0 || heading > 360)) {
      return sendError(res, "Heading must be between 0 and 360 degrees", 400);
    }

    if (speed !== undefined && speed < 0) {
      return sendError(res, "Speed cannot be negative", 400);
    }

    // Rate limiting: prevent updates more frequent than every 1 second
    const now = Date.now();
    const lastUpdate = req.user.lastLocationUpdate || 0;
    const timeSinceLastUpdate = now - lastUpdate;

    if (timeSinceLastUpdate < 1000) {
      // 1 second minimum
      return sendError(res, "Location updates too frequent", 429);
    }

    // Get driver profile
    console.log("Looking for driver with user ID:", driverId);
    const driver = await Driver.findOne({ user: driverId });
    console.log("Driver found:", driver ? driver._id : "NOT FOUND");

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Verify driver status is online as per BACKEND_CHANGES_REQUIRED.md
    // MODIFIED FOR TESTING: Allow location updates in any status during testing phase
    // For production, uncomment the strict check below:
    // if (driver.status !== "online") {
    //   return sendError(res, "Driver must be online to update location. Current status: " + driver.status, 400);
    // }
    
    // For testing: Log warning but allow update
    if (driver.status !== "online") {
      console.log("DEBUG [updateLocation]: WARNING - Driver is not online but location update allowed for testing. Current status:", driver.status);
    }

    // Check if driver has an active ride (optional - for validation)
    const activeRide = await Ride.findOne({
      driver: driver._id,
      status: { $in: ["accepted", "arrived", "in_progress"] },
    });

    // Update or create live location
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    const locationData = {
      driver: driver._id,
      latitude: lat,
      longitude: lng,
      heading: heading ? parseFloat(heading) : 0,
      speed: speed ? parseFloat(speed) : 0,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      location: {
        type: "Point",
        coordinates: [lng, lat] // GeoJSON format: [longitude, latitude]
      }
    };

    console.log("DEBUG [updateLocation]: Creating/updating location with data:", locationData);
    console.log("DEBUG [updateLocation]: Driver details:", {
      driverId: driver._id,
      status: driver.status,
      isApproved: driver.isApproved,
      vehicleType: driver.vehicleType,
      activeStatus: driver.activeStatus
    });

    // Upsert location (update if exists, create if not)
    const locationResult = await LiveLocation.findOneAndUpdate(
      { driver: driver._id },
      locationData,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: false
      }
    );

    console.log("DEBUG [updateLocation]: Location saved successfully:", {
      locationId: locationResult._id,
      driverId: locationResult.driver,
      timestamp: locationResult.timestamp,
      lat: locationResult.latitude,
      lng: locationResult.longitude
    });

    // Update user's last location update timestamp
    const userUpdateResult = await User.findByIdAndUpdate(driverId, {
      lastLocationUpdate: now,
    });

    console.log("User update result:", userUpdateResult);

    // Real-time WebSocket notifications for location updates
    const socketService = require("../services/socketService");

    // Notify nearby riders about driver location update
    await socketService.notifyNearbyRidersAboutDriverUpdate(
      driver._id.toString(),
      {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        heading: heading ? parseFloat(heading) : 0,
        speed: speed ? parseFloat(speed) : 0,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      }
    );

    // Notify subscribers of active rides about location updates
    await socketService.notifyRideSubscribersAboutDriverLocation(
      driver._id.toString(),
      {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        heading: heading ? parseFloat(heading) : 0,
        speed: speed ? parseFloat(speed) : 0,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      }
    );

    // Response format as per BACKEND_CHANGES_REQUIRED.md specification
    sendSuccess(
      res,
      {
        location: {
          _id: locationResult._id,
          driver: driver._id,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          heading: locationData.heading,
          speed: locationData.speed,
          timestamp: locationResult.timestamp.toISOString(),
        },
      },
      "Location updated successfully",
      200
    );
  } catch (error) {
    console.error("Update location error:", error);
    console.error("Error stack:", error.stack);
    sendError(res, `Failed to update location: ${error.message}`, 500);
  }
};

// Deactivate driver account
exports.deactivateAccount = async (req, res) => {
  try {
    const { driverId, password, reason } = req.body;

    // Validate required fields
    if (!driverId || !password || !reason) {
      return sendError(res, "driverId, password, and reason are required", 400);
    }

    // Find driver
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if it's the driver's own account
    if (driver.user.toString() !== req.user.id) {
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
    if (driver.activeStatus === "deactive") {
      return sendError(res, "Account is already deactivated", 400);
    }

    // Update activeStatus to "deactive"
    driver.activeStatus = "deactive";
    await driver.save();

    // Create ActiveStatusHistory
    const ActiveStatusHistory = require("../models/ActiveStatusHistory");
    await ActiveStatusHistory.create({
      userId: req.user.id,
      userType: "driver",
      driverId: driver._id,
      action: "deactivate",
      performedBy: driver._id,
      reason: reason,
      timestamp: new Date(),
    });

    // Notify via WebSocket (optional)
    const socketService = require("../services/socketService");
    socketService.notifyDriverStatusUpdate(
      driver._id.toString(),
      "deactivated"
    );

    sendSuccess(res, null, "Account deactivated successfully", 200);
  } catch (error) {
    console.error("Deactivate account error:", error);
    sendError(res, "Failed to deactivate account", 500);
  }
};

// Activate driver account
exports.activateAccount = async (req, res) => {
  try {
    const { driverId, password, reason } = req.body;

    // Validate required fields
    if (!driverId || !password) {
      return sendError(res, "driverId and password are required", 400);
    }

    // Find driver
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if it's the driver's own account
    if (driver.user.toString() !== req.user.id) {
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
    if (driver.activeStatus === "active") {
      return sendError(res, "Account is already activated", 400);
    }

    // Update activeStatus to "active"
    driver.activeStatus = "active";
    await driver.save();

    // Create ActiveStatusHistory
    const ActiveStatusHistory = require("../models/ActiveStatusHistory");
    await ActiveStatusHistory.create({
      userId: req.user.id,
      userType: "driver",
      driverId: driver._id,
      action: "activate",
      performedBy: driver._id,
      reason: reason || "Self-activation",
      timestamp: new Date(),
    });

    // Notify via WebSocket (optional)
    const socketService = require("../services/socketService");
    socketService.notifyDriverStatusUpdate(driver._id.toString(), "activated");

    sendSuccess(res, null, "Account activated successfully", 200);
  } catch (error) {
    console.error("Activate account error:", error);
    sendError(res, "Failed to activate account", 500);
  }
};

// Get driver's past rides with pagination and filtering
exports.getRideHistory = async (req, res) => {
  try {
    const driverId = req.user.id;
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
    const query = { driver: driverId };

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
        path: "rider",
        populate: [
          {
            path: "user",
            select: "fullName",
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Format rides data
    const formattedRides = rides.map((ride) => {
      const rider = ride.rider;

      return {
        rideId: ride._id,
        dateTime: ride.createdAt,
        pickupAddress: ride.pickup?.address || "N/A",
        dropoffAddress: ride.dropoff?.address || "N/A",
        rider: rider
          ? {
              name: rider.user?.fullName || "Unknown Rider",
              rating: rider.rating || 5.0,
            }
          : null,
        fare: ride.fare || 0,
        driverEarnings: ride.driverEarnings || 0,
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
    const socketService = require("../services/socketService");
    socketService.subscribeToRideHistoryUpdates(driverId);

    sendSuccess(res, response, "Ride history retrieved successfully", 200);
  } catch (error) {
    console.error("Get ride history error:", error);
    sendError(res, "Failed to retrieve ride history", 500);
  }
};

// Get driver stats
exports.getStats = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Get driver profile
    const driver = await Driver.findOne({ user: driverId });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Calculate date ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    // Get statistics
    const [todayStats, weekStats, monthStats, totalStats] = await Promise.all([
      // Today's stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: today, $lt: tomorrow },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$driverEarnings" },
            rides: { $sum: 1 },
          },
        },
      ]),

      // This week's stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: weekStart, $lt: weekEnd },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$driverEarnings" },
            rides: { $sum: 1 },
          },
        },
      ]),

      // This month's stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: monthStart, $lte: monthEnd },
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$driverEarnings" },
            rides: { $sum: 1 },
          },
        },
      ]),

      // Total stats
      Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$driverEarnings" },
            totalRides: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Extract stats
    const todayEarnings = todayStats[0]?.earnings || 0;
    const todayRides = todayStats[0]?.rides || 0;
    const weekEarnings = weekStats[0]?.earnings || 0;
    const weekRides = weekStats[0]?.rides || 0;
    const monthEarnings = monthStats[0]?.earnings || 0;
    const monthRides = monthStats[0]?.rides || 0;
    const totalEarnings = totalStats[0]?.totalEarnings || 0;
    const totalRides = totalStats[0]?.totalRides || 0;

    // Calculate average rating (simplified - would need to get from ride ratings)
    const averageRating = driver.rating || 5.0;

    // Calculate acceptance rate (simplified - would need to track accepted vs rejected)
    const acceptanceRate = 95; // Placeholder

    // Calculate online hours (simplified - would need to track status history)
    const onlineHoursToday = 8; // Placeholder

    const stats = {
      overview: {
        totalRides: totalRides,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        averageRating: averageRating,
        acceptanceRate: acceptanceRate,
        status: driver.status,
      },
      today: {
        rides: todayRides,
        earnings: Math.round(todayEarnings * 100) / 100,
        onlineHours: onlineHoursToday,
      },
      week: {
        rides: weekRides,
        earnings: Math.round(weekEarnings * 100) / 100,
      },
      month: {
        rides: monthRides,
        earnings: Math.round(monthEarnings * 100) / 100,
      },
      currency: "GBP",
      lastUpdated: new Date(),
    };

    sendSuccess(res, stats, "Driver stats retrieved successfully", 200);
  } catch (error) {
    console.error("Get stats error:", error);
    sendError(res, "Failed to retrieve stats", 500);
  }
};

// Helper function to get hot zones
async function getHotZones() {
  try {
    // For now, return some predefined hot zones in Surrey
    // In a real implementation, this would be calculated based on ride demand
    return [
      {
        id: "zone1",
        name: "Guildford Center",
        center: { latitude: 51.2362, longitude: -0.5704 },
        radius: 2000, // 2km radius
        demandLevel: "high",
        waitingRiders: 5,
        averageWaitTime: 8,
      },
      {
        id: "zone2",
        name: "Woking Station",
        center: { latitude: 51.3188, longitude: -0.5569 },
        radius: 1500, // 1.5km radius
        demandLevel: "medium",
        waitingRiders: 3,
        averageWaitTime: 12,
      },
      {
        id: "zone3",
        name: "Surrey University",
        center: { latitude: 51.2438, longitude: -0.5906 },
        radius: 1000, // 1km radius
        demandLevel: "low",
        waitingRiders: 1,
        averageWaitTime: 15,
      },
    ];
  } catch (error) {
    console.error("Error getting hot zones:", error);
    return [];
  }
}

// Re-upload rejected document
exports.reUploadDocument = async (req, res) => {
  try {
    const { documentType } = req.params;
    const driverId = req.user.id;

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

    // Check if file was uploaded
    if (!req.file) {
      return sendError(res, "No document file uploaded", 400);
    }

    // Get driver profile
    const driver = await Driver.findOne({ user: driverId });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Initialize documents object if it doesn't exist
    if (!driver.documents) {
      driver.documents = {};
    }

    if (!driver.documents[documentType]) {
      driver.documents[documentType] = {};
    }

    const document = driver.documents[documentType];
    const currentStatus = document.status || 'not_uploaded';

    // Validate status transition
    const transitionValidation = validateStatusTransition(currentStatus, 'reupload', document);
    if (!transitionValidation.valid) {
      return sendError(res, transitionValidation.message, 400);
    }

    // If there's an existing document, save it to previous versions
    if (document.url) {
      if (!document.previousVersions) {
        document.previousVersions = [];
      }
      document.previousVersions.push({
        url: document.url,
        uploadedAt: document.uploadedAt,
        rejectedAt: document.rejectedAt,
        rejectionReason: document.rejectionReason,
      });
    }

    // Update document with new file
    document.url = req.file.path;
    document.uploadedAt = new Date();
    document.lastUploadedAt = new Date();
    document.currentVersion = (document.currentVersion || 0) + 1;
    document.status = 'pending_verification';
    document.rejected = false;
    document.rejectionReason = undefined;
    document.rejectedAt = undefined;
    document.rejectedBy = undefined;
    document.verified = false;
    document.verifiedAt = undefined;
    document.verifiedBy = undefined;

    await driver.save();

    // Send real-time notification to admins about re-upload
    const socketService = require("../services/socketService");
    const user = await User.findById(driverId);

    socketService.notifyUser("admin", "document_reuploaded", {
      driverId: driver._id,
      driverName: user?.fullName || "Unknown",
      documentType: documentType,
      version: document.currentVersion,
      message: `Driver ${user?.fullName || "Unknown"} has re-uploaded ${documentType}`,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      {
        driver,
        documentType: documentType,
        url: document.url,
        version: document.currentVersion,
        status: document.status,
      },
      "Document re-uploaded successfully and pending verification",
      200
    );
  } catch (err) {
    console.error("Re-upload document error:", err);
    sendError(res, "Failed to re-upload document", 500);
  }
};
