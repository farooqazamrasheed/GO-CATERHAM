const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: false,
      unique: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet"],
      default: "cash",
    },
  },
  { timestamps: true }
);

paymentSchema.index({ rider: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
