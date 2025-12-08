const mongoose = require("mongoose");
const crypto = require("crypto");

const rewardCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    reward: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reward",
      required: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    pointsUsed: {
      type: Number,
      required: true,
      min: 0,
    },
    cashValue: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "GBP",
    },
    status: {
      type: String,
      enum: ["active", "used", "expired"],
      default: "active",
    },
    redeemedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

// Generate unique code before saving
rewardCodeSchema.pre("save", function (next) {
  if (this.isNew && !this.code) {
    this.code = this.generateCode();
  }
  next();
});

// Generate unique reward code
rewardCodeSchema.methods.generateCode = function () {
  const prefix = "RW";
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${randomPart}${timestamp}`;
};

// Check if code is expired
rewardCodeSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

// Check if code is valid for use
rewardCodeSchema.methods.isValid = function () {
  return this.status === "active" && !this.isExpired();
};

// Mark code as used
rewardCodeSchema.methods.markAsUsed = function (rideId = null) {
  this.status = "used";
  this.usedAt = new Date();
  if (rideId) {
    this.ride = rideId;
  }
  return this.save();
};

// Index for efficient queries
rewardCodeSchema.index({ rider: 1, status: 1 });
rewardCodeSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("RewardCode", rewardCodeSchema);
