const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      unique: true,
    },
    make: { type: String, required: true }, // e.g., Toyota
    model: { type: String, required: true }, // e.g., Corolla
    year: { type: Number, required: true },
    licensePlate: { type: String, required: true, unique: true },
    color: { type: String },
    type: { type: String, enum: ["sedan", "SUV", "electric"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
