const Stripe = require("stripe");

// Initialize Stripe based on environment
const getStripeInstance = () => {
  const stripeKey =
    process.env.NODE_ENV === "production"
      ? process.env.STRIPE_SECRET_KEY
      : process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    throw new Error("Stripe secret key is not configured");
  }

  return new Stripe(stripeKey, {
    apiVersion: "2023-10-16",
  });
};

const stripe = getStripeInstance();

/**
 * Stripe Service - Comprehensive Payment Integration
 * Handles all Stripe operations for the GO-CATERHAM taxi app
 */

class StripeService {
  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================

  /**
   * Create or retrieve Stripe customer for a user
   * @param {Object} user - User/Rider object
   * @returns {Promise<string>} Stripe customer ID
   */
  async createOrGetCustomer(user) {
    try {
      // If user already has a Stripe customer ID, return it
      if (user.stripeCustomerId) {
        return user.stripeCustomerId;
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        phone: user.phone,
        metadata: {
          userId: user._id.toString(),
          userType: user.role || "rider",
        },
      });

      return customer.id;
    } catch (error) {
      console.error("Error creating Stripe customer:", error);
      throw new Error(`Failed to create Stripe customer: ${error.message}`);
    }
  }

  /**
   * Update Stripe customer information
   * @param {string} customerId - Stripe customer ID
   * @param {Object} updates - Fields to update
   */
  async updateCustomer(customerId, updates) {
    try {
      return await stripe.customers.update(customerId, updates);
    } catch (error) {
      console.error("Error updating Stripe customer:", error);
      throw new Error(`Failed to update Stripe customer: ${error.message}`);
    }
  }

  /**
   * Delete Stripe customer
   * @param {string} customerId - Stripe customer ID
   */
  async deleteCustomer(customerId) {
    try {
      return await stripe.customers.del(customerId);
    } catch (error) {
      console.error("Error deleting Stripe customer:", error);
      throw new Error(`Failed to delete Stripe customer: ${error.message}`);
    }
  }

  // ============================================
  // PAYMENT INTENTS (For wallet top-up & ride payments)
  // ============================================

  /**
   * Create payment intent for wallet top-up or ride payment
   * @param {Object} params - Payment parameters
   * @param {number} params.amount - Amount in smallest currency unit (pence for GBP)
   * @param {string} params.currency - Currency code (default: gbp)
   * @param {string} params.customerId - Stripe customer ID
   * @param {string} params.description - Payment description
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Payment intent object
   */
  async createPaymentIntent({
    amount,
    currency = "gbp",
    customerId,
    description,
    metadata = {},
  }) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to smallest unit
        currency: currency.toLowerCase(),
        customer: customerId,
        description,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
        // Enable setup for future usage
        setup_future_usage: "off_session",
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      };
    } catch (error) {
      console.error("Error creating payment intent:", error);
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  /**
   * Retrieve payment intent details
   * @param {string} paymentIntentId - Payment intent ID
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error("Error retrieving payment intent:", error);
      throw new Error(`Failed to retrieve payment intent: ${error.message}`);
    }
  }

  /**
   * Confirm payment intent
   * @param {string} paymentIntentId - Payment intent ID
   * @param {string} paymentMethodId - Payment method ID (optional)
   */
  async confirmPaymentIntent(paymentIntentId, paymentMethodId = null) {
    try {
      const params = { payment_intent: paymentIntentId };
      if (paymentMethodId) {
        params.payment_method = paymentMethodId;
      }

      return await stripe.paymentIntents.confirm(paymentIntentId, params);
    } catch (error) {
      console.error("Error confirming payment intent:", error);
      throw new Error(`Failed to confirm payment intent: ${error.message}`);
    }
  }

  /**
   * Cancel payment intent
   * @param {string} paymentIntentId - Payment intent ID
   */
  async cancelPaymentIntent(paymentIntentId) {
    try {
      return await stripe.paymentIntents.cancel(paymentIntentId);
    } catch (error) {
      console.error("Error canceling payment intent:", error);
      throw new Error(`Failed to cancel payment intent: ${error.message}`);
    }
  }

  // ============================================
  // PAYMENT METHODS (Save & manage cards)
  // ============================================

  /**
   * Attach payment method to customer
   * @param {string} paymentMethodId - Payment method ID from Stripe.js
   * @param {string} customerId - Stripe customer ID
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      return await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (error) {
      console.error("Error attaching payment method:", error);
      throw new Error(`Failed to attach payment method: ${error.message}`);
    }
  }

  /**
   * Detach payment method from customer
   * @param {string} paymentMethodId - Payment method ID
   */
  async detachPaymentMethod(paymentMethodId) {
    try {
      return await stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      console.error("Error detaching payment method:", error);
      throw new Error(`Failed to detach payment method: ${error.message}`);
    }
  }

  /**
   * List all payment methods for a customer
   * @param {string} customerId - Stripe customer ID
   * @param {string} type - Payment method type (default: card)
   */
  async listPaymentMethods(customerId, type = "card") {
    try {
      return await stripe.paymentMethods.list({
        customer: customerId,
        type,
      });
    } catch (error) {
      console.error("Error listing payment methods:", error);
      throw new Error(`Failed to list payment methods: ${error.message}`);
    }
  }

  /**
   * Get payment method details
   * @param {string} paymentMethodId - Payment method ID
   */
  async getPaymentMethod(paymentMethodId) {
    try {
      return await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (error) {
      console.error("Error retrieving payment method:", error);
      throw new Error(`Failed to retrieve payment method: ${error.message}`);
    }
  }

  /**
   * Set default payment method for customer
   * @param {string} customerId - Stripe customer ID
   * @param {string} paymentMethodId - Payment method ID
   */
  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      return await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    } catch (error) {
      console.error("Error setting default payment method:", error);
      throw new Error(
        `Failed to set default payment method: ${error.message}`
      );
    }
  }

  // ============================================
  // CHARGES (Direct charges with saved payment methods)
  // ============================================

  /**
   * Create a charge using saved payment method
   * @param {Object} params - Charge parameters
   */
  async createCharge({
    amount,
    currency = "gbp",
    customerId,
    paymentMethodId,
    description,
    metadata = {},
  }) {
    try {
      // Create payment intent with saved payment method
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        customer: customerId,
        payment_method: paymentMethodId,
        description,
        metadata,
        confirm: true,
        off_session: true,
      });

      return paymentIntent;
    } catch (error) {
      console.error("Error creating charge:", error);
      throw new Error(`Failed to create charge: ${error.message}`);
    }
  }

  // ============================================
  // REFUNDS
  // ============================================

  /**
   * Create a refund for a payment
   * @param {string} paymentIntentId - Payment intent ID
   * @param {number} amount - Amount to refund (optional, full refund if not specified)
   * @param {string} reason - Refund reason
   */
  async createRefund(paymentIntentId, amount = null, reason = null) {
    try {
      const refundParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100);
      }

      if (reason) {
        refundParams.reason = reason; // 'duplicate', 'fraudulent', 'requested_by_customer'
      }

      return await stripe.refunds.create(refundParams);
    } catch (error) {
      console.error("Error creating refund:", error);
      throw new Error(`Failed to create refund: ${error.message}`);
    }
  }

  /**
   * Get refund details
   * @param {string} refundId - Refund ID
   */
  async getRefund(refundId) {
    try {
      return await stripe.refunds.retrieve(refundId);
    } catch (error) {
      console.error("Error retrieving refund:", error);
      throw new Error(`Failed to retrieve refund: ${error.message}`);
    }
  }

  // ============================================
  // STRIPE CONNECT (Driver Payouts)
  // ============================================

  /**
   * Create Connect account for driver
   * @param {Object} driver - Driver object
   */
  async createConnectAccount(driver) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: driver.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          driverId: driver._id.toString(),
        },
      });

      return account.id;
    } catch (error) {
      console.error("Error creating Connect account:", error);
      throw new Error(`Failed to create Connect account: ${error.message}`);
    }
  }

  /**
   * Create account link for driver onboarding
   * @param {string} accountId - Stripe Connect account ID
   * @param {string} refreshUrl - URL to redirect if link expires
   * @param {string} returnUrl - URL to redirect after completion
   */
  async createAccountLink(accountId, refreshUrl, returnUrl) {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return accountLink.url;
    } catch (error) {
      console.error("Error creating account link:", error);
      throw new Error(`Failed to create account link: ${error.message}`);
    }
  }

  /**
   * Get Connect account details
   * @param {string} accountId - Stripe Connect account ID
   */
  async getConnectAccount(accountId) {
    try {
      return await stripe.accounts.retrieve(accountId);
    } catch (error) {
      console.error("Error retrieving Connect account:", error);
      throw new Error(`Failed to retrieve Connect account: ${error.message}`);
    }
  }

  /**
   * Create transfer to driver's Connect account
   * @param {Object} params - Transfer parameters
   */
  async createTransfer({
    amount,
    currency = "gbp",
    destination,
    description,
    metadata = {},
  }) {
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        destination,
        description,
        metadata,
      });

      return transfer;
    } catch (error) {
      console.error("Error creating transfer:", error);
      throw new Error(`Failed to create transfer: ${error.message}`);
    }
  }

  /**
   * Create payout to driver's bank account
   * @param {string} accountId - Stripe Connect account ID
   * @param {number} amount - Amount to payout
   * @param {string} currency - Currency code
   */
  async createPayout(accountId, amount, currency = "gbp") {
    try {
      const payout = await stripe.payouts.create(
        {
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
        },
        {
          stripeAccount: accountId,
        }
      );

      return payout;
    } catch (error) {
      console.error("Error creating payout:", error);
      throw new Error(`Failed to create payout: ${error.message}`);
    }
  }

  /**
   * Get Connect account balance
   * @param {string} accountId - Stripe Connect account ID
   */
  async getAccountBalance(accountId) {
    try {
      return await stripe.balance.retrieve({
        stripeAccount: accountId,
      });
    } catch (error) {
      console.error("Error retrieving account balance:", error);
      throw new Error(`Failed to retrieve account balance: ${error.message}`);
    }
  }

  // ============================================
  // WEBHOOKS
  // ============================================

  /**
   * Construct webhook event from raw body and signature
   * @param {Buffer} rawBody - Raw request body
   * @param {string} signature - Stripe signature header
   */
  constructWebhookEvent(rawBody, signature) {
    try {
      const webhookSecret =
        process.env.NODE_ENV === "production"
          ? process.env.STRIPE_WEBHOOK_SECRET
          : process.env.STRIPE_TEST_WEBHOOK_SECRET ||
            process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error("Stripe webhook secret is not configured");
      }

      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      console.error("Error constructing webhook event:", error);
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Convert amount to smallest currency unit (e.g., pounds to pence)
   * @param {number} amount - Amount in main unit
   * @returns {number} Amount in smallest unit
   */
  toSmallestUnit(amount) {
    return Math.round(amount * 100);
  }

  /**
   * Convert amount from smallest currency unit to main unit
   * @param {number} amount - Amount in smallest unit
   * @returns {number} Amount in main unit
   */
  fromSmallestUnit(amount) {
    return amount / 100;
  }

  /**
   * Get supported currencies
   * @returns {Array<string>} List of supported currency codes
   */
  getSupportedCurrencies() {
    return ["gbp", "usd", "eur", "cad", "aud"];
  }

  /**
   * Validate currency code
   * @param {string} currency - Currency code
   * @returns {boolean} Whether currency is supported
   */
  isCurrencySupported(currency) {
    return this.getSupportedCurrencies().includes(currency.toLowerCase());
  }

  /**
   * Get currency symbol
   * @param {string} currency - Currency code
   * @returns {string} Currency symbol
   */
  getCurrencySymbol(currency) {
    const symbols = {
      gbp: "£",
      usd: "$",
      eur: "€",
      cad: "CA$",
      aud: "A$",
    };
    return symbols[currency.toLowerCase()] || currency.toUpperCase();
  }

  /**
   * Format amount for display
   * @param {number} amount - Amount in main unit
   * @param {string} currency - Currency code
   * @returns {string} Formatted amount
   */
  formatAmount(amount, currency = "gbp") {
    const symbol = this.getCurrencySymbol(currency);
    return `${symbol}${amount.toFixed(2)}`;
  }
}

module.exports = new StripeService();
