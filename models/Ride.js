const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    pickup: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
    },
    dropoff: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
    },
    vehicleType: {
      type: String,
      enum: ["sedan", "SUV", "electric"],
    },
    status: {
      type: String,
      enum: [
        "pending",        // Rider books, finding driver
        "searching",      // System searching for drivers (optional)
        "assigned",       // Driver auto-assigned (optional)
        "accepted",       // Driver accepted - on the way to pickup
        "going-to-pickup",// (kept for backward compatibility)
        "arrived",        // Driver arrived at pickup (optional)
        "in_progress",    // Ride started (rider picked up)
        "completed",      // Ride finished
        "cancelled",      // Ride cancelled
        "scheduled",      // Scheduled for future
      ],
      default: "pending",
    },
    scheduledTime: { type: Date },
    estimatedPickupTime: { type: Number }, // minutes
    actualPickupTime: { type: Date },
    startTime: { type: Date },
    endTime: { type: Date },
    fare: { type: Number, default: 0 },
    estimatedFare: { type: Number },
    estimatedDistance: { type: Number }, // miles
    estimatedDuration: { type: Number }, // minutes
    actualDistance: { type: Number },
    actualDuration: { type: Number },
    // Earnings breakdown
    tips: { type: Number, default: 0 }, // Tips received from rider
    bonuses: { type: Number, default: 0 }, // Bonuses earned
    platformCommission: { type: Number, default: 0 }, // Platform fee (20%)
    driverEarnings: { type: Number, default: 0 }, // Driver's net earnings (80%)
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet"],
      default: "cash",
    },
    specialInstructions: { type: String },
    cancellationReason: { type: String },
    rating: {
      riderRating: { type: Number, min: 1, max: 5 },
      driverRating: { type: Number, min: 1, max: 5 },
      riderComment: { type: String },
      driverComment: { type: String },
    },
  },
  { timestamps: true }
);

rideSchema.index({ rider: 1 });
rideSchema.index({ driver: 1 });

module.exports = mongoose.model("Ride", rideSchema);
