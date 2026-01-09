const User = require("../models/User");

// Helper functions for distance and ETA calculations
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

function calculateETA(distanceKm, speedKmh = 30) {
  if (distanceKm <= 0) return 0;
  const timeHours = distanceKm / speedKmh;
  return Math.round(timeHours * 60); // Return minutes
}

/**
 * Socket Service - Handles real-time notifications via Socket.io
 */
class SocketService {
  constructor() {
    this.io = null;
    this.activeRideIntervals = new Map();
    this.driverLocationCheckInterval = null;
  }

  /**
   * Initialize socket service with io instance
   * @param {Object} io - Socket.io instance
   */
  initialize(io) {
    this.io = io;
    this.setupSocketHandlers();
    this.startPeriodicRiderDashboardUpdates();
    this.startDriverLocationPolling();
  }

  /**
   * Setup socket event handlers
   */
  setupSocketHandlers() {
    // Track connected users for logging
    this.connectedUsers = this.connectedUsers || new Map();

    this.io.on("connection", async (socket) => {
      const timestamp = new Date().toISOString();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔌 [WEBSOCKET CONNECTED]`);
      console.log(`   Socket ID: ${socket.id}`);
      console.log(`   Time: ${timestamp}`);
      console.log(`   Transport: ${socket.conn.transport.name}`);
      console.log(`   IP: ${socket.handshake.address}`);

      try {
        // Authenticate user from token (Socket.IO v3+ standard: auth object)
        const token = socket.handshake.auth.token;
        if (!token) {
          console.log(`   ❌ Auth Failed: No token provided`);
          console.log(`   Debug - socket.handshake.auth:`, socket.handshake.auth);
          console.log(`   Debug - socket.handshake.query:`, socket.handshake.query);
          console.log(`${'='.repeat(60)}\n`);
          socket.emit("connection_error", { 
            message: "No authentication token provided",
            code: "NO_TOKEN"
          });
          socket.disconnect();
          return;
        }
        
        console.log(`   ✅ Token received, length: ${token.length}`);

        const { verifyToken } = require("../utils/jwt");
        const decoded = verifyToken(token);
        const userId = decoded.id;

        // Get user details for logging
        const User = require("../models/User");
        const user = await User.findById(userId).select("fullName email role");
        const userName = user?.fullName || "Unknown";
        const userRole = user?.role || "unknown";

        // Automatically join user-specific room
        socket.join(userId);

        // Store userId on socket for later use
        socket.userId = userId;
        socket.userName = userName;
        socket.userRole = userRole;

        // Track connected user
        this.connectedUsers.set(socket.id, {
          userId,
          userName,
          userRole,
          connectedAt: new Date(),
          transport: socket.conn.transport.name
        });

        console.log(`   ✅ Auth Success`);
        console.log(`   User ID: ${userId}`);
        console.log(`   User Name: ${userName}`);
        console.log(`   User Role: ${userRole}`);
        console.log(`   Total Connected: ${this.connectedUsers.size}`);
        console.log(`${'='.repeat(60)}\n`);

        // Send connection acknowledgment to client
        socket.emit("connection_success", {
          message: "Connected successfully",
          userId: userId,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.log(`   ❌ Auth Failed: ${error.message}`);
        console.log(`${'='.repeat(60)}\n`);
        socket.emit("connection_error", { 
          message: "Authentication failed: " + error.message,
          code: "AUTH_FAILED"
        });
        socket.disconnect();
        return;
      }

      // Handle ping from client (custom heartbeat for mobile apps)
      socket.on("ping_server", (data) => {
        socket.emit("pong_server", {
          timestamp: new Date().toISOString(),
          received: data?.timestamp || null
        });
      });

      // Handle reconnection attempt
      socket.on("reconnect_attempt", () => {
        console.log(`🔄 [WEBSOCKET RECONNECTING] User: ${socket.userName} (${socket.userId})`);
      });

      //-----------------------------------------------------------------
      // // Log all incoming socket events
      // socket.onAny((event, ...args) => {
      //   console.log(`Socket event received: ${event}`, args);
      // });
      //-----------------------------------------------------------------

      // Dashboard subscription for real-time updates
      socket.on("subscribe_dashboard", (data) => {
        const { userId, userType, latitude, longitude } = data;
        if (userId && userType === "driver") {
          socket.join(`dashboard_${userId}`);
          console.log(`📊 [DASHBOARD SUBSCRIBE] Driver: ${socket.userName || userId} (${userType})`);
          console.log(`   Location: ${latitude ? `(${latitude}, ${longitude})` : 'Not provided'}`);

          // Send initial dashboard data
          this.sendInitialDashboardData(userId, latitude, longitude);

          // If location is provided, update the driver's location
          if (latitude && longitude) {
            this.updateDriverLocationFromSocket(userId, latitude, longitude);
          }
        } else if (userId && userType === "rider") {
          socket.join(`rider_dashboard_${userId}`);
          console.log(`📊 [DASHBOARD SUBSCRIBE] Rider: ${socket.userName || userId} (${userType})`);
          console.log(`   Location: ${latitude ? `(${latitude}, ${longitude})` : 'Not provided'}`);

          // Send initial rider dashboard data
          this.sendInitialRiderDashboardData(userId, latitude, longitude);
        }
      });

      // Handle driver location updates via WebSocket
      socket.on("update_location", async (data) => {
        const { latitude, longitude, heading, speed } = data;
        const userId = socket.userId;

        if (!userId || !latitude || !longitude) {
          socket.emit("location_update_error", {
            message: "Missing required fields: userId, latitude, longitude",
            timestamp: new Date()
          });
          return;
        }

        try {
          await this.updateDriverLocationFromSocket(userId, latitude, longitude, heading, speed);
          socket.emit("location_update_success", {
            message: "Location updated successfully",
            timestamp: new Date()
          });
        } catch (error) {
          console.error("Error updating driver location via socket:", error);
          socket.emit("location_update_error", {
            message: error.message || "Failed to update location",
            timestamp: new Date()
          });
        }
      });

      // Unsubscribe from dashboard
      socket.on("unsubscribe_dashboard", (userId) => {
        socket.leave(`dashboard_${userId}`);
        socket.leave(`rider_dashboard_${userId}`);
        console.log(`📊 [DASHBOARD UNSUBSCRIBE] User: ${socket.userName || userId}`);
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

      // Ride history subscription for real-time updates
      socket.on("subscribe_ride_history", (userId) => {
        if (userId) {
          socket.join(`ride_history_${userId}`);
          console.log(`User ${userId} subscribed to ride history updates`);
        }
      });

      // Unsubscribe from ride history updates
      socket.on("unsubscribe_ride_history", (userId) => {
        socket.leave(`ride_history_${userId}`);
        console.log(`User ${userId} unsubscribed from ride history updates`);
      });

      // Earnings subscription for real-time updates
      socket.on("subscribe_earnings", (userId) => {
        if (userId) {
          socket.join(`earnings_${userId}`);
          console.log(`User ${userId} subscribed to earnings updates`);
        }
      });

      // Unsubscribe from earnings updates
      socket.on("unsubscribe_earnings", (userId) => {
        socket.leave(`earnings_${userId}`);
        console.log(`User ${userId} unsubscribed from earnings updates`);
      });

      // Rewards subscription for real-time updates
      socket.on("subscribe_rewards", (userId) => {
        if (userId) {
          socket.join(`rewards_${userId}`);
          console.log(`User ${userId} subscribed to rewards updates`);
        }
      });

      // Unsubscribe from rewards updates
      socket.on("unsubscribe_rewards", (userId) => {
        socket.leave(`rewards_${userId}`);
        console.log(`User ${userId} unsubscribed from rewards updates`);
      });

      socket.on("disconnect", (reason) => {
        const timestamp = new Date().toISOString();
        const connectedInfo = this.connectedUsers?.get(socket.id);
        const connectionDuration = connectedInfo 
          ? Math.round((Date.now() - connectedInfo.connectedAt) / 1000) 
          : 0;

        // Remove from tracked users
        this.connectedUsers?.delete(socket.id);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔌 [WEBSOCKET DISCONNECTED]`);
        console.log(`   Socket ID: ${socket.id}`);
        console.log(`   User ID: ${socket.userId || 'N/A'}`);
        console.log(`   User Name: ${socket.userName || 'N/A'}`);
        console.log(`   User Role: ${socket.userRole || 'N/A'}`);
        console.log(`   Reason: ${reason}`);
        console.log(`   Session Duration: ${connectionDuration} seconds`);
        console.log(`   Time: ${timestamp}`);
        console.log(`   Remaining Connected: ${this.connectedUsers?.size || 0}`);
        
        // Log disconnection reason explanation
        const reasonExplanations = {
          'io server disconnect': '⚠️  Server forced disconnect',
          'io client disconnect': '👋 Client initiated disconnect',
          'ping timeout': '⏰ Client stopped responding to pings',
          'transport close': '🚫 Connection was closed',
          'transport error': '❌ Transport error occurred'
        };
        if (reasonExplanations[reason]) {
          console.log(`   Explanation: ${reasonExplanations[reason]}`);
        }
        console.log(`${'='.repeat(60)}\n`);
      });

      // Handle connection errors
      socket.on("error", (error) => {
        console.log(`\n⚠️  [WEBSOCKET ERROR]`);
        console.log(`   Socket ID: ${socket.id}`);
        console.log(`   User: ${socket.userName || socket.userId || 'Unknown'}`);
        console.log(`   Error: ${error.message}`);
        console.log('');
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
   * Start driver location polling - checks for online drivers without recent location updates
   * and sends reminders to update their location
   */
  startDriverLocationPolling() {
    const Driver = require("../models/Driver");
    const LiveLocation = require("../models/LiveLocation");

    // Check every 60 seconds for online drivers without recent locations
    this.driverLocationCheckInterval = setInterval(async () => {
      try {
        // Find all online drivers
        const onlineDrivers = await Driver.find({ 
          status: "online",
          isApproved: "approved",
          activeStatus: "active"
        }).populate("user", "fullName");

        if (onlineDrivers.length === 0) {
          return;
        }

        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        for (const driver of onlineDrivers) {
          // Check if driver has recent location
          const recentLocation = await LiveLocation.findOne({
            driver: driver._id,
            timestamp: { $gte: twoMinutesAgo }
          });

          if (!recentLocation) {
            // Check if they have any location at all
            const anyLocation = await LiveLocation.findOne({
              driver: driver._id
            }).sort({ timestamp: -1 });

            let warningType = "no_location";
            let message = "You are online but we don't have your location. Please enable GPS to receive ride requests.";

            if (anyLocation) {
              const locationAge = Math.round((Date.now() - new Date(anyLocation.timestamp)) / 1000 / 60);
              
              if (anyLocation.timestamp < fiveMinutesAgo) {
                warningType = "stale_location";
                message = `Your location is ${locationAge} minutes old. Please enable GPS to receive ride requests.`;
              } else {
                // Location is between 2-5 minutes old - send soft reminder
                warningType = "location_update_needed";
                message = "Please ensure your GPS is enabled for accurate location tracking.";
              }
            }

            // Send location reminder to driver via WebSocket
            // IMPORTANT: Use driver.user (User ID) not driver._id (Driver ID)
            // because sockets join rooms using User ID from JWT token
            const driverUserId = driver.user?.toString() || driver.user;
            console.log(`DEBUG [LocationPolling]: Sending location reminder to driver ${driver._id} (User: ${driverUserId}, ${driver.user?.fullName || 'Unknown'}): ${warningType}`);
            
            this.notifyUser(driverUserId, "location_reminder", {
              type: warningType,
              message: message,
              requiresAction: warningType !== "location_update_needed",
              lastLocationAge: anyLocation ? Math.round((Date.now() - new Date(anyLocation.timestamp)) / 1000 / 60) : null,
              timestamp: new Date()
            });

            // Also send to dashboard subscribers (using User ID)
            this.notifyDashboard(driverUserId, "location_reminder", {
              type: warningType,
              message: message,
              requiresAction: warningType !== "location_update_needed",
              timestamp: new Date()
            });
          }
        }
      } catch (error) {
        console.error("Error in driver location polling:", error);
      }
    }, 60000); // Check every 60 seconds

    console.log("Driver location polling started - checking every 60 seconds");
  }

  /**
   * Stop driver location polling
   */
  stopDriverLocationPolling() {
    if (this.driverLocationCheckInterval) {
      clearInterval(this.driverLocationCheckInterval);
      this.driverLocationCheckInterval = null;
      console.log("Driver location polling stopped");
    }
  }

  /**
   * Get count of connected WebSocket users
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    const stats = {
      totalConnected: this.connectedUsers?.size || 0,
      users: []
    };

    if (this.connectedUsers) {
      this.connectedUsers.forEach((info, socketId) => {
        stats.users.push({
          socketId,
          ...info,
          connectedFor: Math.round((Date.now() - info.connectedAt) / 1000) + ' seconds'
        });
      });
    }

    return stats;
  }

  /**
   * Log current connection status to console
   */
  logConnectionStatus() {
    const stats = this.getConnectionStats();
    console.log(`\n📡 [WEBSOCKET STATUS]`);
    console.log(`   Total Connected: ${stats.totalConnected}`);
    if (stats.users.length > 0) {
      console.log(`   Connected Users:`);
      stats.users.forEach(u => {
        console.log(`     - ${u.userName} (${u.userRole}) - ${u.connectedFor}`);
      });
    }
    console.log('');
  }

  /**
   * Update driver location from WebSocket connection
   * @param {string} userId - User ID (not driver ID)
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {number} heading - Heading direction (optional)
   * @param {number} speed - Speed in km/h (optional)
   */
  async updateDriverLocationFromSocket(userId, latitude, longitude, heading = 0, speed = 0) {
    const Driver = require("../models/Driver");
    const LiveLocation = require("../models/LiveLocation");

    try {
      // Find driver by user ID
      const driver = await Driver.findOne({ user: userId });
      
      if (!driver) {
        console.log(`DEBUG [SocketLocation]: No driver found for user ${userId}`);
        throw new Error("Driver profile not found");
      }

      // Only update location if driver is online
      if (driver.status !== "online") {
        console.log(`DEBUG [SocketLocation]: Driver ${driver._id} is not online (status: ${driver.status})`);
        return; // Silently ignore location updates from offline drivers
      }

      const locationData = {
        driver: driver._id,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        heading: heading ? parseFloat(heading) : 0,
        speed: speed ? parseFloat(speed) : 0,
        timestamp: new Date(),
      };

      // Upsert location
      const locationResult = await LiveLocation.findOneAndUpdate(
        { driver: driver._id },
        locationData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`DEBUG [SocketLocation]: Location updated for driver ${driver._id}:`, {
        lat: locationResult.latitude,
        lng: locationResult.longitude,
        timestamp: locationResult.timestamp
      });

      // Notify nearby riders about driver location update
      await this.notifyNearbyRidersAboutDriverUpdate(driver._id.toString(), {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
      });

      // Notify subscribers of active rides about location updates
      await this.notifyRideSubscribersAboutDriverLocation(driver._id.toString(), {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
        timestamp: locationData.timestamp,
      });

      return locationResult;
    } catch (error) {
      console.error("Error updating driver location from socket:", error);
      throw error;
    }
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
      const { verifyToken } = require("../utils/jwt");

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
        // Check if driver is online, approved, and active as per BACKEND_CHANGES_REQUIRED.md
        if (
          !location.driver ||
          location.driver.status !== "online" ||
          location.driver.isApproved !== "approved" ||
          location.driver.activeStatus !== "active"
        ) {
          continue;
        }

        // Check if driver is within Surrey boundary (disabled for testing)
        if (!isInSurrey(location.latitude, location.longitude)) {
          // For testing: Allow drivers outside boundary
          // In production, uncomment the following:
          // continue;
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

    // Also send real-time status update to all subscribers of this ride
    this.notifyRideStatusSubscribers(rideData._id, status, rideData);
  }

  /**
   * Notify all subscribers of a ride about status changes
   * @param {string} rideId - Ride ID
   * @param {string} status - New ride status
   * @param {Object} rideData - Ride data
   */
  notifyRideStatusSubscribers(rideId, status, rideData) {
    if (this.io) {
      // Find all rooms that match the pattern for this ride
      const rideStatusRooms = Array.from(
        this.io.sockets.adapter.rooms.keys()
      ).filter((room) => room.startsWith(`ride_status_${rideId}_`));

      rideStatusRooms.forEach((room) => {
        this.io.to(room).emit("ride_status_change", {
          rideId,
          status,
          ...rideData,
          timestamp: new Date(),
        });
      });

      if (rideStatusRooms.length > 0) {
        console.log(
          `Ride status change notified to ${rideStatusRooms.length} subscribers for ride ${rideId}`
        );
      }
    }
  }

  /**
   * Notify driver about new ride request
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {Object} rideData - Ride request data
   */
  async notifyRideRequest(driverId, rideData) {
    // Convert Driver ID to User ID for proper socket targeting
    const userId = await this.getDriverUserId(driverId);
    
    // Calculate expiry time (30 seconds from now as per BACKEND_CHANGES_REQUIRED.md)
    const expiresAt = new Date(Date.now() + 30 * 1000);
    
    // Format ride request as per specification
    const rideRequestPayload = {
      rideId: rideData._id,
      riderId: rideData.rider?._id || rideData.rider,
      riderName: rideData.rider?.fullName || rideData.riderName || "Unknown Rider",
      pickup: {
        latitude: rideData.pickup?.latitude || rideData.pickup?.lat,
        longitude: rideData.pickup?.longitude || rideData.pickup?.lng,
        address: rideData.pickup?.address || "Unknown"
      },
      dropoff: {
        latitude: rideData.dropoff?.latitude || rideData.dropoff?.lat,
        longitude: rideData.dropoff?.longitude || rideData.dropoff?.lng,
        address: rideData.dropoff?.address || "Unknown"
      },
      distance: rideData.estimatedDistance || rideData.distance || 0, // km
      fare: rideData.estimatedFare || rideData.fare || 0,
      estimatedFare: rideData.estimatedFare || rideData.fare || 0,
      vehicleType: rideData.vehicleType || "sedan",
      expiresAt: expiresAt.toISOString(),
      timeLeft: 30, // seconds
      timestamp: new Date().toISOString()
    };

    this.notifyUser(userId, "ride_request", rideRequestPayload);
    
    // Also send to driver's dashboard (using User ID)
    this.notifyDashboard(userId, "ride_request", rideRequestPayload);
    
    console.log(`Ride request sent to driver ${driverId} (user: ${userId}): ride ${rideData._id}`);
  }

  /**
   * Notify driver that ride was taken by another driver
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {string} rideId - Ride ID
   */
  async notifyRideTaken(driverId, rideId) {
    const userId = await this.getDriverUserId(driverId);
    this.notifyUser(userId, "ride_taken", { rideId });
  }

  /**
   * Notify rider about driver assignment
   * @param {string} riderId - Rider ID
   * @param {Object} driverData - Driver information
   * @param {Object} rideData - Ride data
   */
  notifyDriverAssigned(riderId, driverData, rideData) {
    if (!driverData) {
      console.error(
        "Driver data is null in notifyDriverAssigned for rider",
        riderId
      );
      return;
    }
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
   * Get User ID from Driver ID
   * Socket rooms are joined using User ID (from JWT), but many functions receive Driver ID
   * This helper converts Driver ID to User ID for proper notification delivery
   * @param {string} driverId - Driver ID (can be Driver._id or User._id)
   * @returns {Promise<string|null>} User ID or null if not found
   */
  async getDriverUserId(driverId) {
    try {
      const Driver = require("../models/Driver");
      
      // First check if this is already a User ID by looking for a driver with this user field
      let driver = await Driver.findOne({ user: driverId }).select("user");
      if (driver) {
        return driverId; // It's already a User ID
      }
      
      // Otherwise, try to find driver by _id
      driver = await Driver.findById(driverId).select("user");
      if (driver && driver.user) {
        return driver.user.toString();
      }
      
      // Return the original ID as fallback (might already be correct)
      return driverId;
    } catch (error) {
      console.error("Error getting driver user ID:", error);
      return driverId; // Return original as fallback
    }
  }

  /**
   * Notify driver about dashboard data updates
   * @param {string} driverId - Driver ID (will be converted to User ID for socket delivery)
   * @param {Object} updateData - Updated dashboard data
   * @param {string} updateType - Type of update (earnings, status, nearby_rides, etc.)
   */
  async notifyDriverDashboardUpdate(driverId, updateData, updateType = "general") {
    const notificationData = {
      updateType,
      data: updateData,
      timestamp: new Date(),
    };

    // Convert Driver ID to User ID for proper socket room targeting
    const userId = await this.getDriverUserId(driverId);
    
    // Send to user's personal room (using User ID)
    this.notifyUser(userId, "dashboard_update", notificationData);

    // Also send to dashboard subscribers (using User ID)
    this.notifyDashboard(userId, "dashboard_update", notificationData);
  }

  /**
   * Notify driver about earnings update
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {Object} earningsData - Updated earnings information
   */
  async notifyDriverEarningsUpdate(driverId, earningsData) {
    // Convert Driver ID to User ID
    const userId = await this.getDriverUserId(driverId);
    
    // Send to dashboard subscribers
    await this.notifyDriverDashboardUpdate(
      driverId,
      {
        earnings: earningsData,
      },
      "earnings"
    );

    // Also send to earnings subscribers (using User ID)
    if (this.io) {
      this.io.to(`earnings_${userId}`).emit("earnings_update", {
        ...earningsData,
        timestamp: new Date(),
      });
      console.log(`Earnings update sent to driver ${driverId} (user: ${userId})`);
    }
  }

  /**
   * Notify driver about nearby ride requests
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {Array} rideRequests - Array of nearby ride requests
   */
  async notifyNearbyRideRequests(driverId, rideRequests) {
    await this.notifyDriverDashboardUpdate(
      driverId,
      {
        nearbyRideRequests: rideRequests,
      },
      "nearby_rides"
    );
  }

  /**
   * Notify driver about nearby drivers update
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {Array} nearbyDrivers - Array of nearby drivers
   */
  async notifyNearbyDriversUpdate(driverId, nearbyDrivers) {
    await this.notifyDriverDashboardUpdate(
      driverId,
      {
        nearbyDrivers: nearbyDrivers,
      },
      "nearby_drivers"
    );
  }

  /**
   * Notify driver about status change
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {string} newStatus - New driver status
   */
  async notifyDriverStatusUpdate(driverId, newStatus) {
    await this.notifyDriverDashboardUpdate(
      driverId,
      {
        status: newStatus,
      },
      "status"
    );
  }

  /**
   * Notify driver about profile update
   * @param {string} driverId - Driver ID (will be converted to User ID)
   * @param {Object} updateData - Profile update data
   */
  async notifyDriverProfileUpdate(driverId, updateData) {
    const userId = await this.getDriverUserId(driverId);
    this.notifyUser(userId, "profile_update", {
      ...updateData,
      timestamp: new Date(),
    });
    console.log(`Profile update notification sent to driver ${driverId} (user: ${userId})`);
  }

  /**
   * Notify rider about status change
   * @param {string} riderId - Rider ID
   * @param {string} newStatus - New rider status
   */
  notifyRiderStatusUpdate(riderId, newStatus) {
    this.notifyRiderDashboardUpdate(
      riderId,
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
   * Notify ride subscribers about driver location updates
   * As per BACKEND_CHANGES_REQUIRED.md specification
   * @param {string} driverId - Driver ID
   * @param {Object} driverLocation - Driver location data
   */
  async notifyRideSubscribersAboutDriverLocation(driverId, driverLocation) {
    try {
      const Ride = require("../models/Ride");

      // Find all active rides for this driver (including in_progress as per spec)
      const activeRides = await Ride.find({
        driver: driverId,
        status: { $in: ["assigned", "accepted", "arrived", "in_progress"] },
      }).select("_id rider");

      if (activeRides.length === 0) return;

      // For each active ride, notify both rider and driver subscribers
      for (const ride of activeRides) {
        const rideId = ride._id.toString();
        const riderId = ride.rider.toString();

        // Format as per BACKEND_CHANGES_REQUIRED.md specification
        const locationPayload = {
          rideId,
          driverId,
          latitude: driverLocation.latitude,
          longitude: driverLocation.longitude,
          heading: driverLocation.heading || 0,
          speed: driverLocation.speed || 0,
          timestamp: new Date().toISOString()
        };

        // Emit driver_location_update to ride room as per spec
        this.io.to(`ride_${rideId}`).emit("driver_location_update", locationPayload);

        // Also notify rider subscribers directly
        this.io.to(`ride_status_${rideId}_${riderId}`).emit("driver_location_update", locationPayload);

        // Notify driver subscribers (if driver is also subscribed)
        this.io.to(`ride_status_${rideId}_${driverId}`).emit("driver_location_update", locationPayload);

        console.log(`Driver location update sent for ride ${rideId}`);
      }
    } catch (error) {
      console.error(
        "Error notifying ride subscribers about driver location:",
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
   * Notify rider about ride history updates
   * @param {string} riderId - Rider ID
   * @param {Object} historyUpdate - History update data
   */
  notifyRideHistoryUpdate(riderId, historyUpdate) {
    if (this.io) {
      this.io.to(`ride_history_${riderId}`).emit("ride_history_update", {
        ...historyUpdate,
        timestamp: new Date(),
      });
      console.log(`Ride history update sent to rider ${riderId}`);
    }
  }

  /**
   * Subscribe rider to real-time ride history updates
   * @param {string} riderId - Rider ID
   */
  subscribeToRideHistoryUpdates(riderId) {
    if (this.io) {
      // Join ride history updates room
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.rooms.has(riderId)) {
          socket.join(`ride_history_${riderId}`);
          console.log(`Rider ${riderId} subscribed to ride history updates`);
        }
      });
    }
  }

  /**
   * Subscribe driver to real-time earnings updates
   * @param {string} driverId - Driver ID
   */
  subscribeToEarningsUpdates(driverId) {
    if (this.io) {
      // Join earnings updates room
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.rooms.has(driverId)) {
          socket.join(`earnings_${driverId}`);
          console.log(`Driver ${driverId} subscribed to earnings updates`);
        }
      });
    }
  }

  /**
   * Unsubscribe rider from ride history updates
   * @param {string} riderId - Rider ID
   */
  unsubscribeFromRideHistoryUpdates(riderId) {
    if (this.io) {
      // Leave ride history updates room
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.rooms.has(riderId)) {
          socket.leave(`ride_history_${riderId}`);
          console.log(
            `Rider ${riderId} unsubscribed from ride history updates`
          );
        }
      });
    }
  }

  /**
   * Notify nearby riders about driver status changes
   * @param {string} driverId - Driver ID
   * @param {string} newStatus - New driver status
   * @param {Object} driverInfo - Driver information
   */
  async notifyNearbyRidersAboutDriverStatus(driverId, newStatus, driverInfo) {
    try {
      // Only notify when driver goes online or offline (most relevant for riders)
      if (newStatus !== "online" && newStatus !== "offline") {
        return;
      }

      // Get driver's last known location
      const LiveLocation = require("../models/LiveLocation");
      const recentLocation = await LiveLocation.findOne({
        driver: driverId,
        timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
      }).sort({ timestamp: -1 });

      if (!recentLocation) {
        return; // No recent location, can't notify nearby riders
      }

      // Get all rider dashboard subscribers
      if (this.io) {
        const rooms = Array.from(this.io.sockets.adapter.rooms.keys()).filter(
          (room) => room.startsWith("rider_dashboard_")
        );

        // For each rider room, check if the driver is nearby and send status update
        for (const room of rooms) {
          const riderId = room.replace("rider_dashboard_", "");

          // Calculate distance from rider's location (if available) or just broadcast
          // For now, we'll broadcast to all subscribed riders
          // In production, you'd filter based on stored rider locations

          const nearbyDriversUpdate = {
            driverId: driverId,
            status: newStatus,
            vehicleType: driverInfo.vehicleType || "sedan",
            lastLocation: {
              latitude: recentLocation.latitude,
              longitude: recentLocation.longitude,
            },
            timestamp: new Date(),
          };

          this.notifyRiderNearbyDriversUpdate(riderId, [nearbyDriversUpdate]);
        }
      }
    } catch (error) {
      console.error(
        "Error notifying nearby riders about driver status change:",
        error
      );
    }
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
   * Notify user about rewards balance update
   * @param {string} userId - User ID
   * @param {Object} balanceData - Updated balance data
   */
  notifyRewardsBalanceUpdate(userId, balanceData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("rewards_balance_update", {
        balance: balanceData,
        timestamp: new Date(),
      });
      console.log(`Rewards balance update sent to user ${userId}`);
    }
  }

  /**
   * Notify user about rewards tier upgrade
   * @param {string} userId - User ID
   * @param {Object} tierData - New tier information
   */
  notifyRewardsTierUpgrade(userId, tierData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("rewards_tier_upgrade", {
        tier: tierData,
        timestamp: new Date(),
      });
      console.log(`Rewards tier upgrade notification sent to user ${userId}`);
    }
  }

  /**
   * Notify user about expiring points
   * @param {string} userId - User ID
   * @param {Object} expiringData - Expiring points data
   */
  notifyRewardsExpiringSoon(userId, expiringData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("rewards_expiring_soon", {
        expiring: expiringData,
        timestamp: new Date(),
      });
      console.log(`Rewards expiring soon alert sent to user ${userId}`);
    }
  }

  /**
   * Notify user about new rewards available
   * @param {string} userId - User ID
   * @param {Object} rewardsData - New rewards data
   */
  notifyRewardsNewAvailable(userId, rewardsData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("rewards_new_available", {
        rewards: rewardsData,
        timestamp: new Date(),
      });
      console.log(`New rewards available notification sent to user ${userId}`);
    }
  }

  /**
   * Notify user about successful reward redemption
   * @param {string} userId - User ID
   * @param {Object} redemptionData - Redemption data
   */
  notifyRewardsRedemptionSuccess(userId, redemptionData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("rewards_redemption_success", {
        redemption: redemptionData,
        timestamp: new Date(),
      });
      console.log(
        `Rewards redemption success notification sent to user ${userId}`
      );
    }
  }

  /**
   * Notify user about referral information update
   * @param {string} userId - User ID
   * @param {Object} referralData - Referral information data
   */
  notifyReferralInfoUpdate(userId, referralData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("referral_info_update", {
        referral: referralData,
        timestamp: new Date(),
      });
      console.log(`Referral info update notification sent to user ${userId}`);
    }
  }

  /**
   * Notify user about referral points earned
   * @param {string} userId - User ID
   * @param {Object} referralPointsData - Referral points earned data
   */
  notifyReferralPointsEarned(userId, referralPointsData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("referral_points_earned", {
        referralPoints: referralPointsData,
        timestamp: new Date(),
      });
      console.log(`Referral points earned notification sent to user ${userId}`);
    }
  }

  /**
   * Notify user that their referral code was used
   * @param {string} userId - User ID (referrer)
   * @param {Object} referralUsedData - Referral code usage data
   */
  notifyReferralCodeUsed(userId, referralUsedData) {
    if (this.io) {
      this.io.to(`rewards_${userId}`).emit("referral_code_used", {
        referralUsed: referralUsedData,
        timestamp: new Date(),
      });
      console.log(`Referral code used notification sent to user ${userId}`);
    }
  }

  /**
   * Notify admins about driver status changes
   * @param {Object} driverData - Driver data
   * @param {string} newStatus - New driver status
   */
  async notifyAdminDriverStatusUpdate(driverData, newStatus) {
    if (this.io) {
      try {
        // Populate driver data if not already populated
        const populatedDriver = await driverData.populate([
          { path: "user", select: "fullName email phone" },
        ]);

        // Emit to all admin users (admin, superadmin, subadmin)
        this.io.emit("admin_driver_status_update", {
          driverId: populatedDriver._id,
          userId: populatedDriver.user?._id,
          status: newStatus,
          driverInfo: {
            fullName: populatedDriver.user?.fullName || "N/A",
            email: populatedDriver.user?.email || "N/A",
            phone: populatedDriver.user?.phone || "N/A",
            vehicleType: populatedDriver.vehicleType || "N/A",
            vehicle: populatedDriver.vehicle || "N/A",
            rating: populatedDriver.rating || 5.0,
            isApproved: populatedDriver.isApproved,
          },
          updatedAt: new Date(),
        });
        console.log(
          `Admin notification sent for driver ${populatedDriver._id} status: ${newStatus}`
        );
      } catch (error) {
        console.error(
          "Error sending admin driver status update notification:",
          error
        );
      }
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

  /**
   * Subscribe rider to real-time active ride updates
   * @param {string} riderId - Rider ID
   * @param {string} rideId - Active ride ID
   */
  subscribeToActiveRide(riderId, rideId) {
    if (this.io) {
      // Join active ride room for real-time updates
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.rooms.has(riderId)) {
          socket.join(`active_ride_${rideId}`);
          console.log(
            `Rider ${riderId} subscribed to active ride ${rideId} updates`
          );
        }
      });

      // Start periodic updates for this ride
      this.startActiveRideUpdates(rideId);
    }
  }

  /**
   * Subscribe user to real-time ride status updates
   * @param {string} userId - User ID (rider or driver)
   * @param {string} rideId - Ride ID
   */
  subscribeToRideStatusUpdates(userId, rideId) {
    if (this.io) {
      // Join ride status updates room
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.rooms.has(userId)) {
          socket.join(`ride_status_${rideId}_${userId}`);
          console.log(
            `User ${userId} subscribed to ride ${rideId} status updates`
          );
        }
      });

      // Start periodic status updates for this ride and user
      this.startRideStatusUpdates(rideId, userId);
    }
  }

  /**
   * Unsubscribe rider from active ride updates
   * @param {string} riderId - Rider ID
   */
  unsubscribeFromActiveRide(riderId) {
    if (this.io) {
      // Leave all active ride rooms for this rider
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.rooms.has(riderId)) {
          Array.from(socket.rooms)
            .filter((room) => room.startsWith("active_ride_"))
            .forEach((room) => {
              socket.leave(room);
              console.log(`Rider ${riderId} unsubscribed from ${room}`);
            });
        }
      });
    }
  }

  /**
   * Start periodic real-time updates for active ride
   * @param {string} rideId - Ride ID
   */
  startActiveRideUpdates(rideId) {
    // Clear any existing interval for this ride
    if (this.activeRideIntervals.has(rideId)) {
      clearInterval(this.activeRideIntervals.get(rideId));
      this.activeRideIntervals.delete(rideId);
    }

    // Send updates every 10 seconds for active rides
    this.activeRideIntervals.set(
      rideId,
      setInterval(async () => {
        try {
          await this.sendActiveRideUpdate(rideId);
        } catch (error) {
          console.error(
            `Error sending active ride update for ${rideId}:`,
            error
          );
          // Clear interval on persistent errors
          clearInterval(this.activeRideIntervals.get(rideId));
          this.activeRideIntervals.delete(rideId);
        }
      }, 10000)
    ); // 10 seconds
  }

  /**
   * Send real-time update for active ride
   * @param {string} rideId - Ride ID
   */
  async sendActiveRideUpdate(rideId) {
    try {
      const Ride = require("../models/Ride");
      const LiveLocation = require("../models/LiveLocation");

      // Get the ride with current data
      const ride = await Ride.findById(rideId).populate({
        path: "driver",
        populate: [
          { path: "user", select: "fullName phone" },
          { path: "vehicle" },
        ],
      });

      if (
        !ride ||
        !["assigned", "accepted", "in_progress"].includes(ride.status)
      ) {
        // Ride is no longer active, stop updates
        if (this.activeRideIntervals.has(rideId)) {
          clearInterval(this.activeRideIntervals.get(rideId));
          this.activeRideIntervals.delete(rideId);
        }
        return;
      }

      let driverLocation = null;
      let pickupEta = null;
      let dropoffEta = null;
      let currentFare = ride.fare || ride.estimatedFare || 0;
      let fareBreakdown = null;

      // Get driver's current location if available
      if (ride.driver) {
        const recentLocation = await LiveLocation.findOne({
          driver: ride.driver._id,
          timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
        }).sort({ timestamp: -1 });

        if (recentLocation) {
          driverLocation = {
            lat: recentLocation.latitude,
            lng: recentLocation.longitude,
            heading: recentLocation.heading || 0,
            speed: recentLocation.speed || 0,
            timestamp: recentLocation.timestamp,
          };

          // Calculate ETAs
          if (ride.status === "assigned" && ride.pickup) {
            const distanceToPickup = calculateDistance(
              driverLocation.lat,
              driverLocation.lng,
              ride.pickup.lat,
              ride.pickup.lng
            );
            pickupEta = calculateETA(
              distanceToPickup,
              driverLocation.speed || 30
            );
          }

          if (ride.status === "in_progress" && ride.dropoff) {
            const distanceToDropoff = calculateDistance(
              driverLocation.lat,
              driverLocation.lng,
              ride.dropoff.lat,
              ride.dropoff.lng
            );
            dropoffEta = calculateETA(
              distanceToDropoff,
              driverLocation.speed || 30
            );
          }
        }
      }

      // Calculate real-time fare for in-progress rides
      if (ride.status === "in_progress" && ride.startTime) {
        const timeElapsed = (new Date() - ride.startTime) / (1000 * 60); // minutes

        const baseFare = ride.estimatedFare || 0;
        const timeFare =
          timeElapsed *
          (ride.vehicleType === "sedan"
            ? 0.25
            : ride.vehicleType === "SUV"
            ? 0.35
            : 0.3);
        const distanceFare =
          (ride.actualDistance || ride.estimatedDistance || 0) *
          (ride.vehicleType === "sedan"
            ? 1.5
            : ride.vehicleType === "SUV"
            ? 2.0
            : 1.75);

        const subtotal = baseFare + distanceFare + timeFare;
        const tax = subtotal * 0.2; // 20% VAT
        currentFare = Math.max(
          subtotal + tax,
          ride.vehicleType === "sedan"
            ? 8.0
            : ride.vehicleType === "SUV"
            ? 10.0
            : 9.0
        );

        fareBreakdown = {
          baseFare: Math.round(baseFare * 100) / 100,
          distanceFare: Math.round(distanceFare * 100) / 100,
          timeFare: Math.round(timeFare * 100) / 100,
          subtotal: Math.round(subtotal * 100) / 100,
          tax: Math.round(tax * 100) / 100,
          total: Math.round(currentFare * 100) / 100,
        };
      }

      // Prepare update data
      const updateData = {
        rideId: ride._id,
        status: ride.status,
        driverLocation,
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
        lastUpdated: new Date(),
      };

      // Send update to active ride room
      this.io
        .to(`active_ride_${rideId}`)
        .emit("active_ride_update", updateData);
      console.log(`Active ride update sent for ride ${rideId}`);
    } catch (error) {
      console.error(`Error preparing active ride update for ${rideId}:`, error);
    }
  }

  /**
   * Stop active ride updates when ride is completed/cancelled
   * @param {string} rideId - Ride ID
   */
  stopActiveRideUpdates(rideId) {
    if (this.activeRideIntervals.has(rideId)) {
      clearInterval(this.activeRideIntervals.get(rideId));
      this.activeRideIntervals.delete(rideId);
      console.log(`Stopped active ride updates for ride ${rideId}`);
    }

    // Also stop all ride status updates for this ride
    this.stopAllRideStatusUpdates(rideId);
  }

  /**
   * Stop all ride status updates for a specific ride
   * @param {string} rideId - Ride ID
   */
  stopAllRideStatusUpdates(rideId) {
    // Find all intervals for this ride
    const intervalsToStop = Array.from(this.activeRideIntervals.keys()).filter(
      (key) => key.startsWith(`ride_status_${rideId}_`)
    );

    intervalsToStop.forEach((intervalKey) => {
      clearInterval(this.activeRideIntervals.get(intervalKey));
      this.activeRideIntervals.delete(intervalKey);
      console.log(`Stopped ride status updates for ${intervalKey}`);
    });
  }

  /**
   * Start periodic ride status updates for a specific user
   * @param {string} rideId - Ride ID
   * @param {string} userId - User ID
   */
  startRideStatusUpdates(rideId, userId) {
    const intervalKey = `ride_status_${rideId}_${userId}`;

    // Clear any existing interval for this user and ride
    if (this.activeRideIntervals.has(intervalKey)) {
      clearInterval(this.activeRideIntervals.get(intervalKey));
      this.activeRideIntervals.delete(intervalKey);
    }

    // Send updates every 10 seconds for ride status
    this.activeRideIntervals.set(
      intervalKey,
      setInterval(async () => {
        try {
          await this.sendRideStatusUpdate(rideId, userId);
        } catch (error) {
          console.error(
            `Error sending ride status update for ride ${rideId}, user ${userId}:`,
            error
          );
          // Clear interval on persistent errors
          clearInterval(this.activeRideIntervals.get(intervalKey));
          this.activeRideIntervals.delete(intervalKey);
        }
      }, 10000)
    ); // 10 seconds
  }

  /**
   * Send real-time ride status update to a specific user
   * @param {string} rideId - Ride ID
   * @param {string} userId - User ID
   */
  async sendRideStatusUpdate(rideId, userId) {
    try {
      const Ride = require("../models/Ride");
      const LiveLocation = require("../models/LiveLocation");

      // Get the ride with current data
      const ride = await Ride.findById(rideId).populate({
        path: "driver",
        populate: [
          { path: "user", select: "fullName phone" },
          { path: "vehicle" },
        ],
      });

      if (
        !ride ||
        !["assigned", "accepted", "in_progress"].includes(ride.status)
      ) {
        // Ride is no longer active, stop updates
        this.stopRideStatusUpdates(rideId, userId);
        return;
      }

      let driverLocation = null;
      let pickupEta = null;
      let dropoffEta = null;
      let currentFare = ride.fare || ride.estimatedFare || 0;
      let fareBreakdown = null;
      let remainingDistance = null;

      // Get driver's current location if available
      if (ride.driver) {
        const recentLocation = await LiveLocation.findOne({
          driver: ride.driver._id,
          timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
        }).sort({ timestamp: -1 });

        if (recentLocation) {
          driverLocation = {
            lat: recentLocation.latitude,
            lng: recentLocation.longitude,
            heading: recentLocation.heading || 0,
            speed: recentLocation.speed || 0,
            timestamp: recentLocation.timestamp,
          };

          // Calculate ETAs
          if (ride.status === "assigned" && ride.pickup) {
            const distanceToPickup = calculateDistance(
              driverLocation.lat,
              driverLocation.lng,
              ride.pickup.lat,
              ride.pickup.lng
            );
            pickupEta = calculateETA(
              distanceToPickup,
              driverLocation.speed || 30
            );
          }

          if (ride.status === "in_progress" && ride.dropoff) {
            const distanceToDropoff = calculateDistance(
              driverLocation.lat,
              driverLocation.lng,
              ride.dropoff.lat,
              ride.dropoff.lng
            );
            dropoffEta = calculateETA(
              distanceToDropoff,
              driverLocation.speed || 30
            );
            remainingDistance = distanceToDropoff;
          }
        }
      }

      // Calculate real-time fare for in-progress rides
      if (ride.status === "in_progress" && ride.startTime) {
        const timeElapsed = (new Date() - ride.startTime) / (1000 * 60); // minutes

        const baseFare = ride.estimatedFare || 0;
        const timeFare =
          timeElapsed *
          (ride.vehicleType === "sedan"
            ? 0.25
            : ride.vehicleType === "SUV"
            ? 0.35
            : 0.3);
        const distanceFare =
          (ride.actualDistance || ride.estimatedDistance || 0) *
          (ride.vehicleType === "sedan"
            ? 1.5
            : ride.vehicleType === "SUV"
            ? 2.0
            : 1.75);

        const subtotal = baseFare + distanceFare + timeFare;
        const tax = subtotal * 0.2; // 20% VAT
        currentFare = Math.max(
          subtotal + tax,
          ride.vehicleType === "sedan"
            ? 8.0
            : ride.vehicleType === "SUV"
            ? 10.0
            : 9.0
        );

        fareBreakdown = {
          baseFare: Math.round(baseFare * 100) / 100,
          distanceFare: Math.round(distanceFare * 100) / 100,
          timeFare: Math.round(timeFare * 100) / 100,
          subtotal: Math.round(subtotal * 100) / 100,
          tax: Math.round(tax * 100) / 100,
          total: Math.round(currentFare * 100) / 100,
        };
      }

      // Prepare update data
      const updateData = {
        rideId: ride._id,
        status: ride.status,
        driverLocation,
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
        lastUpdated: new Date(),
      };

      // Send update to user's ride status room
      this.io
        .to(`ride_status_${rideId}_${userId}`)
        .emit("ride_status_update", updateData);
      console.log(
        `Ride status update sent for ride ${rideId} to user ${userId}`
      );
    } catch (error) {
      console.error(
        `Error preparing ride status update for ride ${rideId}, user ${userId}:`,
        error
      );
    }
  }

  /**
   * Stop ride status updates for a specific user
   * @param {string} rideId - Ride ID
   * @param {string} userId - User ID
   */
  stopRideStatusUpdates(rideId, userId) {
    const intervalKey = `ride_status_${rideId}_${userId}`;
    if (this.activeRideIntervals.has(intervalKey)) {
      clearInterval(this.activeRideIntervals.get(intervalKey));
      this.activeRideIntervals.delete(intervalKey);
      console.log(
        `Stopped ride status updates for ride ${rideId}, user ${userId}`
      );
    }
  }

  /**
   * Notify all riders about new reward added to system
   * @param {Object} rewardData - New reward information
   */
  notifyAllRidersNewRewardAdded(rewardData) {
    if (this.io) {
      // Emit to all rewards rooms (all subscribed riders)
      this.io.to(/^rewards_/).emit("new_reward_added", {
        reward: rewardData,
        timestamp: new Date(),
      });
      console.log(`New reward notification sent to all riders`);
    }
  }

  /**
   * Notify all riders about reward updated
   * @param {Object} rewardData - Updated reward information
   */
  notifyAllRidersRewardUpdated(rewardData) {
    if (this.io) {
      // Emit to all rewards rooms (all subscribed riders)
      this.io.to(/^rewards_/).emit("reward_updated", {
        reward: rewardData,
        timestamp: new Date(),
      });
      console.log(`Reward update notification sent to all riders`);
    }
  }

  /**
   * Notify all riders about reward removed/unavailable
   * @param {string} rewardId - ID of removed reward
   */
  notifyAllRidersRewardRemoved(rewardId) {
    if (this.io) {
      // Emit to all rewards rooms (all subscribed riders)
      this.io.to(/^rewards_/).emit("reward_removed", {
        rewardId: rewardId,
        timestamp: new Date(),
      });
      console.log(`Reward removal notification sent to all riders`);
    }
  }

  /**
   * Notify rider about points earned in real-time
   * @param {string} riderId - Rider ID
   * @param {Object} pointsData - Points earned information
   */
  notifyRiderPointsEarned(riderId, pointsData) {
    if (this.io) {
      this.io.to(`rewards_${riderId}`).emit("points_earned", {
        points: pointsData,
        timestamp: new Date(),
      });
      console.log(`Points earned notification sent to rider ${riderId}`);
    }
  }

  /**
   * Notify rider about reward redemption failed
   * @param {string} riderId - Rider ID
   * @param {Object} failureData - Failure reason and details
   */
  notifyRiderRedemptionFailed(riderId, failureData) {
    if (this.io) {
      this.io.to(`rewards_${riderId}`).emit("reward_redemption_failed", {
        failure: failureData,
        timestamp: new Date(),
      });
      console.log(`Redemption failure notification sent to rider ${riderId}`);
    }
  }

  /**
   * Notify user about settings update
   * @param {string} userId - User ID
   * @param {Object} settingsData - Updated settings data
   */
  notifySettingsUpdated(userId, settingsData) {
    this.notifyUser(userId, "settings_update", {
      settings: settingsData,
      timestamp: new Date(),
    });
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService;
