const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const stripeService = require("../services/stripeService");
const { sendSuccess, sendError } = require("../utils/responseHelper");

/**
 * Driver Payout Controller
 * Handles driver earnings and payout operations via Stripe Connect
 */

/**
 * Get driver earnings summary
 * GET /api/v1/drivers/earnings
 */
exports.getEarnings = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user.id });

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Get ride statistics
    const completedRides = await Ride.find({
      driver: driver._id,
      status: "completed",
    }).sort({ endTime: -1 });

    // Calculate earnings breakdown
    const totalRides = completedRides.length;
    const totalEarnings = completedRides.reduce(
      (sum, ride) => sum + (ride.driverEarnings || 0),
      0
    );
    const totalTips = completedRides.reduce(
      (sum, ride) => sum + (ride.tips || 0),
      0
    );
    const totalBonuses = completedRides.reduce(
      (sum, ride) => sum + (ride.bonuses || 0),
      0
    );

    // Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRides = completedRides.filter(
      (ride) => ride.endTime >= today
    );
    const todayEarnings = todayRides.reduce(
      (sum, ride) => sum + (ride.driverEarnings || 0),
      0
    );

    // Calculate this week's earnings
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekRides = completedRides.filter(
      (ride) => ride.endTime >= weekStart
    );
    const weekEarnings = weekRides.reduce(
      (sum, ride) => sum + (ride.driverEarnings || 0),
      0
    );

    // Calculate this month's earnings
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthRides = completedRides.filter(
      (ride) => ride.endTime >= monthStart
    );
    const monthEarnings = monthRides.reduce(
      (sum, ride) => sum + (ride.driverEarnings || 0),
      0
    );

    const response = {
      totalEarnings: {
        amount: totalEarnings + totalTips + totalBonuses,
        baseEarnings: totalEarnings,
        tips: totalTips,
        bonuses: totalBonuses,
        currency: driver.earnings.currency || "gbp",
      },
      availableBalance: driver.earnings.availableBalance || 0,
      pendingBalance: driver.earnings.pendingBalance || 0,
      totalPaidOut: driver.earnings.totalPaidOut || 0,
      lastPayoutAt: driver.earnings.lastPayoutAt,
      periodBreakdown: {
        today: {
          earnings: todayEarnings,
          rides: todayRides.length,
        },
        thisWeek: {
          earnings: weekEarnings,
          rides: weekRides.length,
        },
        thisMonth: {
          earnings: monthEarnings,
          rides: monthRides.length,
        },
      },
      totalRides,
      currency: driver.earnings.currency || "gbp",
      stripeAccountStatus: driver.stripeAccountStatus,
      stripeOnboardingCompleted: driver.stripeOnboardingCompleted || false,
    };

    sendSuccess(res, response, "Earnings retrieved successfully", 200);
  } catch (error) {
    console.error("Get earnings error:", error);
    sendError(res, "Failed to retrieve earnings", 500);
  }
};

/**
 * Request payout to bank account
 * POST /api/v1/drivers/earnings/payout
 */
exports.requestPayout = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return sendError(res, "Invalid payout amount", 400);
    }

    const driver = await Driver.findOne({ user: req.user.id });

    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Check if driver has Stripe Connect account
    if (!driver.stripeConnectAccountId) {
      return sendError(
        res,
        "Please complete Stripe Connect onboarding first",
        400
      );
    }

    if (!driver.stripeOnboardingCompleted) {
      return sendError(
        res,
        "Please complete your bank account setup in Stripe",
        400
      );
    }

    // Check available balance
    if (driver.earnings.availableBalance < amount) {
      return sendError(
        res,
        `Insufficient balance. Available: ${stripeService.formatAmount(
          driver.earnings.availableBalance,
          driver.earnings.currency
        )}`,
        400
      );
    }

    // Create payout via Stripe
    const payout = await stripeService.createPayout(
      driver.stripeConnectAccountId,
      amount,
      driver.earnings.currency
    );

    // Update driver earnings
    driver.earnings.availableBalance -= amount;
    driver.earnings.pendingBalance += amount; // Move to pending until payout completes
    await driver.save();

    sendSuccess(
      res,
      {
        payoutId: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency,
        status: payout.status,
        expectedArrival: payout.arrival_date
          ? new Date(payout.arrival_date * 1000)
          : null,
      },
      "Payout requested successfully",
      200
    );
  } catch (error) {
    console.error("Request payout error:", error);
    sendError(res, error.message || "Failed to request payout", 500);
  }
};

/**
 * Process earnings after ride completion (Internal - called after ride completion)
 * This should be called from rideController after ride completion
 */
exports.processRideEarnings = async (driverId, ride) => {
  try {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      console.error("Driver not found for earnings processing:", driverId);
      return;
    }

    const earnings = ride.driverEarnings || 0;
    const tips = ride.tips || 0;
    const bonuses = ride.bonuses || 0;
    const totalEarnings = earnings + tips + bonuses;

    // Initialize earnings object if not exists
    if (!driver.earnings) {
      driver.earnings = {
        totalEarned: 0,
        availableBalance: 0,
        pendingBalance: 0,
        totalPaidOut: 0,
        currency: "gbp",
      };
    }

    // Update driver earnings
    driver.earnings.totalEarned += totalEarnings;
    driver.earnings.availableBalance += totalEarnings;

    await driver.save();

    console.log(
      `Processed earnings for driver ${driverId}: ${stripeService.formatAmount(
        totalEarnings,
        driver.earnings.currency
      )}`
    );
  } catch (error) {
    console.error("Process ride earnings error:", error);
  }
};

/**
 * Get payout history (Admin only)
 * GET /api/v1/drivers/:driverId/payouts
 */
exports.getPayoutHistory = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId);

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    if (!driver.stripeConnectAccountId) {
      return sendSuccess(
        res,
        { payouts: [] },
        "No payout history available",
        200
      );
    }

    // Get payout history from Stripe
    // Note: This requires additional Stripe API call
    // For now, returning basic info
    sendSuccess(
      res,
      {
        totalPaidOut: driver.earnings.totalPaidOut || 0,
        lastPayoutAt: driver.earnings.lastPayoutAt,
        currency: driver.earnings.currency || "gbp",
        stripeAccountId: driver.stripeConnectAccountId,
      },
      "Payout history retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get payout history error:", error);
    sendError(res, "Failed to retrieve payout history", 500);
  }
};

/**
 * Admin: Process manual payout to driver
 * POST /api/v1/admin/drivers/:driverId/payout
 */
exports.adminProcessPayout = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return sendError(res, "Invalid payout amount", 400);
    }

    const driver = await Driver.findById(driverId);

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    if (!driver.stripeConnectAccountId) {
      return sendError(res, "Driver does not have a Stripe Connect account", 400);
    }

    if (!driver.stripeOnboardingCompleted) {
      return sendError(res, "Driver has not completed Stripe onboarding", 400);
    }

    // Check available balance
    if (driver.earnings.availableBalance < amount) {
      return sendError(
        res,
        `Insufficient balance. Available: ${stripeService.formatAmount(
          driver.earnings.availableBalance,
          driver.earnings.currency
        )}`,
        400
      );
    }

    // Create payout via Stripe
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

    sendSuccess(
      res,
      {
        payoutId: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency,
        status: payout.status,
        driver: {
          id: driver._id,
          name: driver.user?.fullName || "Unknown",
        },
      },
      "Payout processed successfully",
      200
    );
  } catch (error) {
    console.error("Admin process payout error:", error);
    sendError(res, error.message || "Failed to process payout", 500);
  }
};

module.exports = exports;
