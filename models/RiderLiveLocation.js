const mongoose = require("mongoose");

const riderLiveLocationSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    latitude: { 
      type: Number, 
      required: true,
      min: -90,
      max: 90,
      validate: {
        validator: function(v) {
          return !isNaN(v) && v !== 0;
        },
        message: 'Latitude must be a valid non-zero number between -90 and 90'
      }
    },
    longitude: { 
      type: Number, 
      required: true,
      min: -180,
      max: 180,
      validate: {
        validator: function(v) {
          return !isNaN(v) && v !== 0;
        },
        message: 'Longitude must be a valid non-zero number between -180 and 180'
      }
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
    accuracy: { 
      type: Number, 
      default: 0,
      min: 0
    }, // GPS accuracy in meters
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
