const mongoose = require("mongoose");

const liveLocationSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
      unique: true, // One record per driver
    },
    latitude: { 
      type: Number, 
      required: true,
      min: -90,
      max: 90
    },
    longitude: { 
      type: Number, 
      required: true,
      min: -180,
      max: 180
    },
    heading: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 360
    },
    speed: { 
      type: Number, 
      default: 0,
      min: 0
    },
    timestamp: { 
      type: Date, 
      default: Date.now,
      index: true // Index for efficient "recent location" queries
    },
    // Geospatial field for nearby queries
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude] - GeoJSON format
        // Note: 2dsphere index is defined below using schema.index()
      },
    },
  },
  { timestamps: true }
);

// Create 2dsphere index for geospatial queries
liveLocationSchema.index({ "location.coordinates": "2dsphere" });

// Compound index for efficient driver lookup with timestamp
liveLocationSchema.index({ driver: 1, timestamp: -1 });

// Note: We don't use pre-save or pre-update hooks because they can cause issues with Mongoose
// Instead, we handle the location field creation in the controller before saving/updating
// All controllers manually set the location field in the update object before calling findOneAndUpdate

module.exports = mongoose.model("LiveLocation", liveLocationSchema);
