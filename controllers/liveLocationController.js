const LiveLocation = require("../models/LiveLocation");
const Driver = require("../models/Driver");
const socketService = require("../services/socketService");

exports.updateLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, heading, speed } = req.body;

    console.log("DEBUG [liveLocation/update]: Received location update request:", {
      userId: req.user._id,
      latitude,
      longitude,
      heading,
      speed
    });

    // Validate coordinates
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: "Latitude and longitude are required" 
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      console.error('Invalid driver location coordinates in controller:', {
        userId: req.user._id,
        latitude,
        longitude,
        parsedLat: lat,
        parsedLng: lng
      });
      return res.status(400).json({ 
        success: false, 
        message: "Latitude and longitude must be valid numbers" 
      });
    }

    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error('Driver location coordinates out of range:', {
        userId: req.user._id,
        latitude: lat,
        longitude: lng
      });
      return res.status(400).json({ 
        success: false, 
        message: "Invalid latitude or longitude values" 
      });
    }

    // Get driver details for debugging
    const driver = await Driver.findOne({ user: req.user._id });
    if (driver) {
      console.log("DEBUG [liveLocation/update]: Driver details:", {
        driverId: driver._id,
        status: driver.status,
        isApproved: driver.isApproved,
        vehicleType: driver.vehicleType,
        activeStatus: driver.activeStatus
      });
    } else {
      console.log("DEBUG [liveLocation/update]: WARNING - No driver profile found for user:", req.user._id);
    }

    // Use upsert to update existing or create new location
    const location = await LiveLocation.findOneAndUpdate(
      { driver: driver ? driver._id : req.user._id },
      {
        driver: driver ? driver._id : req.user._id,
        latitude: lat,
        longitude: lng,
        heading: heading ? parseFloat(heading) : 0,
        speed: speed ? parseFloat(speed) : 0,
        timestamp: new Date(),
        location: {
          type: "Point",
          coordinates: [lng, lat] // GeoJSON format: [longitude, latitude]
        }
      },
      { upsert: true, new: true, runValidators: false }
    );

    console.log("DEBUG [liveLocation/update]: Location saved:", {
      locationId: location._id,
      driverId: location.driver,
      timestamp: location.timestamp
    });

    // Notify nearby riders about driver location update
    socketService.notifyNearbyRidersAboutDriverUpdate(req.user._id, {
      latitude: lat,
      longitude: lng,
      heading: heading ? parseFloat(heading) : 0,
      speed: speed ? parseFloat(speed) : 0,
    });

    // Notify subscribers of active rides about driver location update
    socketService.notifyRideSubscribersAboutDriverLocation(req.user._id, {
      latitude: lat,
      longitude: lng,
      heading: heading ? parseFloat(heading) : 0,
      speed: speed ? parseFloat(speed) : 0,
      timestamp: location.timestamp,
    });

    res.status(200).json({ success: true, location });
  } catch (err) {
    // Handle error properly - check if next exists (called from Express) or just log (called from socket)
    if (next && typeof next === 'function') {
      next(err);
    } else {
      console.error('Error in updateLocation:', err);
      if (res && !res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to update location' });
      }
    }
  }
};
