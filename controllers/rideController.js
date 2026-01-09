const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const Payment = require("../models/Payment");
const Wallet = require("../models/Wallet");
const FareEstimate = require("../models/FareEstimate");
const LiveLocation = require("../models/LiveLocation");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const rideRequestManager = require("../utils/rideRequestManager");
const socketService = require("../services/socketService");
const notificationService = require("../services/notificationService");
const driverPayoutController = require("../controllers/driverPayoutController");
const crypto = require("crypto");

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

// Fare calculation configuration
const FARE_CONFIG = {
  baseFare: {
    sedan: 3.0,
    SUV: 4.0,
    electric: 3.5,
  },
  perMileRate: {
    sedan: 1.5,
    SUV: 2.0,
    electric: 1.75,
  },
  perMinuteRate: {
    sedan: 0.25,
    SUV: 0.35,
    electric: 0.3,
  },
  taxRate: 0.2, // 20% VAT
  minimumFare: {
    sedan: 8.0,
    SUV: 10.0,
    electric: 9.0,
  },
};

// Calculate surge multiplier based on demand (simplified)
function calculateSurgeMultiplier(
  hour,
  dayOfWeek,
  availableDrivers,
  requestedDrivers = 1
) {
  let multiplier = 1.0;

  // Peak hours: 7-9 AM and 5-7 PM on weekdays
  const isPeakHour =
    dayOfWeek >= 1 &&
    dayOfWeek <= 5 &&
    ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19));

  if (isPeakHour) {
    multiplier *= 1.3; // 30% surge during peak hours
  }

  // High demand: fewer drivers than requests
  if (availableDrivers < requestedDrivers * 2) {
    multiplier *= 1.2; // Additional 20% surge
  }

  return Math.round(multiplier * 10) / 10; // Round to 1 decimal place
}

// Calculate fare breakdown
function calculateFare(
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  vehicleType,
  durationMinutes = 15
) {
  const distanceKm = calculateDistance(
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng
  );
  const distanceMiles = distanceKm * 0.621371; // Convert to miles

  const config = FARE_CONFIG;

  // Base calculations
  const baseFare = config.baseFare[vehicleType];
  const distanceFare = distanceMiles * config.perMileRate[vehicleType];
  const timeFare = durationMinutes * config.perMinuteRate[vehicleType];

  // Calculate current time for surge pricing
  const now = new Date();
  const surgeMultiplier = calculateSurgeMultiplier(
    now.getHours(),
    now.getDay(),
    10, // Assume 10 drivers available for now
    1
  );

  // Apply surge multiplier
  const subtotal = (baseFare + distanceFare + timeFare) * surgeMultiplier;
  const tax = subtotal * config.taxRate;
  const total = subtotal + tax;

  // Apply minimum fare
  const finalTotal = Math.max(total, config.minimumFare[vehicleType]);

  return {
    distance: {
      miles: Math.round(distanceMiles * 10) / 10,
      kilometers: Math.round(distanceKm * 10) / 10,
    },
    duration: {
      minutes: durationMinutes,
      formatted: `${durationMinutes} min`,
    },
    fareBreakdown: {
      baseFare: Math.round(baseFare * 100) / 100,
      distanceFare: Math.round(distanceFare * 100) / 100,
      timeFare: Math.round(timeFare * 100) / 100,
      surgeMultiplier,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(finalTotal * 100) / 100,
    },
    currency: "GBP",
  };
}

// Generate unique estimate ID
function generateEstimateId() {
  return "est_" + crypto.randomBytes(8).toString("hex");
}

// Get fare estimate
exports.getFareEstimate = async (req, res) => {
  try {
    // Debug logging
    console.log("Request body:", req.body);
    console.log("Request headers:", req.headers);

    // Check if req.body exists and is an object
    if (!req.body || typeof req.body !== "object") {
      console.error("Invalid request body:", req.body);
      return sendError(res, "Invalid request body format", 400);
    }

    const {
      pickupLat,
      pickupLng,
      pickupAddress,
      dropoffLat,
      dropoffLng,
      dropoffAddress,
      vehicleType,
    } = req.body;

    // Convert string values to appropriate types (for form-data)
    const pickupLatNum = parseFloat(pickupLat);
    const pickupLngNum = parseFloat(pickupLng);
    const dropoffLatNum = parseFloat(dropoffLat);
    const dropoffLngNum = parseFloat(dropoffLng);

    // Validate required fields
    if (
      !pickupLat ||
      !pickupLng ||
      !pickupAddress ||
      !dropoffLat ||
      !dropoffLng ||
      !dropoffAddress ||
      !vehicleType ||
      isNaN(pickupLatNum) ||
      isNaN(pickupLngNum) ||
      isNaN(dropoffLatNum) ||
      isNaN(dropoffLngNum)
    ) {
      return sendError(
        res,
        "All location and vehicle type fields are required, and coordinates must be valid numbers",
        400
      );
    }

    // Validate vehicle type
    if (!["sedan", "SUV", "electric"].includes(vehicleType)) {
      return sendError(
        res,
        "Invalid vehicle type. Must be sedan, SUV, or electric",
        400
      );
    }

    // Calculate fare
    const fareCalculation = calculateFare(
      pickupLatNum,
      pickupLngNum,
      dropoffLatNum,
      dropoffLngNum,
      vehicleType
    );

    // Count available drivers near pickup location
    const availableDrivers = await countAvailableDrivers(
      pickupLatNum,
      pickupLngNum,
      vehicleType
    );

    // Calculate estimated pickup time (average of closest drivers' ETAs)
    const estimatedPickupTime = await calculateEstimatedPickupTime(
      pickupLatNum,
      pickupLngNum,
      vehicleType
    );

    // Generate estimate ID and save to database
    const estimateId = generateEstimateId();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const fareEstimate = await FareEstimate.create({
      estimateId,
      rider: req.user.id,
      pickup: {
        lat: pickupLat,
        lng: pickupLng,
        address: pickupAddress,
      },
      dropoff: {
        lat: dropoffLat,
        lng: dropoffLng,
        address: dropoffAddress,
      },
      vehicleType,
      distance: fareCalculation.distance,
      duration: fareCalculation.duration,
      fareBreakdown: fareCalculation.fareBreakdown,
      currency: fareCalculation.currency,
      driverAvailability: {
        count: availableDrivers,
        estimatedPickupTime,
      },
      expiresAt,
    });

    const response = {
      estimateId,
      pickup: {
        lat: pickupLatNum,
        lng: pickupLngNum,
        address: pickupAddress,
      },
      dropoff: {
        lat: dropoffLatNum,
        lng: dropoffLngNum,
        address: dropoffAddress,
      },
      vehicleType,
      ...fareCalculation,
      // Add top-level fare field for easy frontend access
      fare: fareCalculation.fareBreakdown.total,
      estimatedFare: fareCalculation.fareBreakdown.total,
      driverAvailability: {
        count: availableDrivers,
        estimatedPickupTime,
        message:
          availableDrivers > 0
            ? `${availableDrivers} driver${
                availableDrivers > 1 ? "s" : ""
              } available`
            : "No drivers available right now",
      },
      expiresAt,
      validFor: "10 minutes",
    };

    sendSuccess(res, response, "Fare estimate calculated successfully", 200);
  } catch (error) {
    console.error("Fare estimate error:", error);
    sendError(res, "Failed to calculate fare estimate", 500);
  }
};

// Enhanced book ride with estimate validation and driver assignment
exports.bookRide = async (req, res) => {
  try {
    // Debug logging
    console.log("\n=== BOOK RIDE REQUEST DEBUG ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Request query:", JSON.stringify(req.query, null, 2));
    console.log("Request params:", JSON.stringify(req.params, null, 2));
    console.log("Content-Type:", req.headers['content-type']);
    console.log("Body keys:", Object.keys(req.body || {}));
    console.log("Body type:", typeof req.body);
    console.log("Is body empty?", Object.keys(req.body || {}).length === 0);
    console.log("================================\n");

    // Check if req.body exists and is an object
    if (!req.body || typeof req.body !== "object") {
      console.error("❌ ERROR: Invalid request body:", req.body);
      return sendError(res, "Invalid request body format", 400);
    }
    
    console.log("✅ Request body is valid object");

    // Handle form-data fields (convert strings to appropriate types)
    // Check both req.body and req.query as frontend might send differently
    const estimateId = req.body.estimateId || req.query.estimateId;
    const paymentMethod = req.body.paymentMethod || req.query.paymentMethod || "wallet";
    const scheduledTime = req.body.scheduledTime || req.query.scheduledTime; // Optional: for future bookings
    const specialInstructions = req.body.specialInstructions || req.query.specialInstructions; // Optional

    // Extract location data from request (may be sent along with or without estimateId)
    // Check both req.body and req.query, and support both flat and nested structures
    // Frontend might send: {pickupLat, pickupLng} OR {pickup: {lat, lng, latitude, longitude}}
    const pickupLat = req.body.pickupLat || req.query.pickupLat || 
                      req.body.pickup?.lat || req.body.pickup?.latitude;
    const pickupLng = req.body.pickupLng || req.query.pickupLng || 
                      req.body.pickup?.lng || req.body.pickup?.longitude;
    const pickupAddress = req.body.pickupAddress || req.query.pickupAddress || 
                         req.body.pickup?.address;
    const dropoffLat = req.body.dropoffLat || req.query.dropoffLat || 
                       req.body.dropoff?.lat || req.body.dropoff?.latitude ||
                       req.body.destination?.lat || req.body.destination?.latitude;
    const dropoffLng = req.body.dropoffLng || req.query.dropoffLng || 
                       req.body.dropoff?.lng || req.body.dropoff?.longitude ||
                       req.body.destination?.lng || req.body.destination?.longitude;
    const dropoffAddress = req.body.dropoffAddress || req.query.dropoffAddress || 
                          req.body.dropoff?.address ||
                          req.body.destination?.address;
    const vehicleType = req.body.vehicleType || req.query.vehicleType;

    console.log("Extracted values:", {
      estimateId,
      paymentMethod,
      pickupLat,
      pickupLng,
      pickupAddress,
      dropoffLat,
      dropoffLng,
      dropoffAddress,
      vehicleType,
    });
    
    console.log("Raw pickup object:", req.body.pickup);
    console.log("Raw dropoff object:", req.body.dropoff);
    console.log("Raw destination object:", req.body.destination);
    console.log("All body keys:", Object.keys(req.body));

    // Validate estimate ID if provided
    let fareEstimate = null;
    if (estimateId) {
      fareEstimate = await FareEstimate.findOne({
        estimateId,
        rider: req.user.id,
        isUsed: false,
        expiresAt: { $gt: new Date() },
      });

      if (!fareEstimate) {
        console.log(`⚠️ Fare estimate not found for estimateId: ${estimateId}`);
        // If estimate not found but location data is provided, we'll create one on the fly
        // Don't return error yet - check if location data is available
      } else {
        console.log(`✅ Found valid fare estimate: ${estimateId}`);
      }
    }

    // For immediate bookings without valid estimate, create one on the fly from location data
    if (!scheduledTime && !fareEstimate) {
      console.log("⚠️ No valid fare estimate, checking for location data...");
      
      if (
        !pickupLat ||
        !pickupLng ||
        !pickupAddress ||
        !dropoffLat ||
        !dropoffLng ||
        !dropoffAddress ||
        !vehicleType
      ) {
        console.log("❌ ERROR: Missing location data:", {
          pickupLat: pickupLat || "MISSING",
          pickupLng: pickupLng || "MISSING",
          pickupAddress: pickupAddress || "MISSING",
          dropoffLat: dropoffLat || "MISSING",
          dropoffLng: dropoffLng || "MISSING",
          dropoffAddress: dropoffAddress || "MISSING",
          vehicleType: vehicleType || "MISSING",
        });
        console.log("❌ RETURNING 400 ERROR - This is where the error is coming from!");
        return sendError(
          res,
          "Either estimateId or complete location details (pickup, dropoff, vehicleType) are required for immediate bookings",
          400
        );
      }
      
      console.log("✅ All location data present, proceeding with on-the-fly calculation");

      // Convert to numbers
      const pickupLatNum = parseFloat(pickupLat);
      const pickupLngNum = parseFloat(pickupLng);
      const dropoffLatNum = parseFloat(dropoffLat);
      const dropoffLngNum = parseFloat(dropoffLng);

      // Validate coordinates
      if (
        isNaN(pickupLatNum) ||
        isNaN(pickupLngNum) ||
        isNaN(dropoffLatNum) ||
        isNaN(dropoffLngNum)
      ) {
        return sendError(res, "Invalid coordinates provided", 400);
      }

      // Calculate fare on the fly
      const fareCalculation = calculateFare(
        pickupLatNum,
        pickupLngNum,
        dropoffLatNum,
        dropoffLngNum,
        vehicleType
      );

      // Create temporary fare estimate object (not saved to DB for immediate use)
      fareEstimate = {
        pickup: {
          lat: pickupLat,
          lng: pickupLng,
          address: pickupAddress,
        },
        dropoff: {
          lat: dropoffLat,
          lng: dropoffLng,
          address: dropoffAddress,
        },
        vehicleType,
        distance: fareCalculation.distance,
        duration: fareCalculation.duration,
        fareBreakdown: fareCalculation.fareBreakdown,
        currency: fareCalculation.currency,
      };

      console.log("Created on-the-fly fare estimate for immediate booking:", fareEstimate);
    }

    // Validate scheduled time if provided
    let scheduledDate = null;
    if (scheduledTime) {
      scheduledDate = new Date(scheduledTime);
      const now = new Date();
      const maxFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      if (scheduledDate <= now) {
        return sendError(res, "Scheduled time must be in the future", 400);
      }

      if (scheduledDate > maxFuture) {
        return sendError(
          res,
          "Cannot schedule rides more than 7 days in advance",
          400
        );
      }
    }

    // Create ride
    const rideData = {
      rider: req.user.id,
      driver: null,
      status: scheduledTime ? "scheduled" : "searching",
      scheduledTime: scheduledDate,
      specialInstructions,
      paymentMethod,
    };

    // Use estimate data if available
    if (fareEstimate) {
      rideData.pickup = fareEstimate.pickup;
      rideData.dropoff = fareEstimate.dropoff;
      rideData.vehicleType = fareEstimate.vehicleType;
      rideData.estimatedFare = fareEstimate.fareBreakdown.total;
      rideData.estimatedDistance = fareEstimate.distance.miles;
      rideData.estimatedDuration = fareEstimate.duration.minutes;

      // Mark estimate as used (only if it's a database document)
      if (fareEstimate.save) {
        fareEstimate.isUsed = true;
        await fareEstimate.save();
      }
    }

    const ride = await Ride.create(rideData);

    // Notify admins about new ride booking
    await socketService.notifyAdminRideUpdate(ride);

    // Notify rider about scheduled ride confirmation
    if (scheduledTime) {
      socketService.notifyRideStatus(req.user.id, "scheduled", ride);
    }

    // For immediate bookings, try to assign a driver
    let assignedDriver = null;
    let estimatedPickupTime = null;
    let availableDrivers = [];

    if (!scheduledTime && fareEstimate) {
      const assignmentResult = await assignDriverToRide(ride._id, fareEstimate);
      assignedDriver = assignmentResult.driver;
      estimatedPickupTime = assignmentResult.estimatedPickupTime;
      availableDrivers = assignmentResult.availableDrivers || [];

      if (assignedDriver) {
        ride.driver = assignedDriver._id;
        ride.status = "assigned";
        ride.estimatedPickupTime = estimatedPickupTime;
        await ride.save();

        // Notify rider about driver assignment
        socketService.notifyDriverAssigned(req.user.id, assignedDriver, ride);

        // Notify assigned driver about the ride
        socketService.notifyRideStatus(
          assignedDriver._id.toString(),
          "assigned",
          ride
        );
      } else if (availableDrivers.length > 0) {
        // Start ride request timer for available drivers
        rideRequestManager.startRideRequest(
          ride._id,
          availableDrivers.map((d) => d.driver._id)
        );

        // Send ride request notifications to all available drivers
        // First, populate the ride with rider information for complete notification data
        await ride.populate('rider', 'fullName phone profilePicture');
        
        availableDrivers.forEach((driverInfo) => {
          // Pass the complete ride object with rider info
          socketService.notifyRideRequest(
            driverInfo.driver._id.toString(),
            {
              ...ride.toObject(),
              riderName: ride.rider?.fullName || 'Unknown Rider',
              distance: driverInfo.distance,
              eta: driverInfo.eta
            }
          );

          // Send real-time dashboard update for nearby ride requests
          socketService.notifyNearbyRideRequests(
            driverInfo.driver._id.toString(),
            [
              {
                rideId: ride._id,
                pickupLocation: ride.pickup,
                dropoffLocation: ride.dropoff,
                estimatedFare: ride.estimatedFare,
                vehicleType: ride.vehicleType,
                distance: driverInfo.distance,
                estimatedTimeToPickup: driverInfo.eta,
                expiresAt: new Date(Date.now() + 15 * 1000),
                timeLeft: 15,
                createdAt: ride.createdAt,
              },
            ]
          );
        });

        // Notify rider that we're searching for drivers
        socketService.notifyRideStatus(req.user.id, "searching", ride);
      } else {
        // No drivers available - notify rider
        socketService.notifyRideStatus(req.user.id, "no_drivers", {
          ...ride.toObject(),
          message: "No drivers available right now. Please try again later.",
        });
      }
    }

    const response = {
      rideId: ride._id,
      status: ride.status,
      estimatedPickupTime,
      driverAssigned: !!assignedDriver,
      scheduledTime: ride.scheduledTime,
      message: scheduledTime
        ? `Ride scheduled for ${scheduledDate.toLocaleString()}`
        : assignedDriver
        ? `Driver assigned! Estimated pickup in ${estimatedPickupTime} minutes`
        : "Searching for available driver...",
    };

    // Include fare details if estimate was used
    if (fareEstimate) {
      response.fareEstimate = {
        total: fareEstimate.fareBreakdown.total,
        currency: fareEstimate.currency,
        breakdown: fareEstimate.fareBreakdown,
      };
    }

    sendSuccess(res, response, "Ride booked successfully", 201);
  } catch (error) {
    console.error("Book ride error:", error);
    sendError(res, "Failed to book ride", 500);
  }
};

// Helper function to count available drivers
async function countAvailableDrivers(pickupLat, pickupLng, vehicleType) {
  try {
    console.log(
      "DEBUG: Counting available drivers for pickup:",
      pickupLat,
      pickupLng,
      "vehicleType:",
      vehicleType
    );
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    console.log("DEBUG: Looking for locations since:", fiveMinutesAgo.toISOString());

    // First, check total LiveLocation records in DB
    const totalLocations = await LiveLocation.countDocuments();
    console.log("DEBUG: Total LiveLocation records in database:", totalLocations);

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
    }).populate("driver");

    console.log("DEBUG: Found", recentLocations.length, "recent locations (within last 5 min)");
    
    // Log details of each recent location for debugging
    if (recentLocations.length > 0) {
      recentLocations.forEach((loc, idx) => {
        console.log(`DEBUG: Location ${idx + 1}:`, {
          driverId: loc.driver?._id,
          driverStatus: loc.driver?.status,
          driverIsApproved: loc.driver?.isApproved,
          driverVehicleType: loc.driver?.vehicleType,
          locationTimestamp: loc.timestamp,
          lat: loc.latitude,
          lng: loc.longitude
        });
      });
    } else {
      // If no recent locations, check what locations exist
      const latestLocation = await LiveLocation.findOne().sort({ timestamp: -1 }).populate("driver");
      if (latestLocation) {
        console.log("DEBUG: Most recent location in DB:", {
          driverId: latestLocation.driver?._id,
          timestamp: latestLocation.timestamp,
          age: Math.round((Date.now() - latestLocation.timestamp) / 1000 / 60) + " minutes ago"
        });
      } else {
        console.log("DEBUG: No LiveLocation records exist in database at all");
      }
    }
    let availableCount = 0;
    let filteredOut = {
      noDriver: 0,
      notOnline: 0,
      notApproved: 0,
      vehicleTypeMismatch: 0,
      outsideBoundary: 0,
      tooFar: 0,
    };

    for (const location of recentLocations) {
      // Check driver availability
      if (!location.driver) {
        filteredOut.noDriver++;
        continue;
      }
      if (location.driver.status !== "online") {
        filteredOut.notOnline++;
        continue;
      }
      if (location.driver.isApproved !== "approved") {
        filteredOut.notApproved++;
        continue;
      }

      // Check vehicle type match
      if (
        !location.driver.vehicleType ||
        location.driver.vehicleType !== vehicleType
      ) {
        filteredOut.vehicleTypeMismatch =
          (filteredOut.vehicleTypeMismatch || 0) + 1;
        continue;
      }

      // Check Surrey boundary (disabled for testing)
      const inBoundary = isInSurrey(location.latitude, location.longitude);
      if (!inBoundary) {
        console.log("DEBUG [countAvailableDrivers]: Driver outside Surrey boundary (allowing for testing):", {
          driverId: location.driver._id,
          lat: location.latitude,
          lng: location.longitude
        });
        // For testing: Allow drivers outside boundary
        // In production, uncomment the following:
        // filteredOut.outsideBoundary++;
        // continue;
      }

      // Check distance (within 10km)
      const distance = calculateDistance(
        pickupLat,
        pickupLng,
        location.latitude,
        location.longitude
      );
      if (distance <= 10) {
        availableCount++;
      } else {
        filteredOut.tooFar++;
      }
    }

    console.log(
      "DEBUG: Driver availability - total recent:",
      recentLocations.length,
      "available:",
      availableCount,
      "filtered:",
      filteredOut
    );
    return availableCount;
  } catch (error) {
    console.error("Error counting available drivers:", error);
    return 0;
  }
}

// Helper function to calculate estimated pickup time
async function calculateEstimatedPickupTime(pickupLat, pickupLng, vehicleType) {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
    }).populate("driver");

    const etas = [];

    for (const location of recentLocations) {
      if (
        !location.driver ||
        location.driver.status !== "online" ||
        location.driver.isApproved !== "approved" ||
        !location.driver.vehicleType ||
        location.driver.vehicleType !== vehicleType
      ) {
        continue;
      }

      // Check Surrey boundary (disabled for testing)
      const inBoundary = isInSurrey(location.latitude, location.longitude);
      if (!inBoundary) {
        console.log("DEBUG [calculateEstimatedPickupTime]: Driver outside Surrey (allowing for testing)");
        // For production, uncomment: continue;
      }

      const distance = calculateDistance(
        pickupLat,
        pickupLng,
        location.latitude,
        location.longitude
      );
      if (distance <= 10) {
        const eta = calculateETA(distance, location.speed || 30);
        etas.push(eta);
      }
    }

    if (etas.length === 0) return 15; // Default 15 minutes

    // Return average of closest 3 drivers
    const sortedEtas = etas.sort((a, b) => a - b);
    const closestEtas = sortedEtas.slice(0, 3);
    const averageEta =
      closestEtas.reduce((sum, eta) => sum + eta, 0) / closestEtas.length;

    return Math.round(averageEta);
  } catch (error) {
    console.error("Error calculating pickup time:", error);
    return 15; // Default fallback
  }
}

// Helper function to assign driver to ride
async function assignDriverToRide(rideId, fareEstimate) {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
    }).populate("driver");

    const availableDrivers = [];

    for (const location of recentLocations) {
      if (
        !location.driver ||
        location.driver.status !== "online" ||
        location.driver.isApproved !== "approved" ||
        !location.driver.vehicleType ||
        location.driver.vehicleType !== fareEstimate.vehicleType
      ) {
        continue;
      }

      // Check Surrey boundary (disabled for testing)
      const inBoundary = isInSurrey(location.latitude, location.longitude);
      if (!inBoundary) {
        console.log("DEBUG [getAvailableDriversForRide]: Driver outside Surrey (allowing for testing)");
        // For production, uncomment: continue;
      }

      const distance = calculateDistance(
        fareEstimate.pickup.lat,
        fareEstimate.pickup.lng,
        location.latitude,
        location.longitude
      );

      if (distance <= 10) {
        const eta = calculateETA(distance, location.speed || 30);
        availableDrivers.push({
          driver: location.driver,
          distance,
          eta,
          location,
        });
      }
    }

    // Sort by distance and ETA
    availableDrivers.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.eta - b.eta;
    });

    if (availableDrivers.length === 0) {
      return { driver: null, estimatedPickupTime: null, availableDrivers: [] };
    }

    // For now, return available drivers without auto-assigning
    // The ride request manager will handle the 15-second timer and notifications
    return {
      driver: null, // Don't auto-assign, let drivers accept via the request system
      estimatedPickupTime: null,
      availableDrivers: availableDrivers,
    };
  } catch (error) {
    console.error("Error assigning driver:", error);
    return { driver: null, estimatedPickupTime: null };
  }
}

// Accept ride request
exports.acceptRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const driverId = req.user.id;

    // Use ride request manager to handle acceptance
    const ride = await rideRequestManager.acceptRide(rideId, driverId);

    // Get rider and driver information for response
    await ride.populate([
      {
        path: "rider",
        select: "fullName phone",
      },
      {
        path: "driver",
        select: "vehicle vehicleModel vehicleColor numberPlateOfVehicle rating",
        populate: {
          path: "user",
          select: "fullName phone",
        },
      },
    ]);

    // Enhanced real-time notifications

    // 1. Notify rider about ride acceptance
    socketService.notifyRideStatus(ride.rider._id.toString(), "accepted", ride);

    // 2. Notify driver about successful acceptance and ride details
    socketService.notifyUser(driverId, "ride_accepted_success", {
      rideId: ride._id,
      status: ride.status,
      rider: {
        name: ride.rider.fullName || "Unknown Rider",
        phone: ride.rider.phone || null,
        rating: ride.rider.rating || 5.0,
      },
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      estimatedFare: ride.estimatedFare,
      vehicleType: ride.vehicleType,
      acceptedAt: ride.acceptedAt,
      message: "Ride accepted successfully. Please proceed to pickup location.",
    });

    // 3. Update driver dashboard with new status and ride info
    socketService.notifyDriverDashboardUpdate(
      driverId,
      {
        status: "busy",
        currentRide: {
          rideId: ride._id,
          riderName: ride.rider.fullName || "Unknown Rider",
          pickup: ride.pickup,
          dropoff: ride.dropoff,
          estimatedFare: ride.estimatedFare,
          acceptedAt: ride.acceptedAt,
        },
      },
      "ride_accepted"
    );

    // 4. Update rider dashboard with driver assignment
    socketService.notifyRiderDashboardUpdate(
      ride.rider._id.toString(),
      {
        currentRide: {
          rideId: ride._id,
          status: "accepted",
          driver: {
            id: ride.driver._id,
            name: ride.driver.user?.fullName || "Unknown Driver",
            phone: ride.driver.user?.phone || null,
            rating: ride.driver.rating || 5.0,
            vehicle: ride.driver.vehicle
              ? {
                  make: ride.driver.vehicle.make || "Unknown",
                  model: ride.driver.vehicle.model || "Unknown",
                  color: ride.driver.vehicle.color || "Unknown",
                  plateNumber: ride.driver.vehicle.plateNumber || "Unknown",
                }
              : null,
          },
          pickup: ride.pickup,
          dropoff: ride.dropoff,
          estimatedFare: ride.estimatedFare,
          acceptedAt: ride.acceptedAt,
        },
      },
      "driver_assigned"
    );

    // 5. Send push notification to driver (via socket)
    socketService.notifyUser(driverId, "push_notification", {
      title: "Ride Accepted!",
      message: `You have accepted a ride to ${
        ride.dropoff?.address || "destination"
      }. Please proceed to pickup.`,
      type: "ride_accepted",
      rideId: ride._id,
      timestamp: new Date(),
    });

    // Send email/SMS notification to rider
    try {
      await notificationService.sendRideAcceptedNotification(
        ride.rider,
        ride.driver,
        ride
      );
    } catch (notificationError) {
      console.error(
        "Ride accepted notification failed:",
        notificationError.message
      );
    }

    const response = {
      ride: {
        id: ride._id,
        status: ride.status,
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        estimatedFare: ride.estimatedFare,
        vehicleType: ride.vehicleType,
        acceptedAt: ride.acceptedAt,
      },
      rider: {
        name: ride.rider.fullName || "Unknown Rider",
        phone: ride.rider.phone || null,
        rating: ride.rider.rating || 5.0,
      },
      driver: {
        name: ride.driver.user?.fullName || "Unknown Driver",
        phone: ride.driver.user?.phone || null,
        rating: ride.driver.rating || 5.0,
        vehicle: ride.driver.vehicle
          ? {
              make: ride.driver.vehicle.make || "Unknown",
              model: ride.driver.vehicle.model || "Unknown",
              color: ride.driver.vehicle.color || "Unknown",
              plateNumber: ride.driver.vehicle.plateNumber || "Unknown",
            }
          : null,
      },
      message: "Ride accepted successfully. Please proceed to pickup location.",
    };

    sendSuccess(res, response, "Ride accepted successfully", 200);
  } catch (error) {
    console.error("Accept ride error:", error);
    sendError(res, error.message || "Failed to accept ride", 500);
  }
};

// Reject ride request
exports.rejectRide = async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const driverId = req.user.id;
    const { reason } = req.body;

    // Fetch ride data with rider information for notifications
    const ride = await Ride.findById(rideId).populate({
      path: "rider",
      select: "fullName phone",
    });

    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Use ride request manager to handle rejection
    await rideRequestManager.rejectRide(rideId, driverId);

    // Real-time notifications

    // 1. Notify rider about driver rejection
    socketService.notifyUser(
      ride.rider._id.toString(),
      "ride_driver_rejected",
      {
        rideId: ride._id,
        message:
          "A driver has rejected your ride request. We're finding another driver for you.",
        reason: reason || "Driver unavailable",
        timestamp: new Date(),
      }
    );

    // 2. Update rider dashboard with rejection status
    socketService.notifyRiderDashboardUpdate(
      ride.rider._id.toString(),
      {
        rideStatus: "searching",
        message: "Driver rejected - searching for another driver",
      },
      "ride_update"
    );

    // 3. Notify admin about ride rejection
    await socketService.notifyAdminRideUpdate(ride);

    // 4. Update rejecting driver's dashboard (remove rejected ride from active requests)
    socketService.notifyDriverDashboardUpdate(
      driverId,
      {
        rejectedRideId: rideId,
        message: "Ride request rejected successfully",
      },
      "ride_rejected"
    );

    sendSuccess(res, null, "Ride request rejected", 200);
  } catch (error) {
    console.error("Reject ride error:", error);
    sendError(res, error.message || "Failed to reject ride", 500);
  }
};

// Start ride
exports.startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId).populate("driver");
    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if driver is authorized
    if (!ride.driver || ride.driver.user.toString() !== req.user.id) {
      return sendError(res, "You are not authorized to start this ride", 403);
    }

    // Check if ride can be started
    if (!["assigned", "accepted"].includes(ride.status)) {
      return sendError(res, "Ride cannot be started in current status", 400);
    }

    ride.status = "in_progress";
    ride.startTime = new Date();
    ride.actualPickupTime = new Date();
    await ride.save();

    // Send notification to rider about ride start
    socketService.notifyRideStatus(ride.rider.toString(), "in_progress", ride);
    
    // Send dedicated ride_started notification to rider
    socketService.notifyRideStarted(ride.rider.toString(), ride);
    
    await socketService.notifyAdminRideUpdate(ride);

    // Trigger immediate active ride update for real-time tracking
    socketService.sendActiveRideUpdate(ride._id.toString());

    sendSuccess(res, { ride }, "Ride started successfully", 200);
  } catch (error) {
    console.error("Start ride error:", error);
    sendError(res, "Failed to start ride", 500);
  }
};

// Complete ride
exports.completeRide = async (req, res) => {
  try {
    console.log("Complete ride req.body:", req.body);
    console.log("Complete ride req.headers:", req.headers);

    const { actualDistance, actualDuration } = req.body || {};

    let ride = await Ride.findById(req.params.rideId).populate({
      path: "driver",
      populate: { path: "user", select: "fullName" },
    });

    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if driver is authorized
    if (
      !ride.driver ||
      !ride.driver.user ||
      ride.driver.user._id.toString() !== req.user.id
    ) {
      return sendError(
        res,
        "You are not authorized to complete this ride",
        403
      );
    }

    // Check if ride can be completed
    if (ride.status !== "in_progress") {
      return sendError(res, "Ride cannot be completed in current status", 400);
    }

    // Calculate final fare
    let finalFare = ride.estimatedFare || 0;

    // Adjust fare based on actual distance/duration if provided
    if (actualDistance && actualDuration) {
      const fareCalculation = calculateFare(
        ride.pickup.lat,
        ride.pickup.lng,
        ride.dropoff.lat,
        ride.dropoff.lng,
        ride.vehicleType,
        actualDuration
      );
      finalFare = fareCalculation.fareBreakdown.total;

      ride.actualDistance = actualDistance;
      ride.actualDuration = actualDuration;
    }

    // Calculate earnings breakdown
    const platformCommission = finalFare * 0.2; // 20% platform fee
    const driverEarnings = finalFare * 0.8; // 80% driver earnings

    // Add bonuses (for now, fixed bonus for completed rides)
    const bonuses = 0.5; // £0.50 bonus for completing ride

    // Tips would be added by rider after ride completion (separate API)
    const tips = 0; // Will be updated via separate API

    ride.status = "completed";
    ride.endTime = new Date();
    ride.fare = finalFare;
    ride.platformCommission = platformCommission;
    ride.driverEarnings = driverEarnings + bonuses; // Include bonuses in driver earnings
    ride.bonuses = bonuses;
    ride.tips = tips;
    await ride.save();

    let paymentStatus = "pending";

    // Notify admins about ride completion
    await socketService.notifyAdminRideUpdate(ride);

    // Process payment based on method
    if (ride.paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ user: ride.rider });
      if (wallet && wallet.balance >= finalFare) {
        wallet.balance -= finalFare;
        const rideTransaction = {
          type: "ride",
          amount: finalFare,
          payment: null, // Will be updated after payment creation
          ride: ride._id,
          description: "Ride payment",
        };
        wallet.transactions.push(rideTransaction);
        await wallet.save();
        paymentStatus = "paid";

        // Emit real-time wallet spending notification
        socketService.notifyWalletSpending(ride.rider.toString(), {
          amount: finalFare,
          type: "ride_payment",
          rideId: ride._id,
          description: "Ride payment",
          newBalance: wallet.balance,
        });

        // Check for low balance alert
        if (wallet.balance < 10) {
          // Alert when balance drops below £10
          socketService.notifyLowWalletBalance(ride.rider.toString(), {
            balance: wallet.balance,
            threshold: 10,
            message: `Your wallet balance is low: £${wallet.balance.toFixed(
              2
            )}`,
          });
        }

        // Emit real-time wallet update
        socketService.notifyWalletUpdate(ride.rider.toString(), {
          _id: wallet._id,
          balance: wallet.balance,
          currency: wallet.currency,
          transactions: wallet.transactions,
          updatedAt: wallet.updatedAt,
        });
      } else {
        paymentStatus = "failed";
      }
    } else if (ride.paymentMethod === "card") {
      // For card payments via Stripe
      // Note: Payment should have been created during ride booking with payment intent
      // Here we just verify the payment was successful
      const existingPayment = await Payment.findOne({
        ride: ride._id,
        paymentMethod: "card",
        status: "paid",
      });

      if (existingPayment) {
        paymentStatus = "paid";
      } else {
        // If no existing payment, mark as pending
        // This should be handled by frontend before ride completion
        paymentStatus = "pending";
        console.warn(
          `Ride ${ride._id} completed with card payment but no paid payment record found`
        );
      }
    } else if (ride.paymentMethod === "cash") {
      // Cash payments are marked as paid upon ride completion
      paymentStatus = "paid";
    }

    // Create Payment record (or update existing for card payments)
    let payment = await Payment.findOne({
      ride: ride._id,
    });

    if (payment) {
      // Update existing payment record
      payment.amount = finalFare;
      payment.status = paymentStatus;
      payment.driver = ride.driver._id;
      await payment.save();
    } else {
      // Create new payment record
      payment = await Payment.create({
        ride: ride._id,
        rider: ride.rider,
        driver: ride.driver._id,
        amount: finalFare,
        status: paymentStatus,
        paymentMethod: ride.paymentMethod,
        description: `Payment for ride ${ride._id}`,
      });
    }

    // Update the wallet transaction with payment._id if payment was successful
    if (paymentStatus === "paid") {
      const wallet = await Wallet.findOne({ user: ride.rider });
      if (wallet && wallet.transactions.length > 0) {
        wallet.transactions[wallet.transactions.length - 1].payment =
          payment._id;
        await wallet.save();
      }
    }

    // Enhanced real-time notifications for ride completion

    // 1. Notify rider about ride completion with detailed breakdown
    socketService.notifyUser(ride.rider.toString(), "ride_completed", {
      rideId: ride._id,
      status: "completed",
      finalFare: finalFare,
      paymentStatus: paymentStatus,
      paymentMethod: ride.paymentMethod,
      completedAt: ride.endTime,
      distance: ride.actualDistance || ride.estimatedDistance,
      duration: ride.actualDuration || ride.estimatedDuration,
      message: "Your ride has been completed successfully!",
      receipt: {
        fare: finalFare,
        platformCommission: platformCommission,
        driverEarnings: driverEarnings,
        bonuses: ride.bonuses,
        tips: ride.tips,
        currency: "GBP",
      },
    });

    // 2. Notify rider about payment processing
    if (paymentStatus === "paid") {
      socketService.notifyUser(ride.rider.toString(), "payment_processed", {
        rideId: ride._id,
        amount: finalFare,
        method: ride.paymentMethod,
        status: "completed",
        timestamp: new Date(),
        message: `Payment of £${finalFare.toFixed(2)} processed successfully`,
      });
    }

    // 3. Notify driver about successful ride completion
    socketService.notifyUser(
      ride.driver._id.toString(),
      "ride_completed_success",
      {
        rideId: ride._id,
        status: "completed",
        earnings: {
          baseEarnings: driverEarnings,
          bonuses: ride.bonuses,
          tips: ride.tips,
          totalEarnings: driverEarnings + ride.bonuses + ride.tips,
          currency: "GBP",
        },
        rideDetails: {
          distance: ride.actualDistance || ride.estimatedDistance,
          duration: ride.actualDuration || ride.estimatedDuration,
          pickup: ride.pickup,
          dropoff: ride.dropoff,
          completedAt: ride.endTime,
        },
        message:
          "Ride completed successfully! Earnings have been added to your account.",
        nextStatus: "available", // Driver becomes available for new rides
      }
    );

    // 4. Update driver dashboard with completion status and earnings
    socketService.notifyDriverDashboardUpdate(
      ride.driver._id.toString(),
      {
        status: "available", // Driver is now available
        lastRide: {
          rideId: ride._id,
          earnings: driverEarnings + ride.bonuses + ride.tips,
          completedAt: ride.endTime,
          rating: null, // Will be updated when rider rates
        },
        totalEarnings: {
          today: driverEarnings + ride.bonuses + ride.tips,
          currency: "GBP",
        },
      },
      "ride_completed"
    );

    // 5. Send real-time earnings update notification to driver
    socketService.notifyDriverEarningsUpdate(ride.driver._id.toString(), {
      rideId: ride._id,
      earnings: {
        baseEarnings: driverEarnings,
        bonuses: ride.bonuses,
        tips: ride.tips,
        totalEarnings: driverEarnings + ride.bonuses + ride.tips,
        currency: "GBP",
      },
      period: "today",
      timestamp: new Date(),
      message: `Ride completed! You earned £${(
        driverEarnings +
        ride.bonuses +
        ride.tips
      ).toFixed(2)}`,
    });

    // Process driver earnings for Stripe Connect payouts
    await driverPayoutController.processRideEarnings(ride.driver._id, ride);

    // 5. Update rider dashboard with completed ride
    socketService.notifyRiderDashboardUpdate(
      ride.rider.toString(),
      {
        lastRide: {
          rideId: ride._id,
          status: "completed",
          fare: finalFare,
          completedAt: ride.endTime,
          paymentStatus: paymentStatus,
        },
        stats: {
          totalRides: 1, // This would be calculated properly in production
          totalSpent: finalFare,
          currency: "GBP",
        },
      },
      "ride_completed"
    );

    // 6. Notify rider about ride history update (new ride added to history)
    socketService.notifyRideHistoryUpdate(ride.rider.toString(), {
      action: "ride_completed",
      newRide: {
        rideId: ride._id,
        dateTime: ride.endTime,
        pickupAddress: ride.pickup?.address || "N/A",
        dropoffAddress: ride.dropoff?.address || "N/A",
        driver: ride.driver
          ? {
              name: ride.driver.user?.fullName || "Unknown Driver",
              rating: ride.driver.rating || 5.0,
            }
          : null,
        vehicle: ride.driver?.vehicle
          ? {
              make: ride.driver.vehicle.make || "Unknown",
              model: ride.driver.vehicle.model || "Unknown",
              color: ride.driver.vehicle.color || "Unknown",
              plateNumber: ride.driver.vehicle.plateNumber || "Unknown",
            }
          : null,
        fare: finalFare,
        distance: ride.actualDistance || ride.estimatedDistance || 0,
        duration: ride.actualDuration || ride.estimatedDuration || 0,
        status: "completed",
        paymentStatus: paymentStatus,
      },
      message: "A new ride has been added to your history",
    });

    // 6. Notify admins about ride completion with detailed stats
    socketService.notifyUser("admin", "admin_ride_completed", {
      rideId: ride._id,
      riderId: ride.rider,
      driverId: ride.driver._id,
      status: "completed",
      finalFare: finalFare,
      driverEarnings: driverEarnings,
      platformCommission: platformCommission,
      paymentStatus: paymentStatus,
      completedAt: ride.endTime,
      distance: ride.actualDistance || ride.estimatedDistance,
      duration: ride.actualDuration || ride.estimatedDuration,
      vehicleType: ride.vehicleType,
      message: `Ride ${ride._id} completed successfully`,
    });

    // 7. Stop real-time active ride updates since ride is completed
    socketService.stopActiveRideUpdates(ride._id.toString());

    // Send email notification to rider
    try {
      await notificationService.sendRideCompletedNotification(ride.rider, ride);
    } catch (notificationError) {
      console.error(
        "Ride completed notification failed:",
        notificationError.message
      );
    }

    const response = {
      ride: {
        id: ride._id,
        status: ride.status,
        fare: finalFare,
        distance: ride.actualDistance || ride.estimatedDistance,
        duration: ride.actualDuration || ride.estimatedDuration,
        startTime: ride.startTime,
        endTime: ride.endTime,
      },
      payment: {
        amount: finalFare,
        status: paymentStatus,
        method: ride.paymentMethod,
      },
    };

    sendSuccess(res, response, "Ride completed successfully", 200);
  } catch (error) {
    console.error("Complete ride error:", error);
    sendError(res, "Failed to complete ride", 500);
  }
};

// Get ride status (real-time tracking)
exports.getRideStatus = async (req, res) => {
  try {
    const rideId = req.params.rideId;

    const ride = await Ride.findById(rideId)
      .populate({
        path: "rider",
        select: "fullName email phone",
      })
      .populate({
        path: "driver",
        populate: [
          {
            path: "user",
            select: "fullName email phone",
          },
          {
            path: "vehicle",
          },
        ],
      });

    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if user is authorized (rider or assigned driver)
    const isRider = ride.rider._id.toString() === req.user.id;
    const isDriver = ride.driver && ride.driver._id.toString() === req.user.id;

    if (!isRider && !isDriver) {
      return sendError(res, "You are not authorized to view this ride", 403);
    }

    // Get driver's current location if ride is active
    let driverLocation = null;
    if (
      ride.driver &&
      ["assigned", "accepted", "in_progress"].includes(ride.status)
    ) {
      const recentLocation = await LiveLocation.findOne({
        driver: ride.driver._id,
        timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      }).sort({ timestamp: -1 });

      if (recentLocation) {
        driverLocation = {
          lat: recentLocation.latitude,
          lng: recentLocation.longitude,
          heading: recentLocation.heading || 0,
          speed: recentLocation.speed || 0,
          timestamp: recentLocation.timestamp,
        };
      }
    }

    // Calculate current fare for active rides
    let currentFare = ride.fare || ride.estimatedFare || 0;
    let fareBreakdown = null;

    if (ride.status === "in_progress" && ride.startTime) {
      const currentTime = new Date();
      const timeElapsed = (currentTime - ride.startTime) / (1000 * 60); // minutes

      // Calculate real-time fare
      const baseFare = ride.estimatedFare || 0;
      const timeFare =
        timeElapsed * FARE_CONFIG.perMinuteRate[ride.vehicleType];
      const distanceFare =
        (ride.actualDistance || ride.estimatedDistance || 0) *
        FARE_CONFIG.perMileRate[ride.vehicleType];

      // Apply current surge multiplier
      const now = new Date();
      const surgeMultiplier = calculateSurgeMultiplier(
        now.getHours(),
        now.getDay(),
        10, // Assume 10 drivers available
        1
      );

      const subtotal = (baseFare + distanceFare + timeFare) * surgeMultiplier;
      const tax = subtotal * FARE_CONFIG.taxRate;
      currentFare = Math.max(
        subtotal + tax,
        FARE_CONFIG.minimumFare[ride.vehicleType]
      );

      fareBreakdown = {
        baseFare: Math.round(baseFare * 100) / 100,
        distanceFare: Math.round(distanceFare * 100) / 100,
        timeFare: Math.round(timeFare * 100) / 100,
        surgeMultiplier,
        subtotal: Math.round(subtotal * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(currentFare * 100) / 100,
      };
    }

    // Calculate ETAs
    let pickupEta = null;
    let dropoffEta = null;

    if (ride.status === "assigned" && driverLocation && ride.pickup) {
      const distanceToPickup = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        ride.pickup.lat,
        ride.pickup.lng
      );
      pickupEta = calculateETA(distanceToPickup, driverLocation.speed || 30);
    }

    if (ride.status === "in_progress" && driverLocation && ride.dropoff) {
      const distanceToDropoff = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        ride.dropoff.lat,
        ride.dropoff.lng
      );
      dropoffEta = calculateETA(distanceToDropoff, driverLocation.speed || 30);
    }

    // Generate simplified route polyline (straight line for now)
    let routePolyline = null;
    if (ride.pickup && ride.dropoff) {
      // Simple encoded polyline (just start and end points)
      const startPoint = encodePoint(ride.pickup.lat, ride.pickup.lng);
      const endPoint = encodePoint(ride.dropoff.lat, ride.dropoff.lng);
      routePolyline = startPoint + endPoint;
    }

    // Calculate remaining distance
    let remainingDistance = null;
    if (ride.status === "in_progress" && driverLocation && ride.dropoff) {
      remainingDistance = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        ride.dropoff.lat,
        ride.dropoff.lng
      );
    }

    const response = {
      rideId: ride._id,
      status: ride.status,
      createdAt: ride.createdAt,
      scheduledTime: ride.scheduledTime,
      driver: ride.driver
        ? {
            id: ride.driver._id,
            name: ride.driver.user?.fullName || "Unknown Driver",
            phone: ride.driver.user?.phone || null,
            photo: ride.driver.photo
              ? `/api/v1/drivers/${ride.driver._id}/photo`
              : null,
            rating: ride.driver.rating || 5.0,
            currentLocation: driverLocation,
          }
        : null,
      vehicle: ride.driver?.vehicle
        ? {
            make: ride.driver.vehicle.make || "Unknown",
            model: ride.driver.vehicle.model || "Unknown",
            color: ride.driver.vehicle.color || "Unknown",
            plateNumber: ride.driver.vehicle.plateNumber || "Unknown",
            type: ride.vehicleType,
          }
        : null,
      locations: {
        pickup: ride.pickup
          ? {
              ...ride.pickup,
              eta: pickupEta,
            }
          : null,
        dropoff: ride.dropoff
          ? {
              ...ride.dropoff,
              eta: dropoffEta,
            }
          : null,
      },
      route: {
        polyline: routePolyline,
        distance: {
          total: ride.actualDistance || ride.estimatedDistance || 0,
          remaining: remainingDistance,
        },
      },
      fare: {
        current: Math.round(currentFare * 100) / 100,
        currency: "GBP",
        breakdown: fareBreakdown,
      },
      timing: {
        estimatedPickupTime: ride.estimatedPickupTime,
        actualPickupTime: ride.actualPickupTime,
        startTime: ride.startTime,
        endTime: ride.endTime,
      },
      specialInstructions: ride.specialInstructions,
      // Add WebSocket subscription info for real-time updates
      realTimeUpdates: {
        subscribed: true,
        updateInterval: 10000, // 10 seconds
        events: [
          "location_update",
          "status_change",
          "fare_update",
          "eta_update",
        ],
      },
    };

    // Subscribe to real-time updates for active rides
    if (["assigned", "accepted", "in_progress"].includes(ride.status)) {
      socketService.subscribeToRideStatusUpdates(req.user.id, ride._id);

      // Send initial real-time update notification
      socketService.notifyUser(req.user.id, "ride_status_initial", {
        rideId: ride._id,
        message: "Real-time updates enabled for this ride",
        updateInterval: 10000,
      });
    }

    sendSuccess(res, response, "Ride status retrieved successfully", 200);
  } catch (error) {
    console.error("Get ride status error:", error);
    sendError(res, "Failed to retrieve ride status", 500);
  }
};

// Get active ride for rider
exports.getActiveRide = async (req, res) => {
  try {
    const riderId = req.user.id;

    // Find active ride for this rider
    const activeRide = await Ride.findOne({
      rider: riderId,
      status: { $in: ["searching", "assigned", "accepted", "in_progress"] },
    })
      .populate({
        path: "driver",
        populate: [
          {
            path: "user",
            select: "fullName phone",
          },
          {
            path: "vehicle",
          },
        ],
      })
      .sort({ createdAt: -1 }); // Get most recent if multiple

    if (!activeRide) {
      // Unsubscribe from any previous active ride updates
      socketService.unsubscribeFromActiveRide(riderId);
      return sendSuccess(res, null, "No active ride found", 200);
    }

    // Subscribe to real-time updates for this active ride
    socketService.subscribeToActiveRide(riderId, activeRide._id);

    // Get driver's current location if ride is active
    let driverLocation = null;
    if (
      activeRide.driver &&
      ["assigned", "accepted", "in_progress"].includes(activeRide.status)
    ) {
      const recentLocation = await LiveLocation.findOne({
        driver: activeRide.driver._id,
        timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      }).sort({ timestamp: -1 });

      if (recentLocation) {
        driverLocation = {
          lat: recentLocation.latitude,
          lng: recentLocation.longitude,
          heading: recentLocation.heading || 0,
          speed: recentLocation.speed || 0,
          timestamp: recentLocation.timestamp,
        };
      }
    }

    // Calculate ETAs
    let pickupEta = null;
    let dropoffEta = null;

    if (
      activeRide.status === "assigned" &&
      driverLocation &&
      activeRide.pickup
    ) {
      const distanceToPickup = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        activeRide.pickup.lat,
        activeRide.pickup.lng
      );
      pickupEta = calculateETA(distanceToPickup, driverLocation.speed || 30);
    }

    if (
      activeRide.status === "in_progress" &&
      driverLocation &&
      activeRide.dropoff
    ) {
      const distanceToDropoff = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        activeRide.dropoff.lat,
        activeRide.dropoff.lng
      );
      dropoffEta = calculateETA(distanceToDropoff, driverLocation.speed || 30);
    }

    const response = {
      rideId: activeRide._id,
      status: activeRide.status,
      createdAt: activeRide.createdAt,
      scheduledTime: activeRide.scheduledTime,
      driver: activeRide.driver
        ? {
            id: activeRide.driver._id,
            name: activeRide.driver.user?.fullName || "Unknown Driver",
            phone: activeRide.driver.user?.phone || null,
            photo: activeRide.driver.photo
              ? `/api/v1/drivers/${activeRide.driver._id}/photo`
              : null,
            rating: activeRide.driver.rating || 5.0,
            vehicle: activeRide.driver.vehicle
              ? {
                  make: activeRide.driver.vehicle.make || "Unknown",
                  model: activeRide.driver.vehicle.model || "Unknown",
                  color: activeRide.driver.vehicle.color || "Unknown",
                  plateNumber:
                    activeRide.driver.vehicle.plateNumber || "Unknown",
                  type: activeRide.vehicleType,
                }
              : null,
          }
        : null,
      locations: {
        pickup: activeRide.pickup
          ? {
              ...activeRide.pickup,
              eta: pickupEta,
            }
          : null,
        dropoff: activeRide.dropoff
          ? {
              ...activeRide.dropoff,
              eta: dropoffEta,
            }
          : null,
      },
      fare: {
        estimated: activeRide.estimatedFare || 0,
        actual: activeRide.fare || 0,
        currency: "GBP",
      },
      timing: {
        estimatedPickupTime: activeRide.estimatedPickupTime,
        actualPickupTime: activeRide.actualPickupTime,
        startTime: activeRide.startTime,
        endTime: activeRide.endTime,
      },
      specialInstructions: activeRide.specialInstructions,
      paymentMethod: activeRide.paymentMethod,
    };

    sendSuccess(res, response, "Active ride retrieved successfully", 200);
  } catch (error) {
    console.error("Get active ride error:", error);
    sendError(res, "Failed to retrieve active ride", 500);
  }
};

// Enhanced cancel ride with fee calculation
exports.cancelRide = async (req, res) => {
  try {
    const { cancellationReason } = req.body;
    const cancelledAt = new Date();

    const ride = await Ride.findById(req.params.rideId);
    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if user is authorized (rider or assigned driver)
    const isRider = ride.rider.toString() === req.user.id;
    const isDriver = ride.driver && ride.driver.toString() === req.user.id;

    if (!isRider && !isDriver) {
      return sendError(res, "You are not authorized to cancel this ride", 403);
    }

    // Check if ride can be cancelled
    if (["completed", "cancelled"].includes(ride.status)) {
      return sendError(res, "Ride cannot be cancelled in current status", 400);
    }

    // Calculate cancellation fee
    const cancellationFee = calculateCancellationFee(ride, cancelledAt);

    // Calculate refund amount
    let refundAmount = 0;
    if (ride.paymentMethod === "wallet" && ride.fare > 0) {
      refundAmount = Math.max(0, ride.fare - cancellationFee);
    }

    // Process refund if applicable
    if (refundAmount > 0) {
      const wallet = await Wallet.findOne({ user: ride.rider });
      if (wallet) {
        wallet.balance += refundAmount;
        const refundTransaction = {
          type: "refund",
          amount: refundAmount,
          ride: ride._id,
          description: "Ride cancellation refund",
        };
        wallet.transactions.push(refundTransaction);
        await wallet.save();

        // Emit real-time wallet transaction notification
        socketService.notifyWalletTransaction(ride.rider.toString(), {
          ...refundTransaction,
          _id: wallet.transactions[wallet.transactions.length - 1]._id,
          timestamp: new Date(),
        });

        // Emit real-time wallet update
        socketService.notifyWalletUpdate(ride.rider.toString(), {
          _id: wallet._id,
          balance: wallet.balance,
          currency: wallet.currency,
          transactions: wallet.transactions,
          updatedAt: wallet.updatedAt,
        });
      }
    }

    ride.status = "cancelled";
    ride.cancellationReason = cancellationReason;
    ride.cancellationFee = cancellationFee;
    ride.refundAmount = refundAmount;
    await ride.save();

    // Stop real-time active ride updates since ride is cancelled
    socketService.stopActiveRideUpdates(ride._id.toString());

    // Send notification to both rider and driver (if assigned) about cancellation
    socketService.notifyRideCancelled(
      ride.rider.toString(),
      cancellationReason,
      ride
    );
    if (ride.driver) {
      socketService.notifyRideCancelled(
        ride.driver.toString(),
        cancellationReason,
        ride
      );

      // Update driver dashboard with cancelled ride status
      socketService.notifyDriverDashboardUpdate(
        ride.driver.toString(),
        {
          cancelledRideId: ride._id,
          status: "available", // Driver becomes available again
          message: "Ride cancelled - you are now available for new rides",
        },
        "ride_cancelled"
      );
    }

    // Notify admins about ride cancellation
    await socketService.notifyAdminRideUpdate(ride);

    // Notify rider about cancelled ride added to history
    socketService.notifyRideHistoryUpdate(ride.rider.toString(), {
      action: "ride_cancelled",
      cancelledRide: {
        rideId: ride._id,
        dateTime: ride.createdAt,
        pickupAddress: ride.pickup?.address || "N/A",
        dropoffAddress: ride.dropoff?.address || "N/A",
        status: "cancelled",
        cancellationReason,
        cancellationFee,
        refundAmount,
        cancelledAt,
      },
      message: "A ride has been cancelled and added to your history",
    });

    const response = {
      ride: {
        id: ride._id,
        status: ride.status,
        cancellationReason,
        cancelledAt,
      },
      fees: {
        cancellationFee,
        refundAmount,
        currency: "GBP",
      },
      message:
        cancellationFee > 0
          ? `Ride cancelled. Cancellation fee: £${cancellationFee.toFixed(2)}`
          : "Ride cancelled successfully (no fees)",
    };

    sendSuccess(res, response, "Ride cancelled successfully", 200);
  } catch (error) {
    console.error("Cancel ride error:", error);
    sendError(res, "Failed to cancel ride", 500);
  }
};

// Helper function to calculate cancellation fee
function calculateCancellationFee(ride, cancelledAt) {
  const bookingTime = ride.createdAt;
  const timeSinceBooking = (cancelledAt - bookingTime) / (1000 * 60); // minutes

  // Free cancellation within 2 minutes
  if (timeSinceBooking <= 2) {
    return 0;
  }

  // £5 fee if driver was already assigned/accepted
  if (["assigned", "accepted"].includes(ride.status)) {
    return 5.0;
  }

  // £2 fee for other cases after 2 minutes
  return 2.0;
}

// Add tip to completed ride
exports.addTip = async (req, res) => {
  try {
    const { tipAmount } = req.body;
    const rideId = req.params.rideId;
    const riderId = req.user.id;

    // Validate tip amount
    if (!tipAmount || tipAmount <= 0) {
      return sendError(res, "Tip amount must be greater than 0", 400);
    }

    if (tipAmount > 50) {
      return sendError(res, "Tip amount cannot exceed £50", 400);
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if user is the rider
    if (ride.rider.toString() !== riderId) {
      return sendError(res, "You can only add tips to your own rides", 403);
    }

    // Check if ride is completed
    if (ride.status !== "completed") {
      return sendError(res, "Tips can only be added to completed rides", 400);
    }

    // Check if tip already added
    if (ride.tips > 0) {
      return sendError(res, "Tip has already been added to this ride", 400);
    }

    // Check wallet balance
    const wallet = await Wallet.findOne({ user: riderId });
    if (!wallet || wallet.balance < tipAmount) {
      return sendError(res, "Insufficient wallet balance for tip", 400);
    }

    // Deduct from wallet
    wallet.balance -= tipAmount;
    const tipTransaction = {
      type: "tip",
      amount: tipAmount,
      ride: rideId,
      description: `Tip for ride ${rideId}`,
    };
    wallet.transactions.push(tipTransaction);
    await wallet.save();

    // Emit real-time transaction notification
    socketService.notifyWalletTransaction(riderId, {
      ...tipTransaction,
      _id: wallet.transactions[wallet.transactions.length - 1]._id,
      timestamp: new Date(),
    });

    // Emit real-time wallet spending notification
    socketService.notifyWalletSpending(riderId, {
      amount: tipAmount,
      type: "tip",
      rideId: rideId,
      description: `Tip for ride ${rideId}`,
      newBalance: wallet.balance,
    });

    // Check for low balance alert
    if (wallet.balance < 10) {
      // Alert when balance drops below £10
      socketService.notifyLowWalletBalance(riderId, {
        balance: wallet.balance,
        threshold: 10,
        message: `Your wallet balance is low: £${wallet.balance.toFixed(2)}`,
      });
    }

    // Emit real-time wallet update
    socketService.notifyWalletUpdate(riderId, {
      _id: wallet._id,
      balance: wallet.balance,
      currency: wallet.currency,
      transactions: wallet.transactions,
      updatedAt: wallet.updatedAt,
    });

    // Update ride with tip
    ride.tips = tipAmount;
    ride.driverEarnings += tipAmount; // Add tip to driver earnings
    await ride.save();

    // Send notification to driver
    socketService.notifyUser(ride.driver.toString(), "tip_received", {
      rideId: ride._id,
      tipAmount,
      riderName: req.user.fullName,
      message: `You received a £${tipAmount} tip from ${req.user.fullName}!`,
    });

    // Enhanced real-time notifications for tip

    // 1. Update driver dashboard with new earnings
    socketService.notifyDriverDashboardUpdate(
      ride.driver.toString(),
      {
        earnings: {
          tipReceived: tipAmount,
          totalEarnings: ride.driverEarnings,
          currency: "GBP",
        },
        lastTip: {
          amount: tipAmount,
          riderName: req.user.fullName,
          rideId: ride._id,
          timestamp: new Date(),
        },
      },
      "tip_received"
    );

    // 2. Send real-time earnings update notification to driver for tip
    socketService.notifyDriverEarningsUpdate(ride.driver.toString(), {
      rideId: ride._id,
      earnings: {
        tipReceived: tipAmount,
        totalEarnings: ride.driverEarnings,
        currency: "GBP",
      },
      period: "today",
      timestamp: new Date(),
      message: `Tip received! £${tipAmount.toFixed(2)} added to your earnings`,
    });

    // 2. Update rider dashboard with tip transaction
    socketService.notifyRiderDashboardUpdate(
      riderId,
      {
        recentTransaction: {
          type: "tip",
          amount: tipAmount,
          description: `Tip for ride ${ride._id}`,
          timestamp: new Date(),
        },
        walletBalance: wallet.balance,
        currency: "GBP",
      },
      "tip_transaction"
    );

    // 3. Send push notification to driver
    socketService.notifyUser(ride.driver.toString(), "push_notification", {
      title: "Tip Received! 💰",
      message: `You received a £${tipAmount} tip from ${req.user.fullName}`,
      type: "tip_received",
      rideId: ride._id,
      amount: tipAmount,
      timestamp: new Date(),
    });

    // 4. Notify admins about tip activity
    socketService.notifyUser("admin", "admin_tip_received", {
      rideId: ride._id,
      riderId: riderId,
      driverId: ride.driver._id,
      tipAmount,
      riderName: req.user.fullName,
      driverName: ride.driver.user?.fullName || "Unknown Driver",
      timestamp: new Date(),
      message: `Tip of £${tipAmount} added to ride ${ride._id}`,
    });

    sendSuccess(
      res,
      {
        rideId: ride._id,
        tipAmount,
        driverEarnings: ride.driverEarnings,
        walletBalance: wallet.balance,
      },
      "Tip added successfully",
      200
    );
  } catch (error) {
    console.error("Add tip error:", error);
    sendError(res, "Failed to add tip", 500);
  }
};

// Rate driver after ride completion
exports.rateDriver = async (req, res) => {
  try {
    // Accept rating from either body or query parameters for flexibility
    const { rating, comment } = req.body;

    const rideId = req.params.rideId;
    const riderId = req.user.id;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return sendError(res, "Rating must be between 1 and 5", 400);
    }

    const ride = await Ride.findById(rideId).populate("driver");
    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if user is the rider
    if (ride.rider.toString() !== riderId) {
      return sendError(
        res,
        "You can only rate rides you were the rider for",
        403
      );
    }

    // Check if ride is completed
    if (ride.status !== "completed") {
      return sendError(res, "You can only rate completed rides", 400);
    }

    // Check if rating already exists
    if (ride.rating && ride.rating.riderRating) {
      return sendError(res, "You have already rated this ride", 400);
    }

    // Update ride rating
    ride.rating = {
      ...ride.rating,
      riderRating: rating,
      riderComment: comment || null,
    };
    await ride.save();

    // Update driver average rating
    await updateDriverRating(ride.driver._id);

    // Get updated driver rating for notifications
    const Driver = require("../models/Driver");
    const updatedDriver = await Driver.findById(ride.driver._id);

    // Send notification to driver
    socketService.notifyUser(ride.driver._id.toString(), "rider_rating", {
      rideId: ride._id,
      rating,
      comment,
      riderName: req.user.fullName,
      message: `${req.user.fullName} rated your service ${rating} star${
        rating > 1 ? "s" : ""
      }`,
    });

    // 1. Driver Dashboard Updates: Notify driver with updated rating statistics
    socketService.notifyDriverDashboardUpdate(
      ride.driver._id.toString(),
      {
        rating: {
          newRating: rating,
          comment: comment || null,
          riderName: req.user.fullName,
          rideId: ride._id,
          updatedAverageRating: updatedDriver.rating,
        },
        stats: {
          totalRides: await Ride.countDocuments({
            driver: ride.driver._id,
            status: "completed",
          }),
          averageRating: updatedDriver.rating,
        },
      },
      "rating_received"
    );

    // 2. Admin Notifications: Alert admins about new ratings for monitoring
    socketService.notifyUser("admin", "admin_rating_received", {
      rideId: ride._id,
      driverId: ride.driver._id,
      riderId: req.user.id,
      rating,
      comment,
      driverName: ride.driver.user?.fullName || "Unknown Driver",
      riderName: req.user.fullName,
      newAverageRating: updatedDriver.rating,
      timestamp: new Date(),
      message: `New rating received: ${rating} stars for driver ${
        ride.driver.user?.fullName || "Unknown Driver"
      }`,
    });

    // 3. Rider Confirmation: Confirm to the rider that the rating was submitted successfully
    socketService.notifyUser(req.user.id, "rating_submitted", {
      rideId: ride._id,
      rating,
      comment,
      driverName: ride.driver.user?.fullName || "Unknown Driver",
      message: `Your ${rating}-star rating has been submitted successfully!`,
      timestamp: new Date(),
    });

    // 4. Real-Time Rating Display: Update driver's profile rating across all connected clients
    // This will notify all clients that have the driver in their nearby drivers list
    socketService.notifyNearbyRidersAboutDriverUpdate(ride.driver._id, {
      driverId: ride.driver._id,
      updatedRating: updatedDriver.rating,
      lastRating: rating,
      totalRatings: await Ride.countDocuments({
        driver: ride.driver._id,
        status: "completed",
        "rating.riderRating": { $exists: true },
      }),
    });

    sendSuccess(
      res,
      {
        rideId: ride._id,
        rating,
        comment,
      },
      "Driver rated successfully",
      200
    );
  } catch (error) {
    console.error("Rate driver error:", error);
    sendError(res, "Failed to rate driver", 500);
  }
};

// Rate rider after ride completion (driver)
exports.rateRider = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const rideId = req.params.rideId;
    const driverId = req.user.id;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return sendError(res, "Rating must be between 1 and 5", 400);
    }

    const ride = await Ride.findById(rideId).populate("rider");
    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    // Check if user is the driver
    if (ride.driver.toString() !== driverId) {
      return sendError(
        res,
        "You can only rate rides you were the driver for",
        403
      );
    }

    // Check if ride is completed
    if (ride.status !== "completed") {
      return sendError(res, "You can only rate completed rides", 400);
    }

    // Check if rating already exists
    if (ride.rating && ride.rating.driverRating) {
      return sendError(res, "You have already rated this ride", 400);
    }

    // Update ride rating
    ride.rating = {
      ...ride.rating,
      driverRating: rating,
      driverComment: comment || null,
    };
    await ride.save();

    // Update rider average rating
    await updateRiderRating(ride.rider._id);

    // Send notification to rider
    socketService.notifyUser(ride.rider.toString(), "driver_rating", {
      rideId: ride._id,
      rating,
      comment,
      driverName: req.user.fullName,
      message: `${req.user.fullName} rated you ${rating} star${
        rating > 1 ? "s" : ""
      }`,
    });

    sendSuccess(
      res,
      {
        rideId: ride._id,
        rating,
        comment,
      },
      "Rider rated successfully",
      200
    );
  } catch (error) {
    console.error("Rate rider error:", error);
    sendError(res, "Failed to rate rider", 500);
  }
};

// Helper function to update driver average rating
async function updateDriverRating(driverId) {
  try {
    const Driver = require("../models/Driver");

    // Calculate average rating from completed rides
    const ratingResult = await Ride.aggregate([
      {
        $match: {
          driver: driverId,
          status: "completed",
          "rating.riderRating": { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.riderRating" },
          count: { $sum: 1 },
        },
      },
    ]);

    const newRating =
      ratingResult.length > 0
        ? Math.round(ratingResult[0].averageRating * 10) / 10
        : 5.0;

    await Driver.findByIdAndUpdate(driverId, { rating: newRating });
  } catch (error) {
    console.error("Error updating driver rating:", error);
  }
}

// Helper function to update rider average rating
async function updateRiderRating(riderId) {
  try {
    const Rider = require("../models/Rider");

    // Calculate average rating from completed rides
    const ratingResult = await Ride.aggregate([
      {
        $match: {
          rider: riderId,
          status: "completed",
          "rating.driverRating": { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.driverRating" },
          count: { $sum: 1 },
        },
      },
    ]);

    const newRating =
      ratingResult.length > 0
        ? Math.round(ratingResult[0].averageRating * 10) / 10
        : 5.0;

    await Rider.findByIdAndUpdate(riderId, { rating: newRating });
  } catch (error) {
    console.error("Error updating rider rating:", error);
  }
}

// Helper function to encode a point for Google Maps polyline (simplified)
function encodePoint(lat, lng) {
  // Simplified encoding - in production, use proper Google Maps encoding
  const latInt = Math.round(lat * 1e5);
  const lngInt = Math.round(lng * 1e5);

  return (
    String.fromCharCode(
      (latInt & 0x1f) | 0x20,
      ((latInt >> 5) & 0x1f) | 0x20,
      ((latInt >> 10) & 0x1f) | 0x20,
      ((latInt >> 15) & 0x1f) | 0x20,
      ((latInt >> 20) & 0x1f) | 0x20
    ) +
    String.fromCharCode(
      (lngInt & 0x1f) | 0x20,
      ((lngInt >> 5) & 0x1f) | 0x20,
      ((lngInt >> 10) & 0x1f) | 0x20,
      ((lngInt >> 15) & 0x1f) | 0x20,
      ((lngInt >> 20) & 0x1f) | 0x20
    )
  );
}
