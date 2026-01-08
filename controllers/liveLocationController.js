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
        latitude,
        longitude,
        heading: heading || 0,
        speed: speed || 0,
        timestamp: new Date()
      },
      { upsert: true, new: true }
    );

    console.log("DEBUG [liveLocation/update]: Location saved:", {
      locationId: location._id,
      driverId: location.driver,
      timestamp: location.timestamp
    });

    // Notify nearby riders about driver location update
    socketService.notifyNearbyRidersAboutDriverUpdate(req.user._id, {
      latitude,
      longitude,
      heading,
      speed,
    });

    // Notify subscribers of active rides about driver location update
    socketService.notifyRideSubscribersAboutDriverLocation(req.user._id, {
      latitude,
      longitude,
      heading,
      speed,
      timestamp: location.timestamp,
    });

    res.status(200).json({ success: true, location });
  } catch (err) {
    next(err);
  }
};
