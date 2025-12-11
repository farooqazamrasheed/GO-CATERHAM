const mongoose = require("mongoose");

const liveLocationSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    heading: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Create 2dsphere index for geospatial queries
liveLocationSchema.index({ latitude: 1, longitude: 1 });

module.exports = mongoose.model("LiveLocation", liveLocationSchema);
