const User = require("../models/User");

/**
 * Socket Service - Handles real-time notifications via Socket.io
 */
class SocketService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize socket service with io instance
   * @param {Object} io - Socket.io instance
   */
  initialize(io) {
    this.io = io;
    this.setupSocketHandlers();
    this.startPeriodicRiderDashboardUpdates();
  }

  /**
   * Setup socket event handlers
   */
  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      // Join user-specific room
      socket.on("join", (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined room`);
      });

      // Dashboard subscription for real-time updates
      socket.on("subscribe_dashboard", (data) => {
        const { userId, userType, latitude, longitude } = data;
        if (userId && userType === "driver") {
          socket.join(`dashboard_${userId}`);
          console.log(`Driver ${userId} subscribed to dashboard updates`);

          // Send initial dashboard data
          this.sendInitialDashboardData(userId, latitude, longitude);
        } else if (userId && userType === "rider") {
          socket.join(`rider_dashboard_${userId}`);
          console.log(`Rider ${userId} subscribed to dashboard updates`);

          // Send initial rider dashboard data
          this.sendInitialRiderDashboardData(userId, latitude, longitude);
        }
      });

      // Unsubscribe from dashboard
      socket.on("unsubscribe_dashboard", (userId) => {
        socket.leave(`dashboard_${userId}`);
        socket.leave(`rider_dashboard_${userId}`);
        console.log(`User ${userId} unsubscribed from dashboard`);
      });

      // Handle ride-related events
      socket.on("ride_request_response", (data) => {
        console.log("Ride request response:", data);
      });

      // Wallet subscription for real-time updates
      socket.on("subscribe_wallet", (userId) => {
        if (userId) {
          socket.join(`wallet_${userId}`);
          console.log(`User ${userId} subscribed to wallet updates`);
        }
      });

      // Unsubscribe from wallet updates
      socket.on("unsubscribe_wallet", (userId) => {
        socket.leave(`wallet_${userId}`);
        console.log(`User ${userId} unsubscribed from wallet updates`);
      });

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });
  }

  /**
   * Start periodic rider dashboard updates
   */
  startPeriodicRiderDashboardUpdates() {
    // Update rider dashboards every 30 seconds
    setInterval(async () => {
      try {
        if (this.io) {
          // Get all rider dashboard rooms
          const rooms = Array.from(this.io.sockets.adapter.rooms.keys()).filter(
            (room) => room.startsWith("rider_dashboard_")
          );

          for (const room of rooms) {
            const riderId = room.replace("rider_dashboard_", "");

            // For periodic updates, we need rider location data
            // This is a simplified approach - in production, you'd store rider locations
            // For now, we'll skip periodic updates that require location data
            // and only send general updates if needed

            // You could send periodic stats updates here if rider location is cached
            // this.sendPeriodicRiderStatsUpdate(riderId);
          }
        }
      } catch (error) {
        console.error("Error in periodic rider dashboard updates:", error);
      }
    }, 30000); // 30 seconds
  }

  /**
   * Send notification to specific user
   * @param {string} userId - User ID to send notification to
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyUser(userId, event, data) {
    if (this.io) {
      this.io.to(userId).emit(event, data);
      console.log(`Notification sent to user ${userId}: ${event}`);
    }
  }

  /**
   * Send notification to dashboard subscribers
   * @param {string} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyDashboard(userId, event, data) {
    if (this.io) {
      this.io.to(`dashboard_${userId}`).emit(event, data);
      console.log(`Dashboard notification sent to user ${userId}: ${event}`);
    }
  }

  /**
   * Send notification to rider dashboard subscribers
   * @param {string} riderId - Rider ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyRiderDashboard(riderId, event, data) {
    if (this.io) {
      this.io.to(`rider_dashboard_${riderId}`).emit(event, data);
      console.log(
        `Rider dashboard notification sent to rider ${riderId}: ${event}`
      );
    }
  }

  /**
   * Send initial dashboard data to newly subscribed driver
   * @param {string} driverId - Driver ID
   * @param {number} latitude - Driver latitude
   * @param {number} longitude - Driver longitude
   */
  async sendInitialDashboardData(driverId, latitude, longitude) {
    try {
      // Import required models and functions
      const Driver = require("../models/Driver");
      const Ride = require("../models/Ride");
      const LiveLocation = require("../models/LiveLocation");

      // Get driver profile
      const driver = await Driver.findOne({ user: driverId });
      if (!driver) return;

      // Calculate earnings (similar to getDashboard)
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayEarnings = await Ride.aggregate([
        {
          $match: {
            driver: driver._id,
            status: "completed",
            updatedAt: { $gte: today, $lt: tomorrow },
          },
        },
        { $group: { _id: null, earnings: { $sum: "$driverEarnings" } } },
      ]);

      // Get nearby drivers
      const nearbyDrivers = await this.getNearbyDriversForDashboard(
        driverId,
        latitude,
        longitude
      );

      // Get nearby ride requests
      const nearbyRides = await this.getNearbyRideRequestsForDashboard(
        latitude,
        longitude
      );

      const dashboardData = {
        driver: {
          status: driver.status,
          totalRides: await Ride.countDocuments({
            driver: driver._id,
            status: "completed",
          }),
          todayEarnings: todayEarnings[0]?.earnings || 0,
        },
        nearbyDrivers,
        nearbyRideRequests: nearbyRides,
        timestamp: new Date(),
      };

      this.notifyDashboard(driverId, "dashboard_initial", dashboardData);
    } catch (error) {
      console.error("Error sending initial dashboard data:", error);
    }
  }

  /**
   * Send initial dashboard data to newly subscribed rider
   * @param {string} riderId - Rider ID
   * @param {number} latitude - Rider latitude
   * @param {number} longitude - Rider longitude
   */
  async sendInitialRiderDashboardData(riderId, latitude, longitude) {
    try {
      // Import required models and functions
      const Rider = require("../models/Rider");
      const Wallet = require("../models/Wallet");
      const Ride = require("../models/Ride");
      const User = require("../models/User");

      // Get rider profile and user
      const rider = await Rider.findOne({ user: riderId });
      const user = await User.findById(riderId);
      if (!rider || !user) return;

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
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );
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
          rider: riderId,
          status: "completed",
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        }),
        Ride.countDocuments({
          rider: riderId,
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

      // Get wallet balance
      const wallet = await Wallet.findOne({ user: riderId });
      const totalSaved = wallet ? wallet.balance : 0;

      // Get nearby drivers
      const nearbyDrivers = await this.getNearbyDriversForRiderDashboard(
        latitude,
        longitude
      );

      // Extract first name from full name
      const firstName = user.fullName ? user.fullName.split(" ")[0] : "User";

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
          surreyBoundary: {
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
              ],
            ],
          },
          userLocation: {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
          },
        },
        timestamp: new Date(),
      };

      this.notifyRiderDashboard(
        riderId,
        "rider_dashboard_initial",
        dashboardData
      );
    } catch (error) {
      console.error("Error sending initial rider dashboard data:", error);
    }
  }

  /**
   * Get nearby drivers for dashboard
   */
  async getNearbyDriversForDashboard(driverId, latitude, longitude) {
    // Similar logic to driverController.getNearbyDriversForDriver
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const LiveLocation = require("../models/LiveLocation");

    const recentLocations = await LiveLocation.find({
      timestamp: { $gte: fiveMinutesAgo },
      driver: { $ne: driverId }, // Exclude current driver
    }).populate({
      path: "driver",
      populate: { path: "user", select: "fullName" },
    });

    // Filter and calculate distances (simplified)
    return recentLocations.slice(0, 10).map((loc) => ({
      driverId: loc.driver._id,
      name: loc.driver.user?.fullName || "Unknown",
      distance: 2.5, // Placeholder - would calculate actual distance
      status: loc.driver.status,
    }));
  }

  /**
   * Get nearby ride requests for dashboard
   */
  async getNearbyRideRequestsForDashboard(latitude, longitude) {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const Ride = require("../models/Ride");

    const pendingRides = await Ride.find({
      status: "searching",
      createdAt: { $gte: twoMinutesAgo },
    }).limit(5);

    return pendingRides.map((ride) => ({
      rideId: ride._id,
      distance: 1.2, // Placeholder - would calculate actual distance
      estimatedFare: ride.estimatedFare,
      timeLeft: 15,
    }));
  }

  /**
   * Get nearby drivers for rider dashboard
   * @param {number} userLat - User latitude
   * @param {number} userLon - User longitude
   */
  async getNearbyDriversForRiderDashboard(userLat, userLon) {
    try {
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
      console.error("Error getting nearby drivers for rider dashboard:", error);
      return [];
    }
  }

  /**
   * Send notification to multiple users
   * @param {Array} userIds - Array of user IDs
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyUsers(userIds, event, data) {
    if (this.io) {
      userIds.forEach((userId) => {
        this.io.to(userId).emit(event, data);
      });
      console.log(`Notification sent to users ${userIds.join(", ")}: ${event}`);
    }
  }

  /**
   * Notify rider about ride status changes
   * @param {string} riderId - Rider ID
   * @param {string} status - Ride status
   * @param {Object} rideData - Ride data
   */
  notifyRideStatus(riderId, status, rideData) {
    const eventMap = {
      searching: "ride_searching",
      assigned: "ride_assigned",
      accepted: "ride_accepted",
      in_progress: "ride_started",
      completed: "ride_completed",
      cancelled: "ride_cancelled",
      no_drivers: "ride_no_drivers",
      scheduled: "ride_scheduled",
    };

    const event = eventMap[status] || "ride_status_update";
    this.notifyUser(riderId, event, {
      rideId: rideData._id,
      status,
      ...rideData,
    });
  }

  /**
   * Notify driver about new ride request
   * @param {string} driverId - Driver ID
   * @param {Object} rideData - Ride request data
   */
  notifyRideRequest(driverId, rideData) {
    this.notifyUser(driverId, "ride_request", {
      rideId: rideData._id,
      pickup: rideData.pickup,
      dropoff: rideData.dropoff,
      estimatedFare: rideData.estimatedFare,
      vehicleType: rideData.vehicleType,
      rider: rideData.rider,
      timeLeft: 15, // seconds
    });
  }

  /**
   * Notify driver that ride was taken by another driver
   * @param {string} driverId - Driver ID
   * @param {string} rideId - Ride ID
   */
  notifyRideTaken(driverId, rideId) {
    this.notifyUser(driverId, "ride_taken", { rideId });
  }

  /**
   * Notify rider about driver assignment
   * @param {string} riderId - Rider ID
   * @param {Object} driverData - Driver information
   * @param {Object} rideData - Ride data
   */
  notifyDriverAssigned(riderId, driverData, rideData) {
    this.notifyUser(riderId, "driver_assigned", {
      rideId: rideData._id,
      driver: {
        id: driverData._id,
        name: driverData.user?.fullName || "Unknown Driver",
        phone: driverData.user?.phone,
        rating: driverData.rating || 5.0,
        vehicle: {
          make: driverData.vehicle?.make,
          model: driverData.vehicle?.model,
          color: driverData.vehicle?.color,
          plateNumber: driverData.vehicle?.plateNumber,
        },
      },
      estimatedPickupTime: rideData.estimatedPickupTime,
    });
  }

  /**
   * Notify rider about ride cancellation
   * @param {string} riderId - Rider ID
   * @param {string} reason - Cancellation reason
   * @param {Object} rideData - Ride data
   */
  notifyRideCancelled(riderId, reason, rideData) {
    this.notifyUser(riderId, "ride_cancelled", {
      rideId: rideData._id,
      reason,
      cancellationFee: rideData.cancellationFee || 0,
    });
  }

  /**
   * Notify driver about dashboard data updates
   * @param {string} driverId - Driver ID
   * @param {Object} updateData - Updated dashboard data
   * @param {string} updateType - Type of update (earnings, status, nearby_rides, etc.)
   */
  notifyDriverDashboardUpdate(driverId, updateData, updateType = "general") {
    const notificationData = {
      updateType,
      data: updateData,
      timestamp: new Date(),
    };

    // Send to user's personal room
    this.notifyUser(driverId, "dashboard_update", notificationData);

    // Also send to dashboard subscribers
    this.notifyDashboard(driverId, "dashboard_update", notificationData);
  }

  /**
   * Notify driver about earnings update
   * @param {string} driverId - Driver ID
   * @param {Object} earningsData - Updated earnings information
   */
  notifyDriverEarningsUpdate(driverId, earningsData) {
    this.notifyDriverDashboardUpdate(
      driverId,
      {
        earnings: earningsData,
      },
      "earnings"
    );
  }

  /**
   * Notify driver about nearby ride requests
   * @param {string} driverId - Driver ID
   * @param {Array} rideRequests - Array of nearby ride requests
   */
  notifyNearbyRideRequests(driverId, rideRequests) {
    this.notifyDriverDashboardUpdate(
      driverId,
      {
        nearbyRideRequests: rideRequests,
      },
      "nearby_rides"
    );
  }

  /**
   * Notify driver about nearby drivers update
   * @param {string} driverId - Driver ID
   * @param {Array} nearbyDrivers - Array of nearby drivers
   */
  notifyNearbyDriversUpdate(driverId, nearbyDrivers) {
    this.notifyDriverDashboardUpdate(
      driverId,
      {
        nearbyDrivers: nearbyDrivers,
      },
      "nearby_drivers"
    );
  }

  /**
   * Notify driver about status change
   * @param {string} driverId - Driver ID
   * @param {string} newStatus - New driver status
   */
  notifyDriverStatusUpdate(driverId, newStatus) {
    this.notifyDriverDashboardUpdate(
      driverId,
      {
        status: newStatus,
      },
      "status"
    );
  }

  /**
   * Notify rider about dashboard data updates
   * @param {string} riderId - Rider ID
   * @param {Object} updateData - Updated dashboard data
   * @param {string} updateType - Type of update (nearby_drivers, stats, etc.)
   */
  notifyRiderDashboardUpdate(riderId, updateData, updateType = "general") {
    const notificationData = {
      updateType,
      data: updateData,
      timestamp: new Date(),
    };

    // Send to user's personal room
    this.notifyUser(riderId, "rider_dashboard_update", notificationData);

    // Also send to rider dashboard subscribers
    this.notifyRiderDashboard(
      riderId,
      "rider_dashboard_update",
      notificationData
    );
  }

  /**
   * Notify rider about nearby drivers update
   * @param {string} riderId - Rider ID
   * @param {Array} nearbyDrivers - Array of nearby drivers
   */
  notifyRiderNearbyDriversUpdate(riderId, nearbyDrivers) {
    this.notifyRiderDashboardUpdate(
      riderId,
      {
        nearbyDrivers: nearbyDrivers,
      },
      "nearby_drivers"
    );
  }

  /**
   * Notify rider about stats update
   * @param {string} riderId - Rider ID
   * @param {Object} statsData - Updated stats information
   */
  notifyRiderStatsUpdate(riderId, statsData) {
    this.notifyRiderDashboardUpdate(
      riderId,
      {
        stats: statsData,
      },
      "stats"
    );
  }

  /**
   * Notify nearby riders about driver location updates
   * @param {string} driverId - Driver ID
   * @param {Object} driverLocation - Driver location data
   */
  async notifyNearbyRidersAboutDriverUpdate(driverId, driverLocation) {
    try {
      // Find all rider dashboard subscribers (this is a simplified approach)
      // In a production system, you'd want to track subscribed riders with their locations
      // For now, we'll broadcast to all rider dashboard rooms
      // This could be optimized by maintaining a spatial index of rider locations

      if (this.io) {
        // Get all rooms that start with 'rider_dashboard_'
        const rooms = Array.from(this.io.sockets.adapter.rooms.keys()).filter(
          (room) => room.startsWith("rider_dashboard_")
        );

        // For each rider room, check if the driver is nearby and send update
        for (const room of rooms) {
          const riderId = room.replace("rider_dashboard_", "");

          // Here we would need rider location data to check proximity
          // For now, we'll send updates to all subscribed riders
          // In production, you'd filter based on distance

          const nearbyDrivers = await this.getNearbyDriversForRiderDashboard(
            driverLocation.latitude,
            driverLocation.longitude
          );

          if (nearbyDrivers.length > 0) {
            this.notifyRiderNearbyDriversUpdate(riderId, nearbyDrivers);
          }
        }
      }
    } catch (error) {
      console.error(
        "Error notifying nearby riders about driver update:",
        error
      );
    }
  }

  /**
   * Notify rider about saved location changes
   * @param {string} riderId - Rider ID
   * @param {Object} locationData - Location data
   * @param {string} action - Action performed (added, updated, deleted)
   */
  notifyLocationUpdate(riderId, locationData, action = "updated") {
    this.notifyUser(riderId, "location_update", {
      action,
      location: locationData,
      timestamp: new Date(),
    });
  }

  /**
   * Notify rider about location added
   * @param {string} riderId - Rider ID
   * @param {Object} locationData - New location data
   */
  notifyLocationAdded(riderId, locationData) {
    this.notifyLocationUpdate(riderId, locationData, "added");
  }

  /**
   * Notify rider about location deleted
   * @param {string} riderId - Rider ID
   * @param {string} locationId - ID of deleted location
   */
  notifyLocationDeleted(riderId, locationId) {
    this.notifyUser(riderId, "location_update", {
      action: "deleted",
      locationId: locationId,
      timestamp: new Date(),
    });
  }

  /**
   * Notify rider about payment method changes
   * @param {string} riderId - Rider ID
   * @param {Object} paymentMethodData - Payment method data
   * @param {string} action - Action performed (added, updated, deleted)
   */
  notifyPaymentMethodUpdate(riderId, paymentMethodData, action = "updated") {
    this.notifyUser(riderId, "payment_method_update", {
      action,
      paymentMethod: paymentMethodData,
      timestamp: new Date(),
    });
  }

  /**
   * Notify rider about payment method added
   * @param {string} riderId - Rider ID
   * @param {Object} paymentMethodData - New payment method data
   */
  notifyPaymentMethodAdded(riderId, paymentMethodData) {
    this.notifyPaymentMethodUpdate(riderId, paymentMethodData, "added");
  }

  /**
   * Notify rider about payment method deleted
   * @param {string} riderId - Rider ID
   * @param {string} paymentMethodId - ID of deleted payment method
   */
  notifyPaymentMethodDeleted(riderId, paymentMethodId) {
    this.notifyUser(riderId, "payment_method_update", {
      action: "deleted",
      paymentMethodId: paymentMethodId,
      timestamp: new Date(),
    });
  }

  /**
   * Notify user about wallet updates
   * @param {string} userId - User ID
   * @param {Object} walletData - Updated wallet data
   */
  notifyWalletUpdate(userId, walletData) {
    if (this.io) {
      this.io.to(`wallet_${userId}`).emit("wallet_update", {
        wallet: walletData,
        timestamp: new Date(),
      });
      console.log(`Wallet update sent to user ${userId}`);
    }
  }

  /**
   * Notify user about wallet spending (balance decrease)
   * @param {string} userId - User ID
   * @param {Object} spendingData - Spending transaction data
   */
  notifyWalletSpending(userId, spendingData) {
    if (this.io) {
      this.io.to(`wallet_${userId}`).emit("wallet_spending", {
        spending: spendingData,
        timestamp: new Date(),
      });
      console.log(`Wallet spending notification sent to user ${userId}`);
    }
  }

  /**
   * Notify user about low wallet balance
   * @param {string} userId - User ID
   * @param {Object} alertData - Low balance alert data
   */
  notifyLowWalletBalance(userId, alertData) {
    if (this.io) {
      this.io.to(userId).emit("low_wallet_balance", {
        alert: alertData,
        timestamp: new Date(),
      });
      console.log(`Low wallet balance alert sent to user ${userId}`);
    }
  }

  /**
   * Notify user about new wallet transaction
   * @param {string} userId - User ID
   * @param {Object} transactionData - New transaction data
   */
  notifyWalletTransaction(userId, transactionData) {
    if (this.io) {
      this.io.to(`wallet_${userId}`).emit("wallet_transaction", {
        transaction: transactionData,
        timestamp: new Date(),
      });
      console.log(`Wallet transaction notification sent to user ${userId}`);
    }
  }

  /**
   * Notify admins about ride status changes
   * @param {Object} rideData - Ride data (may not be populated)
   */
  async notifyAdminRideUpdate(rideData) {
    if (this.io) {
      try {
        // Populate the ride data if not already populated
        const populatedRide = await rideData.populate([
          { path: "rider", select: "fullName" },
          { path: "driver", populate: { path: "user", select: "fullName" } },
        ]);

        // Emit to all admin users (admin, superadmin, subadmin)
        this.io.emit("admin_ride_update", {
          rideId: populatedRide._id,
          riderId: populatedRide.rider?._id,
          driverId: populatedRide.driver?._id,
          status: populatedRide.status,
          pickup: populatedRide.pickup,
          dropoff: populatedRide.dropoff,
          fare: populatedRide.fare || populatedRide.estimatedFare,
          distance:
            populatedRide.actualDistance || populatedRide.estimatedDistance,
          updatedAt: new Date(),
          rideData: {
            riderFullName: populatedRide.rider?.fullName || "N/A",
            driverFullName: populatedRide.driver?.user?.fullName || "N/A",
            route:
              populatedRide.pickup && populatedRide.dropoff
                ? {
                    pickup: populatedRide.pickup.address || "N/A",
                    dropoff: populatedRide.dropoff.address || "N/A",
                  }
                : { pickup: "N/A", dropoff: "N/A" },
          },
        });
        console.log(
          `Admin notification sent for ride ${populatedRide._id} status: ${populatedRide.status}`
        );
      } catch (error) {
        console.error("Error sending admin ride update notification:", error);
      }
    }
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService;
