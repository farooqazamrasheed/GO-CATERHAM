const mongoose = require("mongoose");

const riderLiveLocationSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    heading: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 }, // GPS accuracy in meters
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Create 2dsphere index for geospatial queries
riderLiveLocationSchema.index({ latitude: 1, longitude: 1 });

// Index for efficient queries by rider and timestamp
riderLiveLocationSchema.index({ rider: 1, timestamp: -1 });

// Auto-delete old locations (keep only last 24 hours)
riderLiveLocationSchema.pre("save", function (next) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Remove old locations for this rider
  this.constructor
    .deleteMany({
      rider: this.rider,
      timestamp: { $lt: twentyFourHoursAgo },
    })
    .exec();

  next();
});

module.exports = mongoose.model("RiderLiveLocation", riderLiveLocationSchema);
