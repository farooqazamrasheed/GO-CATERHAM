const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    pointsRequired: {
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
    type: {
      type: String,
      required: true,
      enum: ["ride_credit", "premium_ride", "cashback", "other"],
    },
    icon: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    maxRedemptionsPerUser: {
      type: Number,
      default: null, // null means unlimited
    },
    validityDays: {
      type: Number,
      default: 30, // days after redemption
    },
    termsAndConditions: {
      type: String,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
rewardSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("Reward", rewardSchema);
