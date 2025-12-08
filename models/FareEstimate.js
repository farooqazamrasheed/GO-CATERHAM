const mongoose = require("mongoose");

const fareEstimateSchema = new mongoose.Schema(
  {
    estimateId: {
      type: String,
      required: true,
      unique: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pickup: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, required: true },
    },
    dropoff: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, required: true },
    },
    vehicleType: {
      type: String,
      enum: ["sedan", "SUV", "electric"],
      required: true,
    },
    distance: {
      miles: { type: Number, required: true },
      kilometers: { type: Number, required: true },
    },
    duration: {
      minutes: { type: Number, required: true },
      formatted: { type: String, required: true },
    },
    fareBreakdown: {
      baseFare: { type: Number, required: true },
      distanceFare: { type: Number, required: true },
      timeFare: { type: Number, required: true },
      surgeMultiplier: { type: Number, default: 1.0 },
      subtotal: { type: Number, required: true },
      tax: { type: Number, required: true },
      total: { type: Number, required: true },
    },
    currency: {
      type: String,
      default: "GBP",
    },
    driverAvailability: {
      count: { type: Number, required: true },
      estimatedPickupTime: { type: Number, required: true }, // minutes
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index for automatic deletion
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
fareEstimateSchema.index({ rider: 1, createdAt: -1 });

module.exports = mongoose.model("FareEstimate", fareEstimateSchema);
