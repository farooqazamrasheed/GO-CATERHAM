const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const rbac = require("../middlewares/rbac");

const stripeController = require("../controllers/stripeController");

// Public endpoints
router.get("/config", stripeController.getStripeConfig);
router.get("/currencies", stripeController.getSupportedCurrencies);

// Webhook endpoint (no auth required, but signature verification in controller)
router.post("/webhook", stripeController.handleWebhook);

// All other routes require authentication
router.use(auth);

// ============================================
// PAYMENT INTENTS (Wallet Top-Up & Ride Payments)
// ============================================

// Create payment intent for wallet top-up or ride payment
router.post(
  "/create-payment-intent",
  rbac("rider"),
  stripeController.createPaymentIntent
);

// Confirm payment after successful payment
router.post("/confirm-payment", rbac("rider"), stripeController.confirmPayment);

// Get payment intent status
router.get(
  "/payment-intent/:paymentIntentId",
  rbac("rider"),
  stripeController.getPaymentIntentStatus
);

// ============================================
// PAYMENT METHODS (Save & Manage Cards)
// ============================================

// Save payment method (card)
router.post(
  "/save-payment-method",
  rbac("rider"),
  stripeController.savePaymentMethod
);

// List all saved payment methods
router.get(
  "/payment-methods",
  rbac("rider"),
  stripeController.listPaymentMethods
);

// Delete a saved payment method
router.delete(
  "/payment-methods/:id",
  rbac("rider"),
  stripeController.deletePaymentMethod
);

// Set default payment method
router.put(
  "/payment-methods/:id/default",
  rbac("rider"),
  stripeController.setDefaultPaymentMethod
);

// ============================================
// REFUNDS (Admin only)
// ============================================

// Create a refund
router.post("/refund", rbac("admin"), stripeController.createRefund);

// ============================================
// STRIPE CONNECT (Driver Payouts)
// ============================================

// Create Stripe Connect account for driver
router.post(
  "/connect/create-account",
  rbac("driver"),
  stripeController.createConnectAccount
);

// Get onboarding link for driver
router.get(
  "/connect/onboarding-link",
  rbac("driver"),
  stripeController.getOnboardingLink
);

// Get Connect account status
router.get(
  "/connect/account-status",
  rbac("driver"),
  stripeController.getConnectAccountStatus
);

// Create payout to driver (Admin only)
router.post(
  "/connect/payout",
  rbac("admin"),
  stripeController.createDriverPayout
);

module.exports = router;
