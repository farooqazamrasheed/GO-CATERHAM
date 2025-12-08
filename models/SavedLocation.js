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

// Allow multiple favorites but limit to reasonable number
savedLocationSchema.pre("save", async function (next) {
  if (this.name === "favorite") {
    const count = await mongoose.model("SavedLocation").countDocuments({
      rider: this.rider,
      name: "favorite",
    });
    if (count >= 10) {
      return next(new Error("Maximum 10 favorite locations allowed"));
    }
  }
  next();
});

module.exports = mongoose.model("SavedLocation", savedLocationSchema);
