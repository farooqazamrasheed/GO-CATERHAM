const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const socketService = require("../services/socketService");

/**
 * Ride Request Manager - Handles automatic rejection and real-time delivery
 */
class RideRequestManager {
  constructor() {
    this.activeTimers = new Map(); // rideId -> timeout
    this.requestQueue = new Map(); // rideId -> driver queue
  }

  /**
   * Start a ride request with automatic rejection timer
   * @param {string} rideId - Ride ID
   * @param {Array} availableDrivers - Array of driver IDs to notify
   */
  startRideRequest(rideId, availableDrivers = []) {
    // Clear any existing timer for this ride
    this.clearTimer(rideId);

    // Set up automatic rejection after 15 seconds
    const timer = setTimeout(async () => {
      await this.autoRejectRide(rideId);
    }, 15000); // 15 seconds

    this.activeTimers.set(rideId, timer);
    this.requestQueue.set(rideId, [...availableDrivers]);

    console.log(`Started ride request ${rideId} with 15-second timer`);
  }

  /**
   * Accept a ride request (clear timer and assign driver)
   * @param {string} rideId - Ride ID
   * @param {string} driverId - Driver ID who accepted
   */
  async acceptRide(rideId, driverUserId) {
    // Clear the timer
    this.clearTimer(rideId);

    try {
      // Find the driver document by user ID
      const driver = await Driver.findOne({ user: driverUserId });
      if (!driver) {
        throw new Error("Driver not found");
      }

      // Update ride status
      await Ride.findByIdAndUpdate(rideId, {
        status: "accepted",
        driver: driver._id, // Use driver document ID, not user ID
        acceptedAt: new Date(),
      });

      // Fetch the updated ride with populated fields
      const ride = await Ride.findById(rideId).populate([
        { path: "rider" },
        {
          path: "driver",
          populate: { path: "user", select: "fullName phone" },
        },
      ]);

      console.log(
        "DEBUG: Ride populated rider:",
        ride.rider,
        "type:",
        typeof ride.rider,
        "toString:",
        ride.rider.toString()
      );

      // Update driver status to busy
      await Driver.findByIdAndUpdate(driver._id, { status: "busy" });

      // Notify admins about ride status change
      await socketService.notifyAdminRideUpdate(ride);

      console.log(`Ride ${rideId} accepted by driver ${driverUserId}`);

      // Send real-time notification to rider
      const riderId = ride.rider._id
        ? ride.rider._id.toString()
        : ride.rider.toString();
      console.log("DEBUG: Using riderId:", riderId);
      socketService.notifyDriverAssigned(riderId, ride.driver, ride);

      // Send real-time notification to other drivers (ride taken)
      const otherDrivers = this.requestQueue.get(rideId) || [];
      console.log("DEBUG: Other drivers in queue:", otherDrivers);
      otherDrivers.forEach((otherDriverId) => {
        if (otherDriverId !== driverUserId) {
          socketService.notifyRideTaken(otherDriverId, rideId);
        }
      });

      // Remove from queue after notifications
      this.requestQueue.delete(rideId);

      return ride;
    } catch (error) {
      console.error("Error accepting ride:", error);
      throw error;
    }
  }

  /**
   * Reject a ride request (offer to next driver)
   * @param {string} rideId - Ride ID
   * @param {string} driverId - Driver ID who rejected
   */
  async rejectRide(rideId, driverId) {
    try {
      const driverQueue = this.requestQueue.get(rideId) || [];

      // Remove this driver from queue
      const updatedQueue = driverQueue.filter((id) => id !== driverId);
      this.requestQueue.set(rideId, updatedQueue);

      // If queue is empty, auto-reject the ride
      if (updatedQueue.length === 0) {
        await this.autoRejectRide(rideId);
        return;
      }

      // Offer to next driver in queue
      const nextDriverId = updatedQueue[0];

      console.log(
        `Ride ${rideId} rejected by driver ${driverId}, offering to next driver ${nextDriverId}`
      );

      // Fetch full ride details for notification
      const ride = await Ride.findById(rideId);
      console.log("DEBUG: Sending full ride to next driver:", !!ride);

      // Send real-time notification to next driver
      socketService.notifyRideRequest(nextDriverId, ride);
    } catch (error) {
      console.error("Error rejecting ride:", error);
      throw error;
    }
  }

  /**
   * Automatically reject a ride after timeout
   * @param {string} rideId - Ride ID
   */
  async autoRejectRide(rideId) {
    try {
      // Clear timer
      this.clearTimer(rideId);

      // Update ride status
      const ride = await Ride.findByIdAndUpdate(
        rideId,
        {
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: "No driver available",
        },
        { new: true }
      );

      // Remove from queue
      this.requestQueue.delete(rideId);

      console.log(
        `Ride ${rideId} automatically rejected - no driver response within 15 seconds`
      );

      // Send notification to rider about cancellation
      const riderId = ride.rider._id
        ? ride.rider._id.toString()
        : ride.rider.toString();
      console.log("DEBUG: Auto-reject riderId:", riderId);
      socketService.notifyRideCancelled(riderId, "No driver available", ride);

      // Notify admins about ride cancellation
      await socketService.notifyAdminRideUpdate(ride);

      return ride;
    } catch (error) {
      console.error("Error auto-rejecting ride:", error);
      throw error;
    }
  }

  /**
   * Get time left for a ride request
   * @param {string} rideId - Ride ID
   * @returns {number} Seconds left (0 if expired)
   */
  getTimeLeft(rideId) {
    // This is a simplified implementation
    // In a real system, you'd track start time and calculate remaining time
    return 15; // Placeholder - would need proper implementation
  }

  /**
   * Clear timer for a ride
   * @param {string} rideId - Ride ID
   */
  clearTimer(rideId) {
    const timer = this.activeTimers.get(rideId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(rideId);
    }
  }

  /**
   * Clean up all timers (for graceful shutdown)
   */
  cleanup() {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    this.requestQueue.clear();
    console.log("RideRequestManager cleaned up");
  }

  /**
   * Get active ride requests for a driver
   * @param {string} driverId - Driver ID
   * @returns {Array} Array of active ride requests for this driver
   */
  getActiveRequestsForDriver(driverId) {
    const activeRequests = [];

    for (const [rideId, driverQueue] of this.requestQueue.entries()) {
      if (driverQueue.includes(driverId)) {
        activeRequests.push({
          rideId,
          timeLeft: this.getTimeLeft(rideId),
          position: driverQueue.indexOf(driverId) + 1,
        });
      }
    }

    return activeRequests;
  }
}

// Create singleton instance
const rideRequestManager = new RideRequestManager();

// Graceful shutdown
process.on("SIGINT", () => {
  rideRequestManager.cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  rideRequestManager.cleanup();
  process.exit(0);
});

module.exports = rideRequestManager;
