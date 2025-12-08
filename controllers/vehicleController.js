const Vehicle = require("../models/Vehicle");
const Driver = require("../models/Driver");

// Add a vehicle (driver only)
exports.addVehicle = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Check if driver already has a vehicle
    const existingVehicle = await Vehicle.findOne({ driver: driver._id });
    if (existingVehicle) {
      return res
        .status(400)
        .json({ success: false, message: "Vehicle already registered" });
    }

    const { make, model, year, licensePlate, color, type } = req.body;

    const vehicle = await Vehicle.create({
      driver: driver._id,
      make,
      model,
      year,
      licensePlate,
      color,
      type,
    });

    driver.vehicle = vehicle._id;
    await driver.save();

    res.status(201).json({ success: true, vehicle });
  } catch (err) {
    next(err);
  }
};

// Update vehicle
exports.updateVehicle = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });
    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { driver: driver._id },
      req.body,
      { new: true }
    );

    if (!vehicle) {
      return res
        .status(404)
        .json({ success: false, message: "Vehicle not found" });
    }

    res.status(200).json({ success: true, vehicle });
  } catch (err) {
    next(err);
  }
};

// Get driver's vehicle
exports.getVehicle = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id }).populate(
      "vehicle"
    );
    if (!driver || !driver.vehicle) {
      return res
        .status(404)
        .json({ success: false, message: "Vehicle not found" });
    }

    res.status(200).json({ success: true, vehicle: driver.vehicle });
  } catch (err) {
    next(err);
  }
};
