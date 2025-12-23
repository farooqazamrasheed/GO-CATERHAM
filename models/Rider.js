const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // Allow null values but ensure uniqueness when present
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
    },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    status: {
      type: String,
      enum: ["online", "offline", "suspended"],
      default: "offline",
    },
    isSuspended: { type: Boolean, default: false },
    suspensionMessage: { type: String },
    suspendedAt: { type: Date },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Rewards and points system
    points: {
      balance: { type: Number, default: 0, min: 0 },
      totalEarned: { type: Number, default: 0, min: 0 },
      totalRedeemed: { type: Number, default: 0, min: 0 },
      currentTier: {
        type: String,
        enum: ["Bronze", "Silver", "Gold", "Platinum"],
        default: "Bronze",
      },
      tierProgress: { type: Number, default: 0, min: 0, max: 100 }, // percentage
    },
    // Referral rewards tracking
    referralStats: {
      totalReferrals: { type: Number, default: 0 },
      successfulReferrals: { type: Number, default: 0 },
      totalEarnedFromReferrals: { type: Number, default: 0 },
    },
    photo: {
      url: String,
      uploadedAt: Date,
      filename: String,
      mimetype: String,
      size: Number,
    },
    activeStatus: {
      type: String,
      enum: ["active", "deactive"],
      default: "active",
    },
    isDeactivated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rider", riderSchema);
