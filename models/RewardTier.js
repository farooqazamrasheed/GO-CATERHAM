const mongoose = require("mongoose");

const rewardTierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: ["Bronze", "Silver", "Gold", "Platinum"],
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    minPoints: {
      type: Number,
      required: true,
      min: 0,
    },
    maxPoints: {
      type: Number,
      required: true,
      min: 0,
    },
    benefits: [
      {
        type: String,
        required: true,
      },
    ],
    color: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

// Index for efficient tier lookup
rewardTierSchema.index({ minPoints: 1, maxPoints: 1 });

module.exports = mongoose.model("RewardTier", rewardTierSchema);
