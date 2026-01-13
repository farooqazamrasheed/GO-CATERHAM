const mongoose = require("mongoose");

const activeStatusHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userType: {
      type: String,
      required: true,
      enum: ["admin", "driver", "rider"],
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
    },
    action: {
      type: String,
      required: true,
      enum: ["activate", "deactivate"],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reason: {
      type: String,
    },
  },
  { timestamps: true }
);

// Index for efficient querying
activeStatusHistorySchema.index({ userId: 1, timestamp: -1 });
activeStatusHistorySchema.index({ userType: 1, timestamp: -1 });
activeStatusHistorySchema.index({ driverId: 1, timestamp: -1 });
activeStatusHistorySchema.index({ adminId: 1, timestamp: -1 });
activeStatusHistorySchema.index({ riderId: 1, timestamp: -1 });

module.exports = mongoose.model(
  "ActiveStatusHistory",
  activeStatusHistorySchema
);
