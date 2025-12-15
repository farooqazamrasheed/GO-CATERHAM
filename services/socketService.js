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

      // Handle ride-related events
      socket.on("ride_request_response", (data) => {
        console.log("Ride request response:", data);
      });

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });
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
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService;
