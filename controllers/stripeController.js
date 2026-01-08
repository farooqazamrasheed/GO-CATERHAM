const stripeService = require("../services/stripeService");
const Payment = require("../models/Payment");
const PaymentMethod = require("../models/PaymentMethod");
const Rider = require("../models/Rider");
const Driver = require("../models/Driver");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Ride = require("../models/Ride");

/**
 * Stripe Controller - Handles all Stripe payment operations
 */

// ============================================
// PAYMENT INTENTS (Wallet Top-Up & Ride Payments)
// ============================================

/**
 * Create payment intent for wallet top-up
 * POST /api/v1/stripe/create-payment-intent
 */
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, currency = "gbp", description, rideId } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Must be greater than 0",
      });
    }

    // Validate currency
    if (!stripeService.isCurrencySupported(currency)) {
      return res.status(400).json({
        success: false,
        message: `Currency ${currency} is not supported`,
        supportedCurrencies: stripeService.getSupportedCurrencies(),
      });
    }

    // Get user details
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get or create rider profile
    let rider = await Rider.findOne({ user: req.user._id });
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider profile not found",
      });
    }

    // Create or get Stripe customer
    let stripeCustomerId = rider.stripeCustomerId;
    if (!stripeCustomerId) {
      stripeCustomerId = await stripeService.createOrGetCustomer({
        _id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: "rider",
      });

      // Save Stripe customer ID
      rider.stripeCustomerId = stripeCustomerId;
      rider.stripeCustomerCreatedAt = new Date();
      await rider.save();
    }

    // Prepare metadata
    const metadata = {
      userId: user._id.toString(),
      riderId: rider._id.toString(),
      purpose: rideId ? "ride_payment" : "wallet_topup",
    };

    if (rideId) {
      metadata.rideId = rideId;
    }

    // Create payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount,
      currency,
      customerId: stripeCustomerId,
      description: description || `Wallet top-up for ${user.name}`,
      metadata,
    });

    // Create payment record
    const payment = await Payment.create({
      rider: user._id,
      amount,
      currency,
      status: "pending",
      paymentMethod: "card",
      stripePaymentIntentId: paymentIntent.paymentIntentId,
      stripeCustomerId,
      description: description || "Wallet top-up",
      metadata,
    });

    res.status(200).json({
      success: true,
      message: "Payment intent created successfully",
      data: {
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        paymentId: payment._id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    next(error);
  }
};

/**
 * Confirm payment and update wallet/ride
 * POST /api/v1/stripe/confirm-payment
 */
exports.confirmPayment = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment intent ID is required",
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripeService.getPaymentIntent(paymentIntentId);

    // Find payment record
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Check if payment belongs to the user
    if (payment.rider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to access this payment",
      });
    }

    // Update payment status based on Stripe payment intent status
    if (paymentIntent.status === "succeeded") {
      payment.status = "paid";
      payment.stripeChargeId = paymentIntent.latest_charge;

      // Extract payment method details
      if (paymentIntent.payment_method) {
        const paymentMethod = await stripeService.getPaymentMethod(
          paymentIntent.payment_method
        );

        if (paymentMethod.card) {
          payment.paymentDetails = {
            last4: paymentMethod.card.last4,
            brand: paymentMethod.card.brand,
            expiryMonth: paymentMethod.card.exp_month,
            expiryYear: paymentMethod.card.exp_year,
          };
        }

        payment.stripePaymentMethodId = paymentIntent.payment_method;
      }

      await payment.save();

      // If it's a wallet top-up, add funds to wallet
      if (!payment.ride && payment.metadata?.get("purpose") === "wallet_topup") {
        let wallet = await Wallet.findOne({ user: req.user._id });

        if (!wallet) {
          wallet = await Wallet.create({
            user: req.user._id,
            balance: 0,
          });
        }

        wallet.balance += payment.amount;
        wallet.transactions.push({
          type: "credit",
          amount: payment.amount,
          description: "Wallet top-up via Stripe",
          balanceAfter: wallet.balance,
          paymentId: payment._id,
        });

        await wallet.save();
      }

      // If it's a ride payment, update ride status
      if (payment.ride) {
        const ride = await Ride.findById(payment.ride);
        if (ride) {
          ride.paymentStatus = "paid";
          await ride.save();
        }
      }

      return res.status(200).json({
        success: true,
        message: "Payment confirmed successfully",
        data: {
          paymentId: payment._id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
        },
      });
    } else if (paymentIntent.status === "requires_payment_method") {
      payment.status = "failed";
      payment.failureReason = "Payment method failed";
      await payment.save();

      return res.status(400).json({
        success: false,
        message: "Payment failed. Please try again with a different payment method",
      });
    } else {
      return res.status(200).json({
        success: true,
        message: `Payment status: ${paymentIntent.status}`,
        data: {
          paymentId: payment._id,
          status: paymentIntent.status,
        },
      });
    }
  } catch (error) {
    console.error("Error confirming payment:", error);
    next(error);
  }
};

/**
 * Get payment intent status
 * GET /api/v1/stripe/payment-intent/:paymentIntentId
 */
exports.getPaymentIntentStatus = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripeService.getPaymentIntent(paymentIntentId);

    res.status(200).json({
      success: true,
      data: {
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    console.error("Error getting payment intent status:", error);
    next(error);
  }
};

// ============================================
// PAYMENT METHODS (Save & Manage Cards)
// ============================================

/**
 * Save payment method (card) for future use
 * POST /api/v1/stripe/save-payment-method
 */
exports.savePaymentMethod = async (req, res, next) => {
  try {
    const { paymentMethodId, setAsDefault = false } = req.body;

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Payment method ID is required",
      });
    }

    // Get user and rider
    const user = await User.findById(req.user._id);
    let rider = await Rider.findOne({ user: req.user._id });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider profile not found",
      });
    }

    // Ensure rider has Stripe customer ID
    let stripeCustomerId = rider.stripeCustomerId;
    if (!stripeCustomerId) {
      stripeCustomerId = await stripeService.createOrGetCustomer({
        _id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: "rider",
      });

      rider.stripeCustomerId = stripeCustomerId;
      rider.stripeCustomerCreatedAt = new Date();
      await rider.save();
    }

    // Attach payment method to customer
    await stripeService.attachPaymentMethod(paymentMethodId, stripeCustomerId);

    // Get payment method details
    const stripePaymentMethod = await stripeService.getPaymentMethod(paymentMethodId);

    // Check if payment method already exists
    let existingMethod = await PaymentMethod.findOne({
      rider: rider._id,
      stripePaymentMethodId: paymentMethodId,
    });

    if (existingMethod) {
      return res.status(400).json({
        success: false,
        message: "This payment method is already saved",
      });
    }

    // Save payment method to database
    const paymentMethod = await PaymentMethod.create({
      rider: rider._id,
      type: "card",
      isDefault: setAsDefault,
      card: {
        last4: stripePaymentMethod.card.last4,
        brand: stripePaymentMethod.card.brand,
        expiryMonth: stripePaymentMethod.card.exp_month,
        expiryYear: stripePaymentMethod.card.exp_year,
        cardholderName: stripePaymentMethod.billing_details.name || user.name,
      },
      provider: "stripe",
      stripePaymentMethodId: paymentMethodId,
      stripeCustomerId,
      fingerprint: stripePaymentMethod.card.fingerprint,
      status: "active",
    });

    // Set as default if requested
    if (setAsDefault) {
      await stripeService.setDefaultPaymentMethod(stripeCustomerId, paymentMethodId);
    }

    res.status(201).json({
      success: true,
      message: "Payment method saved successfully",
      data: paymentMethod.getSafeData(),
    });
  } catch (error) {
    console.error("Error saving payment method:", error);
    next(error);
  }
};

/**
 * List all saved payment methods
 * GET /api/v1/stripe/payment-methods
 */
exports.listPaymentMethods = async (req, res, next) => {
  try {
    const rider = await Rider.findOne({ user: req.user._id });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider profile not found",
      });
    }

    // Get payment methods from database
    const paymentMethods = await PaymentMethod.find({
      rider: rider._id,
      status: "active",
    }).sort({ isDefault: -1, createdAt: -1 });

    const safeData = paymentMethods.map((pm) => pm.getSafeData());

    res.status(200).json({
      success: true,
      count: safeData.length,
      data: safeData,
    });
  } catch (error) {
    console.error("Error listing payment methods:", error);
    next(error);
  }
};

/**
 * Delete a saved payment method
 * DELETE /api/v1/stripe/payment-methods/:id
 */
exports.deletePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    const rider = await Rider.findOne({ user: req.user._id });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider profile not found",
      });
    }

    // Find payment method
    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      rider: rider._id,
    });

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found",
      });
    }

    // Detach from Stripe
    if (paymentMethod.stripePaymentMethodId) {
      await stripeService.detachPaymentMethod(paymentMethod.stripePaymentMethodId);
    }

    // Delete from database
    await PaymentMethod.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Payment method deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    next(error);
  }
};

/**
 * Set default payment method
 * PUT /api/v1/stripe/payment-methods/:id/default
 */
exports.setDefaultPaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    const rider = await Rider.findOne({ user: req.user._id });

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider profile not found",
      });
    }

    // Find payment method
    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      rider: rider._id,
    });

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found",
      });
    }

    // Update in Stripe
    if (rider.stripeCustomerId && paymentMethod.stripePaymentMethodId) {
      await stripeService.setDefaultPaymentMethod(
        rider.stripeCustomerId,
        paymentMethod.stripePaymentMethodId
      );
    }

    // Update in database (pre-save hook will handle unsetting other defaults)
    paymentMethod.isDefault = true;
    await paymentMethod.save();

    res.status(200).json({
      success: true,
      message: "Default payment method updated successfully",
      data: paymentMethod.getSafeData(),
    });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    next(error);
  }
};

// ============================================
// REFUNDS
// ============================================

/**
 * Create a refund for a payment
 * POST /api/v1/stripe/refund
 */
exports.createRefund = async (req, res, next) => {
  try {
    const { paymentId, amount, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment ID is required",
      });
    }

    // Find payment
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check if payment can be refunded
    if (!payment.canBeRefunded()) {
      return res.status(400).json({
        success: false,
        message: "This payment cannot be refunded",
      });
    }

    // Validate refund amount
    const refundAmount = amount || payment.amount;
    if (refundAmount > payment.amount) {
      return res.status(400).json({
        success: false,
        message: "Refund amount cannot exceed payment amount",
      });
    }

    // Create refund in Stripe
    const refund = await stripeService.createRefund(
      payment.stripePaymentIntentId,
      refundAmount,
      reason
    );

    // Update payment record
    payment.status = "refunded";
    payment.stripeRefundId = refund.id;
    payment.refundDetails = {
      refundedAmount: refundAmount,
      refundReason: reason || "Requested by customer",
      refundedAt: new Date(),
    };
    await payment.save();

    // If payment was for wallet top-up, deduct from wallet
    if (!payment.ride) {
      const wallet = await Wallet.findOne({ user: payment.rider });
      if (wallet && wallet.balance >= refundAmount) {
        wallet.balance -= refundAmount;
        wallet.transactions.push({
          type: "debit",
          amount: refundAmount,
          description: `Refund for payment ${payment._id}`,
          balanceAfter: wallet.balance,
          paymentId: payment._id,
        });
        await wallet.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: {
        refundId: refund.id,
        amount: refundAmount,
        status: refund.status,
      },
    });
  } catch (error) {
    console.error("Error creating refund:", error);
    next(error);
  }
};

// ============================================
// STRIPE CONNECT (Driver Payouts)
// ============================================

/**
 * Create Stripe Connect account for driver
 * POST /api/v1/stripe/connect/create-account
 */
exports.createConnectAccount = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const driver = await Driver.findOne({ user: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // Check if driver already has a Connect account
    if (driver.stripeConnectAccountId) {
      return res.status(400).json({
        success: false,
        message: "Driver already has a Stripe Connect account",
        accountId: driver.stripeConnectAccountId,
      });
    }

    // Create Connect account
    const accountId = await stripeService.createConnectAccount({
      _id: driver._id,
      email: user.email,
    });

    // Save account ID
    driver.stripeConnectAccountId = accountId;
    driver.stripeAccountStatus = "pending";
    driver.stripeAccountCreatedAt = new Date();
    await driver.save();

    res.status(201).json({
      success: true,
      message: "Stripe Connect account created successfully",
      data: {
        accountId,
      },
    });
  } catch (error) {
    console.error("Error creating Connect account:", error);
    next(error);
  }
};

/**
 * Get Stripe Connect onboarding link
 * GET /api/v1/stripe/connect/onboarding-link
 */
exports.getOnboardingLink = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    if (!driver.stripeConnectAccountId) {
      return res.status(400).json({
        success: false,
        message: "No Stripe Connect account found. Please create one first",
      });
    }

    // Create account link
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const onboardingUrl = await stripeService.createAccountLink(
      driver.stripeConnectAccountId,
      `${baseUrl}/driver/stripe-refresh`,
      `${baseUrl}/driver/stripe-return`
    );

    res.status(200).json({
      success: true,
      data: {
        url: onboardingUrl,
      },
    });
  } catch (error) {
    console.error("Error getting onboarding link:", error);
    next(error);
  }
};

/**
 * Get Connect account status
 * GET /api/v1/stripe/connect/account-status
 */
exports.getConnectAccountStatus = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    if (!driver.stripeConnectAccountId) {
      return res.status(404).json({
        success: false,
        message: "No Stripe Connect account found",
      });
    }

    // Get account details from Stripe
    const account = await stripeService.getConnectAccount(driver.stripeConnectAccountId);

    // Update driver status based on Stripe account
    const isOnboardingComplete = account.charges_enabled && account.payouts_enabled;
    
    if (isOnboardingComplete !== driver.stripeOnboardingCompleted) {
      driver.stripeOnboardingCompleted = isOnboardingComplete;
      driver.stripeAccountStatus = isOnboardingComplete ? "enabled" : "pending";
      await driver.save();
    }

    res.status(200).json({
      success: true,
      data: {
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        onboardingComplete: isOnboardingComplete,
        status: driver.stripeAccountStatus,
      },
    });
  } catch (error) {
    console.error("Error getting Connect account status:", error);
    next(error);
  }
};

/**
 * Create payout to driver
 * POST /api/v1/stripe/connect/payout (Admin only)
 */
exports.createDriverPayout = async (req, res, next) => {
  try {
    const { driverId, amount } = req.body;

    if (!driverId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Driver ID and amount are required",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Find driver
    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (!driver.stripeConnectAccountId) {
      return res.status(400).json({
        success: false,
        message: "Driver does not have a Stripe Connect account",
      });
    }

    if (!driver.stripeOnboardingCompleted) {
      return res.status(400).json({
        success: false,
        message: "Driver has not completed Stripe onboarding",
      });
    }

    // Check available balance
    if (driver.earnings.availableBalance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient available balance",
      });
    }

    // Create payout
    const payout = await stripeService.createPayout(
      driver.stripeConnectAccountId,
      amount,
      driver.earnings.currency
    );

    // Update driver earnings
    driver.earnings.availableBalance -= amount;
    driver.earnings.totalPaidOut += amount;
    driver.earnings.lastPayoutAt = new Date();
    await driver.save();

    res.status(200).json({
      success: true,
      message: "Payout created successfully",
      data: {
        payoutId: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency,
        status: payout.status,
      },
    });
  } catch (error) {
    console.error("Error creating driver payout:", error);
    next(error);
  }
};

// ============================================
// WEBHOOKS
// ============================================

/**
 * Handle Stripe webhook events
 * POST /api/v1/stripe/webhook
 */
exports.handleWebhook = async (req, res, next) => {
  const signature = req.headers["stripe-signature"];

  try {
    // Construct event from webhook
    const event = stripeService.constructWebhookEvent(req.rawBody, signature);

    console.log(`Received Stripe webhook: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
        break;

      case "payment_method.attached":
        console.log("Payment method attached:", event.data.object.id);
        break;

      case "payment_method.detached":
        console.log("Payment method detached:", event.data.object.id);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;

      case "payout.paid":
        console.log("Payout paid:", event.data.object.id);
        break;

      case "payout.failed":
        console.log("Payout failed:", event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(400).json({
      success: false,
      message: `Webhook Error: ${error.message}`,
    });
  }
};

// ============================================
// WEBHOOK HANDLERS (Internal)
// ============================================

async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (payment && payment.status !== "paid") {
      payment.status = "paid";
      payment.stripeChargeId = paymentIntent.latest_charge;
      await payment.save();

      console.log(`Payment ${payment._id} marked as paid via webhook`);
    }
  } catch (error) {
    console.error("Error handling payment_intent.succeeded:", error);
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (payment) {
      payment.status = "failed";
      payment.failureReason = paymentIntent.last_payment_error?.message || "Payment failed";
      await payment.save();

      console.log(`Payment ${payment._id} marked as failed via webhook`);
    }
  } catch (error) {
    console.error("Error handling payment_intent.payment_failed:", error);
  }
}

async function handleChargeRefunded(charge) {
  try {
    const payment = await Payment.findOne({
      stripeChargeId: charge.id,
    });

    if (payment) {
      payment.status = "refunded";
      await payment.save();

      console.log(`Payment ${payment._id} marked as refunded via webhook`);
    }
  } catch (error) {
    console.error("Error handling charge.refunded:", error);
  }
}

async function handleAccountUpdated(account) {
  try {
    const driver = await Driver.findOne({
      stripeConnectAccountId: account.id,
    });

    if (driver) {
      const isOnboardingComplete = account.charges_enabled && account.payouts_enabled;
      driver.stripeOnboardingCompleted = isOnboardingComplete;
      driver.stripeAccountStatus = isOnboardingComplete ? "enabled" : "pending";
      await driver.save();

      console.log(`Driver ${driver._id} Connect account updated via webhook`);
    }
  } catch (error) {
    console.error("Error handling account.updated:", error);
  }
}

// ============================================
// UTILITY ENDPOINTS
// ============================================

/**
 * Get supported currencies
 * GET /api/v1/stripe/currencies
 */
exports.getSupportedCurrencies = (req, res) => {
  res.status(200).json({
    success: true,
    data: stripeService.getSupportedCurrencies().map((code) => ({
      code: code.toUpperCase(),
      symbol: stripeService.getCurrencySymbol(code),
    })),
  });
};

/**
 * Get Stripe publishable key
 * GET /api/v1/stripe/config
 */
exports.getStripeConfig = (req, res) => {
  const publishableKey =
    process.env.NODE_ENV === "production"
      ? process.env.STRIPE_PUBLISHABLE_KEY
      : process.env.STRIPE_TEST_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;

  res.status(200).json({
    success: true,
    data: {
      publishableKey,
      environment: process.env.NODE_ENV || "development",
    },
  });
};
