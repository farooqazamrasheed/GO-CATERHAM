const RiderLiveLocation = require("../models/RiderLiveLocation");
const Rider = require("../models/Rider");
const { sendSuccess, sendError } = require("../utils/responseHelper");

/**
 * Update rider's live location
 * POST /api/v1/riders/location
 */
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, heading, speed, accuracy } = req.body;
    const riderId = req.user.id;

    // Validate required fields
    if (!latitude || !longitude) {
      return sendError(res, "Latitude and longitude are required", 400);
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Validate parsed coordinates
    if (isNaN(lat) || isNaN(lng)) {
      console.error('Invalid rider location coordinates:', {
        riderId,
        latitude,
        longitude,
        parsedLat: lat,
        parsedLng: lng
      });
      return sendError(res, "Latitude and longitude must be valid numbers", 400);
    }

    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error('Rider location coordinates out of range:', {
        riderId,
        latitude: lat,
        longitude: lng
      });
      return sendError(res, "Invalid latitude or longitude values", 400);
    }

    // Check if rider exists and is active
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    if (rider.status !== "online") {
      return sendError(res, "Rider must be online to update location", 400);
    }

    // Create or update live location
    const locationData = {
      rider: riderId,
      latitude: lat,
      longitude: lng,
      heading: heading ? parseFloat(heading) : 0,
      speed: speed ? parseFloat(speed) : 0,
      accuracy: accuracy ? parseFloat(accuracy) : 0,
    };

    // Upsert location (update if exists for this rider, create if not)
    const location = await RiderLiveLocation.findOneAndUpdate(
      { rider: riderId },
      locationData,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    sendSuccess(
      res,
      {
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
        },
      },
      "Location updated successfully",
      200
    );
  } catch (error) {
    console.error("Update rider location error:", error);
    sendError(res, "Failed to update location", 500);
  }
};

/**
 * Get rider's current location
 * GET /api/v1/riders/location
 */
exports.getCurrentLocation = async (req, res) => {
  try {
    const riderId = req.user.id;

    const location = await RiderLiveLocation.findOne({ rider: riderId }).sort({
      timestamp: -1,
    });

    if (!location) {
      return sendError(res, "No location found for this rider", 404);
    }

    sendSuccess(
      res,
      {
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
        },
      },
      "Location retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get rider location error:", error);
    sendError(res, "Failed to retrieve location", 500);
  }
};

/**
 * Get nearby riders (for admin/driver use)
 * GET /api/v1/riders/nearby?lat=:lat&lng=:lng&radius=:radius
 */
exports.getNearbyRiders = async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query; // radius in kilometers

    if (!lat || !lng) {
      return sendError(res, "Latitude and longitude are required", 400);
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(longitude);
    const radiusKm = parseFloat(radius);

    // Get recent locations (within last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const nearbyLocations = await RiderLiveLocation.find({
      timestamp: { $gte: tenMinutesAgo },
      latitude: { $gte: latitude - 0.1, $lte: latitude + 0.1 }, // Rough bounding box
      longitude: { $gte: longitude - 0.1, $lte: longitude + 0.1 },
    })
      .populate({
        path: "rider",
        populate: {
          path: "user",
          select: "fullName phone",
        },
      })
      .limit(50);

    // Filter by actual distance and populate rider info
    const riders = [];
    for (const location of nearbyLocations) {
      const distance = calculateDistance(
        latitude,
        longitude,
        location.latitude,
        location.longitude
      );

      if (
        distance <= radiusKm &&
        location.rider &&
        location.rider.status === "online"
      ) {
        riders.push({
          riderId: location.rider._id,
          name: location.rider.user?.fullName || "Unknown Rider",
          phone: location.rider.user?.phone,
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
            heading: location.heading,
            speed: location.speed,
            accuracy: location.accuracy,
            timestamp: location.timestamp,
          },
          distance: Math.round(distance * 10) / 10, // Round to 1 decimal
        });
      }
    }

    // Sort by distance
    riders.sort((a, b) => a.distance - b.distance);

    sendSuccess(
      res,
      {
        riders,
        center: { latitude, longitude },
        radius: radiusKm,
        count: riders.length,
      },
      "Nearby riders retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get nearby riders error:", error);
    sendError(res, "Failed to retrieve nearby riders", 500);
  }
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
