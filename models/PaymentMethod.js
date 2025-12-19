const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["card", "paypal", "apple_pay", "google_pay"],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    // Card-specific fields
    card: {
      last4: {
        type: String,
        required: function () {
          return this.type === "card";
        },
      },
      brand: {
        type: String,
        enum: ["visa", "mastercard", "amex", "discover"],
        required: function () {
          return this.type === "card";
        },
      },
      expiryMonth: {
        type: Number,
        min: 1,
        max: 12,
        required: function () {
          return this.type === "card";
        },
      },
      expiryYear: {
        type: Number,
        required: function () {
          return this.type === "card";
        },
      },
      cardholderName: {
        type: String,
        required: function () {
          return this.type === "card";
        },
      },
    },
    // PayPal-specific fields
    paypal: {
      email: {
        type: String,
        required: function () {
          return this.type === "paypal";
        },
      },
    },
    // Tokenized payment data (stored securely)
    paymentToken: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["paypal", "apple_pay", "google_pay", "stripe"],
    },
    status: {
      type: String,
      enum: ["active", "expired", "failed"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Ensure only one default payment method per rider
paymentMethodSchema.pre("save", async function () {
  if (this.isDefault) {
    await mongoose
      .model("PaymentMethod")
      .updateMany(
        { rider: this.rider, _id: { $ne: this._id } },
        { isDefault: false }
      );
  }
});

// Virtual for masked card number
paymentMethodSchema.virtual("maskedCard").get(function () {
  if (this.type === "card" && this.card) {
    return `**** **** **** ${this.card.last4}`;
  }
  return null;
});

// Method to check if card is expired
paymentMethodSchema.methods.isExpired = function () {
  if (this.type === "card" && this.card) {
    const now = new Date();
    const expiryDate = new Date(
      this.card.expiryYear,
      this.card.expiryMonth - 1
    );
    return expiryDate < now;
  }
  return false;
};

module.exports = mongoose.model("PaymentMethod", paymentMethodSchema);
