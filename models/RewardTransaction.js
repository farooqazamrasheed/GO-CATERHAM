const mongoose = require("mongoose");

const rewardTransactionSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["earned", "redeemed", "expired", "bonus", "adjustment"],
    },
    points: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
    },
    reference: {
      type: String,
    },
    relatedRide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
    },
    relatedReward: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reward",
    },
    relatedReferral: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
rewardTransactionSchema.index({ rider: 1, createdAt: -1 });
rewardTransactionSchema.index({ rider: 1, type: 1 });
rewardTransactionSchema.index({ expiresAt: 1 });

// Virtual for checking if transaction is expired
rewardTransactionSchema.virtual("isExpired").get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Method to check if points are expiring soon (within 30 days)
rewardTransactionSchema.methods.isExpiringSoon = function () {
  if (!this.expiresAt) return false;
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.expiresAt <= thirtyDaysFromNow;
};

module.exports = mongoose.model("RewardTransaction", rewardTransactionSchema);
