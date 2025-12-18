const Ride = require("../models/Ride");
const Wallet = require("../models/Wallet");
const Payment = require("../models/Payment");
const Rider = require("../models/Rider");
const Driver = require("../models/Driver");
const LiveLocation = require("../models/LiveLocation");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const path = require("path");
const fs = require("fs");

// Surrey boundary coordinates (approximate polygon for Surrey, UK)
const SURREY_BOUNDARY = {
  type: "Polygon",
  coordinates: [
    [
      [-0.8, 51.1], // Southwest corner
      [-0.8, 51.6], // Northwest corner
      [-0.1, 51.6], // Northeast corner
      [-0.1, 51.1], // Southeast corner
      [-0.8, 51.1], // Close the polygon
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
    };

    sendSuccess(res, response, "Ride history retrieved successfully", 200);
  } catch (error) {
    console.error("Get ride history error:", error);
    sendError(res, "Failed to retrieve ride history", 500);
  }
};

// Top-up wallet
exports.topUpWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return sendError(res, "Invalid amount", 400);
    }

    const wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) {
      return sendError(res, "Wallet not found", 404);
    }

    wallet.balance += amount;
    await wallet.save();

    // Optional: create a Payment record for wallet top-up
    const payment = await Payment.create({
      rider: req.user.id,
      amount,
      status: "paid",
      paymentMethod: "wallet",
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
    const { status } = req.body; // online/offline
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

// Upload rider photo
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
    rider.photo = {
      url: `/uploads/riders/${req.file.filename}`,
      filename: req.file.filename,
      uploadedAt: new Date(),
      mimetype: req.file.mimetype,
      size: req.file.size,
    };

    await rider.save();

    sendSuccess(
      res,
      {
        photo: rider.photo,
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

// Helper function to get nearby available drivers
async function getNearbyDrivers(userLat, userLon) {
  try {
    // Get all recent live locations (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
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
        !location.driver.isApproved
      ) {
        continue;
      }

      // Check if driver is within Surrey boundary
      if (!isInSurrey(location.latitude, location.longitude)) {
        continue;
      }

      // Calculate distance
      const distance = calculateDistance(
        userLat,
        userLon,
        location.latitude,
        location.longitude
      );

      // Only include drivers within 12km
      if (distance <= 12) {
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
          distance: Math.round(distance * 10) / 10, // Round to 1 decimal place
          eta: eta,
          speed: location.speed || 0,
          lastUpdated: location.timestamp,
        });
      }
    }

    // Sort by distance (closest first) and limit to 50 drivers
    return driversWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);
  } catch (error) {
    console.error("Error getting nearby drivers:", error);
    return [];
  }
}
