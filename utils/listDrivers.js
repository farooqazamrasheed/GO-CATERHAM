const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const User = require("../models/User"); // Ensure User model is registered
require("dotenv").config();

async function listDrivers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const drivers = await Driver.find({})
      .populate("user", "fullName email phone")
      .select(
        "licenseNumber vehicle numberPlateOfVehicle isApproved status createdAt"
      );

    console.log("\n📋 DRIVERS LIST:");
    console.log("==================");

    drivers.forEach((driver, index) => {
      console.log(`${index + 1}. ID: ${driver._id}`);
      console.log(`   Name: ${driver.user?.fullName || "N/A"}`);
      console.log(`   Email: ${driver.user?.email || "N/A"}`);
      console.log(`   Phone: ${driver.user?.phone || "N/A"}`);
      console.log(`   License: ${driver.licenseNumber}`);
      console.log(`   Vehicle: ${driver.vehicle}`);
      console.log(`   Plate: ${driver.numberPlateOfVehicle}`);
      console.log(`   Approved: ${driver.isApproved}`);
      console.log(`   Status: ${driver.status}`);
      console.log(`   Created: ${driver.createdAt}`);
      console.log("---");
    });

    console.log(`\nTotal drivers: ${drivers.length}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

listDrivers();
