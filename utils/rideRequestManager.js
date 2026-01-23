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

    // Set up automatic rejection after 30 seconds
    const timer = setTimeout(async () => {
      console.log('⏰ Timeout fired for ride:', rideId);
      await this.autoRejectRide(rideId);
    }, 30000); // 30 seconds

    this.activeTimers.set(rideId, timer);
    this.requestQueue.set(rideId, [...availableDrivers]);

    console.log(`🕐 Setting timeout for ride: ${rideId} (30 seconds)`);
  }

  /**
   * Accept a ride request (clear timer and assign driver)
   * @param {string} rideId - Ride ID
   * @param {string} driverId - Driver ID who accepted
   */
  async acceptRide(rideId, driverUserId) {
    console.log('✅ Driver accepting ride:', rideId);
    console.log('🚫 Clearing timeout for ride:', rideId);
    
    // CRITICAL: Clear the timer IMMEDIATELY before doing anything else
    // This prevents race condition where timeout fires while we're updating
    this.clearTimer(rideId);
    
    // Also remove from request queue immediately
    this.requestQueue.delete(rideId);

    try {
      // Find the driver document by user ID
      const driver = await Driver.findOne({ user: driverUserId });
      if (!driver) {
        throw new Error("Driver not found");
      }

      // Update ride status to accepted when driver accepts (per doc.md requirements)
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
      // SAFETY CHECK: If ride is not in our active queue, it was already handled
      if (!this.requestQueue.has(rideId)) {
        console.log('⚠️ Ride not in queue, already handled (accepted or cancelled)');
        return null;
      }

      // Clear timer
      this.clearTimer(rideId);

      // Fetch current ride status before cancelling
      const currentRide = await Ride.findById(rideId);
      
      console.log('⏰ Timeout handler executing for ride:', rideId);
      console.log('📊 Current ride status:', currentRide?.status);
      console.log('🔍 Will cancel?', currentRide?.status === 'searching' || currentRide?.status === 'pending');
      
      // CRITICAL FIX: Only cancel if ride is still in pending/searching state
      // If driver has already accepted (status = 'accepted'), don't cancel!
      if (!currentRide) {
        console.log('⚠️ Ride not found, skipping cancellation');
        return null;
      }
      
      if (currentRide.status === 'accepted' || currentRide.status === 'going-to-pickup' || currentRide.status === 'arrived' || currentRide.status === 'in_progress' || currentRide.status === 'completed') {
        console.log('✅ Ride already accepted/in progress, skipping auto-cancellation');
        // Remove from queue but don't cancel
        this.requestQueue.delete(rideId);
        return currentRide;
      }

      // Update ride status only if still pending
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
        `❌ Ride ${rideId} automatically cancelled - no driver response within 30 seconds`
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
