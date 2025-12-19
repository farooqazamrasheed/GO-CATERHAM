const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "GBP" },
    transactions: [
      {
        type: { type: String, enum: ["ride", "topup", "refund", "tip"] },
        amount: Number,
        payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
        ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride" },
        description: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);
