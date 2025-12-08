const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Notification preferences
    notifications: {
      email: {
        promotions: { type: Boolean, default: true },
        rideUpdates: { type: Boolean, default: true },
        security: { type: Boolean, default: true },
        rewards: { type: Boolean, default: true },
      },
      push: {
        rideRequests: { type: Boolean, default: true },
        rideUpdates: { type: Boolean, default: true },
        promotions: { type: Boolean, default: false },
        rewards: { type: Boolean, default: true },
      },
      sms: {
        rideUpdates: { type: Boolean, default: true },
        security: { type: Boolean, default: true },
      },
    },
    // Privacy settings
    privacy: {
      profileVisibility: {
        type: String,
        enum: ["public", "friends", "private"],
        default: "private",
      },
      rideHistoryVisibility: {
        type: String,
        enum: ["public", "friends", "private"],
        default: "private",
      },
      showOnlineStatus: { type: Boolean, default: true },
      allowRideSharing: { type: Boolean, default: false },
    },
    // App preferences
    preferences: {
      language: {
        type: String,
        enum: ["en", "es", "fr", "de"],
        default: "en",
      },
      currency: {
        type: String,
        enum: ["GBP", "USD", "EUR"],
        default: "GBP",
      },
      theme: {
        type: String,
        enum: ["light", "dark", "auto"],
        default: "auto",
      },
      units: {
        distance: {
          type: String,
          enum: ["miles", "km"],
          default: "miles",
        },
        time: {
          type: String,
          enum: ["12h", "24h"],
          default: "12h",
        },
      },
      ridePreferences: {
        preferredVehicleType: {
          type: String,
          enum: ["any", "sedan", "SUV", "electric"],
          default: "any",
        },
        maxWaitTime: {
          type: Number,
          min: 1,
          max: 30,
          default: 10, // minutes
        },
        enableSurgePricing: { type: Boolean, default: true },
      },
    },
    // Emergency contacts
    emergencyContacts: [
      {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relationship: { type: String, required: true },
      },
    ],
    // Accessibility settings
    accessibility: {
      largerText: { type: Boolean, default: false },
      highContrast: { type: Boolean, default: false },
      screenReader: { type: Boolean, default: false },
      reducedMotion: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Limit emergency contacts to 3
userSettingsSchema.pre("save", function (next) {
  if (this.emergencyContacts && this.emergencyContacts.length > 3) {
    return next(new Error("Maximum 3 emergency contacts allowed"));
  }
  next();
});

module.exports = mongoose.model("UserSettings", userSettingsSchema);
