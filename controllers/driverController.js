const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const LiveLocation = require("../models/LiveLocation");
const User = require("../models/User");
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
    if (driver.isApproved) {
      verificationStatus = "verified";
    }

    // For now, we don't have pending/rejected states in the model
    // This can be extended later with additional fields
    const canGoOnline = driver.isApproved;

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
    const { status } = req.body;

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

    sendSuccess(res, { driver }, "Status updated successfully", 200);
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

// Create driver profile
exports.createProfile = async (req, res) => {
  try {
    const {
      licenseNumber,
      vehicle,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
    } = req.body;

    // Check if driver profile already exists
    const existingDriver = await Driver.findOne({ user: req.user.id });
    if (existingDriver) {
      return sendError(res, "Driver profile already exists", 409);
    }

    // Check if license number is unique
    const existingLicense = await Driver.findOne({ licenseNumber });
    if (existingLicense) {
      return sendError(res, "License number already registered", 409);
    }

    // Check if number plate is unique
    const existingPlate = await Driver.findOne({ numberPlateOfVehicle });
    if (existingPlate) {
      return sendError(res, "Number plate already registered", 409);
    }

    const driver = await Driver.create({
      user: req.user.id,
      licenseNumber,
      vehicle,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
    });

    sendSuccess(res, { driver }, "Driver profile created successfully", 201);
  } catch (error) {
    console.error("Create profile error:", error);
    sendError(res, "Failed to create driver profile", 500);
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
      populate: {
        path: "user",
        select: "fullName",
      },
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
              name: rider.user?.fullName || "Unknown Rider",
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

    // Validate Surrey boundary
    if (!isInSurrey(latitude, longitude)) {
      return sendError(res, "Location must be within Surrey boundary", 400);
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

    // Check if driver has an active ride (optional - for validation)
    const activeRide = await Ride.findOne({
      driver: driver._id,
      status: { $in: ["accepted", "arrived", "in_progress"] },
    });

    // Update or create live location
    const locationData = {
      driver: driver._id,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      heading: heading ? parseFloat(heading) : 0,
      speed: speed ? parseFloat(speed) : 0,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    };

    console.log("Creating/updating location with data:", locationData);

    // Upsert location (update if exists, create if not)
    const locationResult = await LiveLocation.findOneAndUpdate(
      { driver: driver._id },
      locationData,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    console.log("Location result:", locationResult);

    // Update user's last location update timestamp
    const userUpdateResult = await User.findByIdAndUpdate(driverId, {
      lastLocationUpdate: now,
    });

    console.log("User update result:", userUpdateResult);

    sendSuccess(
      res,
      {
        location: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          heading: locationData.heading,
          speed: locationData.speed,
          timestamp: locationData.timestamp,
        },
        hasActiveRide: !!activeRide,
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
