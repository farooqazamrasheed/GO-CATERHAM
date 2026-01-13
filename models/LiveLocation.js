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
      required: true 
    },
    longitude: { 
      type: Number, 
      required: true 
    },
    heading: { 
      type: Number, 
      default: 0 
    },
    speed: { 
      type: Number, 
      default: 0 
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

// Pre-save hook to update geospatial field
liveLocationSchema.pre("save", function () {
  if (this.latitude && this.longitude) {
    this.location = {
      type: "Point",
      coordinates: [this.longitude, this.latitude], // GeoJSON: [lng, lat]
    };
  }
});

// Pre-update hook for findOneAndUpdate
liveLocationSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  if (update.latitude && update.longitude) {
    this.set({
      location: {
        type: "Point",
        coordinates: [update.longitude, update.latitude], // GeoJSON: [lng, lat]
      }
    });
  }
});

// Pre-update hook for updateOne
liveLocationSchema.pre("updateOne", function () {
  const update = this.getUpdate();
  if (update.latitude && update.longitude) {
    this.set({
      location: {
        type: "Point",
        coordinates: [update.longitude, update.latitude],
      }
    });
  }
});

// Pre-update hook for updateMany
liveLocationSchema.pre("updateMany", function () {
  const update = this.getUpdate();
  if (update.latitude && update.longitude) {
    this.set({
      location: {
        type: "Point",
        coordinates: [update.longitude, update.latitude],
      }
    });
  }
});

module.exports = mongoose.model("LiveLocation", liveLocationSchema);
