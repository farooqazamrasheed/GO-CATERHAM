const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: false,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    amount: { type: Number, required: true },
    currency: {
      type: String,
      default: "gbp",
      enum: ["gbp", "usd", "eur", "cad", "aud"],
    },
    status: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed", "canceled"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet"],
      default: "cash",
    },
    // Stripe-specific fields
    stripePaymentIntentId: {
      type: String,
    },
    stripeCustomerId: {
      type: String,
    },
    stripePaymentMethodId: {
      type: String,
    },
    stripeChargeId: {
      type: String,
    },
    stripeRefundId: {
      type: String,
    },
    // Payment details
    paymentDetails: {
      last4: String,
      brand: String, // visa, mastercard, amex, etc.
      expiryMonth: Number,
      expiryYear: Number,
    },
    // Refund details
    refundDetails: {
      refundedAmount: Number,
      refundReason: String,
      refundedAt: Date,
    },
    // Transaction metadata
    metadata: {
      type: Map,
      of: String,
    },
    failureReason: String,
    description: String,
  },
  { timestamps: true }
);

paymentSchema.index({ rider: 1 });
paymentSchema.index({ driver: 1 });
paymentSchema.index({ ride: 1 }, { unique: true, sparse: true });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });

// Virtual for formatted amount
paymentSchema.virtual("formattedAmount").get(function () {
  const symbols = {
    gbp: "£",
    usd: "$",
    eur: "€",
    cad: "CA$",
    aud: "A$",
  };
  const symbol = symbols[this.currency] || this.currency.toUpperCase();
  return `${symbol}${this.amount.toFixed(2)}`;
});

// Method to check if payment is successful
paymentSchema.methods.isSuccessful = function () {
  return this.status === "paid";
};

// Method to check if payment can be refunded
paymentSchema.methods.canBeRefunded = function () {
  return (
    this.status === "paid" &&
    this.paymentMethod === "card" &&
    this.stripePaymentIntentId
  );
};

module.exports = mongoose.model("Payment", paymentSchema);
