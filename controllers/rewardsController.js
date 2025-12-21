const Rider = require("../models/Rider");
const Reward = require("../models/Reward");
const RewardTier = require("../models/RewardTier");
const RewardCode = require("../models/RewardCode");
const RewardTransaction = require("../models/RewardTransaction");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const socketService = require("../services/socketService");

// Get rewards balance and tier information
exports.getRewardsBalance = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Get current tier information
    const currentTier = await RewardTier.findOne({
      name: rider.points.currentTier,
    });

    // Get next tier information
    const nextTier = await RewardTier.findOne({
      order: { $gt: currentTier ? currentTier.order : 0 },
    }).sort({ order: 1 });

    // Calculate progress percentage
    let progressPercentage = 0;
    if (currentTier && nextTier) {
      const pointsInCurrentTier = rider.points.balance - currentTier.minPoints;
      const pointsNeededForNext = nextTier.minPoints - currentTier.minPoints;
      progressPercentage = Math.min(
        100,
        Math.round((pointsInCurrentTier / pointsNeededForNext) * 100)
      );
    }

    // Check for expiring points (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringTransactions = await RewardTransaction.find({
      rider: rider._id,
      type: "earned",
      expiresAt: { $lte: thirtyDaysFromNow, $gt: new Date() },
      points: { $gt: 0 },
    }).sort({ expiresAt: 1 });

    const expiringPoints = expiringTransactions.reduce(
      (sum, transaction) => sum + transaction.points,
      0
    );

    const response = {
      points: {
        balance: rider.points.balance,
        totalEarned: rider.points.totalEarned,
        totalRedeemed: rider.points.totalRedeemed,
        cashValue: (rider.points.balance * 0.01).toFixed(2), // £0.01 per point
        currency: "GBP",
      },
      tier: {
        current: {
          name: rider.points.currentTier,
          displayName: currentTier?.displayName || rider.points.currentTier,
          benefits: currentTier?.benefits || [],
        },
        next: nextTier
          ? {
              name: nextTier.name,
              displayName: nextTier.displayName,
              pointsNeeded: nextTier.minPoints - rider.points.balance,
              benefits: nextTier.benefits,
            }
          : null,
        progressPercentage,
      },
      expiringPoints: {
        amount: expiringPoints,
        warning: expiringPoints > 0,
        nextExpiry:
          expiringTransactions.length > 0
            ? expiringTransactions[0].expiresAt
            : null,
      },
    };

    sendSuccess(res, response, "Rewards balance retrieved successfully", 200);

    // Emit real-time balance update
    socketService.notifyRewardsBalanceUpdate(rider.user.toString(), {
      points: response.points,
      tier: response.tier,
      expiringPoints: response.expiringPoints,
    });

    // Emit expiring points alert if needed
    if (response.expiringPoints.warning) {
      socketService.notifyRewardsExpiringSoon(rider.user.toString(), {
        amount: response.expiringPoints.amount,
        nextExpiry: response.expiringPoints.nextExpiry,
      });
    }
  } catch (error) {
    console.error("Get rewards balance error:", error);
    sendError(res, "Failed to retrieve rewards balance", 500);
  }
};

// Get available rewards
exports.getAvailableRewards = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const rewards = await Reward.find({ isActive: true }).sort({
      sortOrder: 1,
    });

    // Check availability for each reward
    const rewardsWithAvailability = await Promise.all(
      rewards.map(async (reward) => {
        const isAvailable = rider.points.balance >= reward.pointsRequired;

        // Check redemption limits if applicable
        let canRedeem = isAvailable;
        if (reward.maxRedemptionsPerUser) {
          const userRedemptions = await RewardCode.countDocuments({
            rider: rider._id,
            reward: reward._id,
            status: { $in: ["active", "used"] },
          });
          canRedeem =
            canRedeem && userRedemptions < reward.maxRedemptionsPerUser;
        }

        return {
          id: reward._id,
          title: reward.title,
          description: reward.description,
          pointsRequired: reward.pointsRequired,
          cashValue: reward.cashValue,
          currency: reward.currency,
          type: reward.type,
          icon: reward.icon,
          image: reward.image,
          isAvailable: canRedeem,
          termsAndConditions: reward.termsAndConditions,
        };
      })
    );

    sendSuccess(
      res,
      { rewards: rewardsWithAvailability },
      "Available rewards retrieved successfully",
      200
    );

    // Emit real-time new rewards available notification
    const newlyAvailableRewards = rewardsWithAvailability.filter(
      (reward) => reward.isAvailable
    );
    if (newlyAvailableRewards.length > 0) {
      socketService.notifyRewardsNewAvailable(rider.user.toString(), {
        rewards: newlyAvailableRewards,
      });
    }
  } catch (error) {
    console.error("Get available rewards error:", error);
    sendError(res, "Failed to retrieve available rewards", 500);
  }
};

// Redeem a reward
exports.redeemReward = async (req, res) => {
  try {
    const { rewardId } = req.body;

    if (!rewardId) {
      return sendError(res, "Reward ID is required", 400);
    }

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const reward = await Reward.findById(rewardId);
    if (!reward || !reward.isActive) {
      return sendError(res, "Reward not found or unavailable", 404);
    }

    // Check minimum redemption amount
    if (reward.pointsRequired < 500) {
      return sendError(res, "Minimum redemption is 500 points", 400);
    }

    // Check if rider has enough points
    if (rider.points.balance < reward.pointsRequired) {
      // Notify about redemption failure
      socketService.notifyRiderRedemptionFailed(rider.user.toString(), {
        reason: "insufficient_points",
        rewardId: rewardId,
        rewardTitle: reward.title,
        pointsRequired: reward.pointsRequired,
        currentBalance: rider.points.balance,
        pointsNeeded: reward.pointsRequired - rider.points.balance,
      });
      return sendError(res, "Insufficient points balance", 400);
    }

    // Check redemption limits
    if (reward.maxRedemptionsPerUser) {
      const userRedemptions = await RewardCode.countDocuments({
        rider: rider._id,
        reward: reward._id,
        status: { $in: ["active", "used"] },
      });

      if (userRedemptions >= reward.maxRedemptionsPerUser) {
        // Notify about redemption failure
        socketService.notifyRiderRedemptionFailed(rider.user.toString(), {
          reason: "max_redemptions_reached",
          rewardId: rewardId,
          rewardTitle: reward.title,
          maxRedemptions: reward.maxRedemptionsPerUser,
          currentRedemptions: userRedemptions,
        });
        return sendError(
          res,
          "Maximum redemptions reached for this reward",
          400
        );
      }
    }

    // Generate reward code
    const rewardCode = new RewardCode({
      reward: reward._id,
      rider: rider._id,
      pointsUsed: reward.pointsRequired,
      cashValue: reward.cashValue,
      currency: reward.currency,
      expiresAt: new Date(
        Date.now() + reward.validityDays * 24 * 60 * 60 * 1000
      ),
    });

    await rewardCode.save();

    // Update rider points
    const oldBalance = rider.points.balance;
    rider.points.balance -= reward.pointsRequired;
    rider.points.totalRedeemed += reward.pointsRequired;

    await rider.save();

    // Create transaction record
    await RewardTransaction.create({
      rider: rider._id,
      type: "redeemed",
      points: -reward.pointsRequired,
      balanceBefore: oldBalance,
      balanceAfter: rider.points.balance,
      description: `Redeemed ${reward.title}`,
      reference: rewardCode.code,
      relatedReward: reward._id,
      metadata: {
        rewardTitle: reward.title,
        cashValue: reward.cashValue,
        code: rewardCode.code,
      },
    });

    const response = {
      rewardCode: {
        code: rewardCode.code,
        reward: reward.title,
        cashValue: reward.cashValue,
        currency: reward.currency,
        expiresAt: rewardCode.expiresAt,
      },
      newBalance: rider.points.balance,
      pointsUsed: reward.pointsRequired,
    };

    sendSuccess(res, response, "Reward redeemed successfully", 200);

    // Emit real-time redemption success notification
    socketService.notifyRewardsRedemptionSuccess(rider.user.toString(), {
      rewardCode: response.rewardCode,
      newBalance: response.newBalance,
      pointsUsed: response.pointsUsed,
    });
  } catch (error) {
    console.error("Redeem reward error:", error);
    sendError(res, "Failed to redeem reward", 500);
  }
};

// Get referral information
exports.getReferralInfo = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user.id }).populate(
      "user",
      "fullName email"
    );

    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    // Get successful referrals (riders who completed at least one ride)
    const successfulReferrals = await Rider.countDocuments({
      referredBy: rider._id,
      // Add condition for completed rides if needed
    });

    const response = {
      referralCode: rider.referralCode,
      shareableLink: `${
        process.env.FRONTEND_URL || "https://app.example.com"
      }/signup?ref=${rider.referralCode}`,
      statistics: {
        totalReferrals: rider.referralStats.totalReferrals,
        successfulReferrals: rider.referralStats.successfulReferrals,
        totalEarned: rider.referralStats.totalEarnedFromReferrals,
        currency: "GBP",
      },
      rewards: {
        referrerReward: {
          points: 100,
          description:
            "Earn 100 points when your referral completes their first ride",
        },
        refereeReward: {
          points: 50,
          description:
            "New users get 50 bonus points when they sign up with a referral code",
        },
      },
    };

    sendSuccess(
      res,
      response,
      "Referral information retrieved successfully",
      200
    );

    // Emit real-time referral information update
    socketService.notifyReferralInfoUpdate(rider.user.toString(), {
      referralCode: response.referralCode,
      statistics: response.statistics,
      shareableLink: response.shareableLink,
    });
  } catch (error) {
    console.error("Get referral info error:", error);
    sendError(res, "Failed to retrieve referral information", 500);
  }
};

// Get rewards activity/transactions
exports.getRewardsActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return sendError(res, "Invalid page number", 400);
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return sendError(res, "Invalid limit (1-50 allowed)", 400);
    }

    const rider = await Rider.findOne({ user: req.user.id });
    if (!rider) {
      return sendError(res, "Rider profile not found", 404);
    }

    const totalTransactions = await RewardTransaction.countDocuments({
      rider: rider._id,
    });

    const transactions = await RewardTransaction.find({
      rider: rider._id,
    })
      .populate("relatedRide", "pickup dropoff")
      .populate("relatedReward", "title")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction._id,
      type: transaction.type,
      points: transaction.points,
      description: transaction.description,
      dateTime: transaction.createdAt,
      balanceAfter: transaction.balanceAfter,
      reference: transaction.reference,
      relatedData: {
        ride: transaction.relatedRide
          ? {
              id: transaction.relatedRide._id,
              pickup: transaction.relatedRide.pickup?.address,
              dropoff: transaction.relatedRide.dropoff?.address,
            }
          : null,
        reward: transaction.relatedReward
          ? {
              id: transaction.relatedReward._id,
              title: transaction.relatedReward.title,
            }
          : null,
      },
      isExpiringSoon: transaction.isExpiringSoon && transaction.expiresAt,
    }));

    const response = {
      transactions: formattedTransactions,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalTransactions / limitNum),
        totalTransactions,
        hasNext: pageNum < Math.ceil(totalTransactions / limitNum),
        hasPrev: pageNum > 1,
      },
    };

    sendSuccess(res, response, "Rewards activity retrieved successfully", 200);
  } catch (error) {
    console.error("Get rewards activity error:", error);
    sendError(res, "Failed to retrieve rewards activity", 500);
  }
};

// Award points to rider (internal function)
exports.awardPoints = async (
  riderId,
  points,
  description,
  reference = null,
  relatedRide = null,
  expiresInMonths = 12
) => {
  try {
    const rider = await Rider.findById(riderId);
    if (!rider) {
      throw new Error("Rider not found");
    }

    const oldBalance = rider.points.balance;
    const oldTier = rider.points.currentTier;
    rider.points.balance += points;
    rider.points.totalEarned += points;

    // Update tier based on new balance
    const newTier = await RewardTier.findOne({
      minPoints: { $lte: rider.points.balance },
      maxPoints: { $gte: rider.points.balance },
    }).sort({ order: -1 });

    if (newTier) {
      rider.points.currentTier = newTier.name;
    }

    await rider.save();

    // Create transaction record
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + expiresInMonths);

    await RewardTransaction.create({
      rider: rider._id,
      type: "earned",
      points: points,
      balanceBefore: oldBalance,
      balanceAfter: rider.points.balance,
      description,
      reference,
      relatedRide,
      expiresAt,
    });

    // Emit real-time balance update
    socketService.notifyRewardsBalanceUpdate(riderId.toString(), {
      points: {
        balance: rider.points.balance,
        totalEarned: rider.points.totalEarned,
        totalRedeemed: rider.points.totalRedeemed,
        cashValue: (rider.points.balance * 0.01).toFixed(2),
        currency: "GBP",
      },
      tier: {
        current: rider.points.currentTier,
      },
    });

    // Check if tier was upgraded
    if (newTier && rider.points.currentTier !== oldTier) {
      socketService.notifyRewardsTierUpgrade(riderId.toString(), {
        newTier: rider.points.currentTier,
        benefits: newTier.benefits,
      });
    }

    // Check if this is referral points earned
    if (
      description.toLowerCase().includes("referral") ||
      reference?.includes("REF")
    ) {
      socketService.notifyReferralPointsEarned(riderId.toString(), {
        pointsEarned: points,
        description,
        reference,
        newBalance: rider.points.balance,
      });
    }

    // Notify about points earned (general notification)
    socketService.notifyRiderPointsEarned(riderId.toString(), {
      pointsEarned: points,
      description,
      reference,
      newBalance: rider.points.balance,
      tier: rider.points.currentTier,
    });

    return rider.points.balance;
  } catch (error) {
    console.error("Award points error:", error);
    throw error;
  }
};
