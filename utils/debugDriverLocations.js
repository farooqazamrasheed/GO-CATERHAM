/**
 * Debug Utility Script for Driver Locations
 * 
 * This script helps diagnose issues with getNearbyDrivers by:
 * 1. Checking all LiveLocation records and their timestamps
 * 2. Showing which drivers would be filtered out and why
 * 3. Optionally refreshing stale locations for testing
 * 
 * Usage:
 *   node utils/debugDriverLocations.js                    # Check all locations
 *   node utils/debugDriverLocations.js --refresh          # Refresh all stale locations
 *   node utils/debugDriverLocations.js --refresh-all      # Refresh ALL locations
 *   node utils/debugDriverLocations.js --driver <id>      # Check specific driver
 */

const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const LiveLocation = require("../models/LiveLocation");
const User = require("../models/User");
require("dotenv").config();

// Configuration
const LOCATION_STALENESS_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

async function checkDriverLocations() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Get command line arguments
    const args = process.argv.slice(2);
    const shouldRefresh = args.includes("--refresh");
    const shouldRefreshAll = args.includes("--refresh-all");
    const driverIdIndex = args.indexOf("--driver");
    const specificDriverId = driverIdIndex !== -1 ? args[driverIdIndex + 1] : null;

    console.log("=" .repeat(70));
    console.log("📍 DRIVER LOCATION DEBUG REPORT");
    console.log("=" .repeat(70));
    console.log(`Report generated at: ${new Date().toISOString()}`);
    console.log(`Staleness threshold: ${LOCATION_STALENESS_THRESHOLD / 1000 / 60} minutes`);
    console.log("=" .repeat(70));

    // 1. Get all LiveLocation records
    const allLocations = await LiveLocation.find({})
      .populate({
        path: "driver",
        populate: {
          path: "user",
          select: "fullName email"
        }
      })
      .sort({ timestamp: -1 });

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total LiveLocation records: ${allLocations.length}`);

    if (allLocations.length === 0) {
      console.log("\n⚠️  No LiveLocation records found in database!");
      console.log("   Drivers need to send location updates to appear in searches.");
      await mongoose.disconnect();
      return;
    }

    // 2. Analyze each location
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - LOCATION_STALENESS_THRESHOLD);
    
    let recentCount = 0;
    let staleCount = 0;
    let onlineCount = 0;
    let approvedCount = 0;
    let activeCount = 0;
    let visibleCount = 0;

    console.log("\n" + "-".repeat(70));
    console.log("📋 DETAILED LOCATION ANALYSIS:");
    console.log("-".repeat(70));

    const locationsToRefresh = [];

    for (const location of allLocations) {
      const driver = location.driver;
      const timestamp = new Date(location.timestamp);
      const ageMs = now - timestamp.getTime();
      const ageMinutes = Math.round(ageMs / 1000 / 60 * 10) / 10;
      const isRecent = timestamp >= fiveMinutesAgo;

      // Skip if looking for specific driver
      if (specificDriverId && driver?._id?.toString() !== specificDriverId) {
        continue;
      }

      const isOnline = driver?.status === "online";
      const isApproved = driver?.isApproved === "approved";
      const isActive = driver?.activeStatus === "active";
      const wouldBeVisible = isRecent && isOnline && isApproved && isActive;

      if (isRecent) recentCount++;
      else staleCount++;
      if (isOnline) onlineCount++;
      if (isApproved) approvedCount++;
      if (isActive) activeCount++;
      if (wouldBeVisible) visibleCount++;

      // Determine status indicators
      const statusIcons = {
        timestamp: isRecent ? "✅" : "❌",
        online: isOnline ? "✅" : "❌",
        approved: isApproved ? "✅" : "❌",
        active: isActive ? "✅" : "❌",
        visible: wouldBeVisible ? "🟢" : "🔴"
      };

      console.log(`\n${statusIcons.visible} Driver: ${driver?.user?.fullName || "Unknown"}`);
      console.log(`   Driver ID: ${driver?._id || location.driver}`);
      console.log(`   Location ID: ${location._id}`);
      console.log(`   Coordinates: (${location.latitude}, ${location.longitude})`);
      console.log(`   Timestamp: ${timestamp.toISOString()}`);
      console.log(`   Age: ${ageMinutes} minutes ${statusIcons.timestamp} ${isRecent ? "(RECENT)" : "(STALE)"}`);
      console.log(`   Driver Status: ${driver?.status || "N/A"} ${statusIcons.online}`);
      console.log(`   Approved: ${driver?.isApproved || "N/A"} ${statusIcons.approved}`);
      console.log(`   Active Status: ${driver?.activeStatus || "N/A"} ${statusIcons.active}`);
      console.log(`   Vehicle Type: ${driver?.vehicleType || "N/A"}`);
      
      if (!wouldBeVisible) {
        console.log(`   ⚠️  FILTERED OUT BECAUSE:`);
        if (!isRecent) console.log(`      - Location is ${ageMinutes} minutes old (> 5 min threshold)`);
        if (!isOnline) console.log(`      - Driver status is "${driver?.status}" (not "online")`);
        if (!isApproved) console.log(`      - Driver approval is "${driver?.isApproved}" (not "approved")`);
        if (!isActive) console.log(`      - Driver activeStatus is "${driver?.activeStatus}" (not "active")`);
      }

      // Track stale locations for refresh
      if (!isRecent && driver) {
        locationsToRefresh.push({
          locationId: location._id,
          driverId: driver._id,
          driverName: driver.user?.fullName || "Unknown",
          currentLat: location.latitude,
          currentLng: location.longitude
        });
      }
    }

    // 3. Print summary
    console.log("\n" + "=".repeat(70));
    console.log("📈 FILTER ANALYSIS SUMMARY:");
    console.log("=".repeat(70));
    console.log(`   Total locations:        ${allLocations.length}`);
    console.log(`   Recent (< 5 min):       ${recentCount} ${recentCount > 0 ? "✅" : "❌"}`);
    console.log(`   Stale (>= 5 min):       ${staleCount} ${staleCount > 0 ? "⚠️" : "✅"}`);
    console.log(`   Online drivers:         ${onlineCount}`);
    console.log(`   Approved drivers:       ${approvedCount}`);
    console.log(`   Active drivers:         ${activeCount}`);
    console.log(`   VISIBLE TO RIDERS:      ${visibleCount} ${visibleCount > 0 ? "🟢" : "🔴"}`);

    if (visibleCount === 0) {
      console.log("\n🚨 WARNING: No drivers will appear in rider searches!");
      console.log("   This is likely why getNearbyDrivers returns empty results.");
    }

    // 4. Refresh locations if requested
    if ((shouldRefresh || shouldRefreshAll) && locationsToRefresh.length > 0) {
      console.log("\n" + "=".repeat(70));
      console.log("🔄 REFRESHING LOCATIONS:");
      console.log("=".repeat(70));

      for (const loc of locationsToRefresh) {
        const newTimestamp = new Date();
        await LiveLocation.findByIdAndUpdate(loc.locationId, {
          timestamp: newTimestamp,
          updatedAt: newTimestamp
        });
        console.log(`   ✅ Refreshed: ${loc.driverName} (${loc.driverId})`);
      }

      console.log(`\n   Total refreshed: ${locationsToRefresh.length} locations`);
    } else if (shouldRefreshAll) {
      console.log("\n" + "=".repeat(70));
      console.log("🔄 REFRESHING ALL LOCATIONS:");
      console.log("=".repeat(70));

      const newTimestamp = new Date();
      const result = await LiveLocation.updateMany({}, {
        timestamp: newTimestamp,
        updatedAt: newTimestamp
      });

      console.log(`   ✅ Refreshed ${result.modifiedCount} locations`);
    }

    // 5. MongoDB shell commands for manual debugging
    console.log("\n" + "=".repeat(70));
    console.log("🔧 MONGODB SHELL DEBUG COMMANDS:");
    console.log("=".repeat(70));
    console.log(`
// Check all LiveLocation records and their timestamps
db.livelocations.find({}, { driver: 1, timestamp: 1, latitude: 1, longitude: 1 }).sort({ timestamp: -1 })

// Check how old the most recent location is
db.livelocations.aggregate([
  { $sort: { timestamp: -1 } },
  { $limit: 1 },
  { $project: { 
    driver: 1, 
    timestamp: 1,
    ageInMinutes: { $divide: [{ $subtract: [new Date(), "$timestamp"] }, 60000] }
  }}
])

// Find all locations older than 5 minutes
db.livelocations.find({
  timestamp: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
}).count()

// Manually refresh all timestamps to NOW (for testing)
db.livelocations.updateMany({}, { $set: { timestamp: new Date() } })

// Check online, approved, active drivers
db.drivers.find({ 
  status: "online", 
  isApproved: "approved",
  activeStatus: "active"
}).count()
`);

    // 6. cURL commands for testing
    console.log("\n" + "=".repeat(70));
    console.log("🧪 API TEST COMMANDS:");
    console.log("=".repeat(70));
    console.log(`
# Update driver status to online with location (replace TOKEN)
curl -X PUT http://localhost:5000/api/v1/drivers/status \\
  -H "Authorization: Bearer <DRIVER_JWT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "online",
    "latitude": 51.24372854,
    "longitude": -0.58948157,
    "heading": 90,
    "speed": 0
  }'

# Update driver location (replace TOKEN)
curl -X POST http://localhost:5000/api/v1/drivers/location \\
  -H "Authorization: Bearer <DRIVER_JWT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "latitude": 51.24372854,
    "longitude": -0.58948157,
    "heading": 180,
    "speed": 35
  }'

# Check available drivers (replace TOKEN)
curl -X GET "http://localhost:5000/api/v1/riders/available-drivers?latitude=51.2437&longitude=-0.5894&radius=5000" \\
  -H "Authorization: Bearer <RIDER_JWT_TOKEN>"
`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

// Run the script
checkDriverLocations();
