const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const rewardsController = require("../controllers/rewardsController");

// All routes require authentication
router.use(auth);

// Get rewards balance and tier information
router.get(
  "/balance",
  checkPermission("view_rewards"),
  rewardsController.getRewardsBalance
);

// Alias for rider rewards (matches requirements)
router.get(
  "/",
  checkPermission("view_rewards"),
  rewardsController.getRewardsBalance
);

// Get available rewards
router.get(
  "/available",
  checkPermission("view_rewards"),
  rewardsController.getAvailableRewards
);

// Redeem a reward
router.post(
  "/redeem",
  checkPermission("redeem_rewards"),
  rewardsController.redeemReward
);

// Get referral information
router.get(
  "/referrals",
  checkPermission("view_referrals"),
  rewardsController.getReferralInfo
);

// Get rewards activity/transactions
router.get(
  "/activity",
  checkPermission("view_rewards"),
  rewardsController.getRewardsActivity
);

module.exports = router;
