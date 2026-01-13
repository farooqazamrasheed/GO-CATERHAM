const mongoose = require("mongoose");

const savedLocationSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    name: {
      type: String,
      required: true,
      enum: ["home", "work", "favorite"],
    },
    customName: {
      type: String,
      required: function () {
        return this.name === "favorite";
      },
    },
    address: {
      type: String,
      required: true,
    },
    coordinates: {
      lat: {
        type: Number,
        required: true,
        min: -90,
        max: 90,
      },
      lng: {
        type: Number,
        required: true,
        min: -180,
        max: 180,
      },
    },
    placeId: {
      type: String,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Ensure only one default location per type per rider
savedLocationSchema.index({ rider: 1, name: 1 }, { unique: true });

// Validation moved to controller level to avoid pre-save hook issues

module.exports = mongoose.model("SavedLocation", savedLocationSchema);
