const LiveLocation = require("../models/LiveLocation");

exports.updateLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, heading, speed } = req.body;

    const location = await LiveLocation.create({
      driver: req.user._id,
      latitude,
      longitude,
      heading,
      speed,
    });

    res.status(200).json({ success: true, location });
  } catch (err) {
    next(err);
  }
};
