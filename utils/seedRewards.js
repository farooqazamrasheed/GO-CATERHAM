const mongoose = require("mongoose");
const RewardTier = require("../models/RewardTier");
const Reward = require("../models/Reward");
require("dotenv").config();

/**
 * Seed initial reward tiers and rewards for the rewards system
 */
async function seedRewards() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Define reward tiers
    const tiers = [
      {
        name: "Bronze",
        displayName: "Bronze Member",
        minPoints: 0,
        maxPoints: 499,
        benefits: [
          "Basic ride credits",
          "Standard support",
          "Monthly rewards summary",
        ],
        color: "#CD7F32",
        icon: "🥉",
        order: 1,
      },
      {
        name: "Silver",
        displayName: "Silver Member",
        minPoints: 500,
        maxPoints: 2499,
        benefits: [
          "Priority ride matching",
          "Exclusive discounts",
          "Premium support",
          "Bonus points on referrals",
        ],
        color: "#C0C0C0",
        icon: "🥈",
        order: 2,
      },
      {
        name: "Gold",
        displayName: "Gold Member",
        minPoints: 2500,
        maxPoints: 7499,
        benefits: [
          "Free premium rides",
          "Dedicated support",
          "Exclusive partner offers",
          "Double referral points",
          "Priority customer service",
        ],
        color: "#FFD700",
        icon: "🥇",
        order: 3,
      },
      {
        name: "Platinum",
        displayName: "Platinum Member",
        minPoints: 7500,
        maxPoints: 999999,
        benefits: [
          "Unlimited premium rides",
          "VIP support",
          "Exclusive events access",
          "Triple referral points",
          "Personal account manager",
          "Airport transfer credits",
        ],
        color: "#E5E4E2",
        icon: "💎",
        order: 4,
      },
    ];

    console.log("Creating reward tiers...");
    for (const tier of tiers) {
      const existing = await RewardTier.findOne({ name: tier.name });
      if (!existing) {
        await RewardTier.create(tier);
        console.log(`✓ Created tier: ${tier.name}`);
      } else {
        console.log(`- Tier already exists: ${tier.name}`);
      }
    }

    // Define rewards
    const rewards = [
      {
        title: "£5 Ride Credit",
        description: "Get £5 off your next ride",
        pointsRequired: 500,
        cashValue: 5.0,
        type: "ride_credit",
        icon: "💰",
        sortOrder: 1,
        validityDays: 90,
        termsAndConditions:
          "Valid for rides within Surrey area. Cannot be combined with other offers.",
      },
      {
        title: "£10 Ride Credit",
        description: "Get £10 off your next ride",
        pointsRequired: 1000,
        cashValue: 10.0,
        type: "ride_credit",
        icon: "💵",
        sortOrder: 2,
        validityDays: 90,
        termsAndConditions:
          "Valid for rides within Surrey area. Cannot be combined with other offers.",
      },
      {
        title: "£25 Ride Credit",
        description: "Get £25 off your next ride",
        pointsRequired: 2500,
        cashValue: 25.0,
        type: "ride_credit",
        icon: "💳",
        sortOrder: 3,
        validityDays: 90,
        termsAndConditions:
          "Valid for rides within Surrey area. Cannot be combined with other offers.",
      },
      {
        title: "Premium Ride",
        description: "One free premium ride (SUV or higher)",
        pointsRequired: 5000,
        cashValue: 0.0,
        type: "premium_ride",
        icon: "🚗",
        sortOrder: 4,
        validityDays: 180,
        maxRedemptionsPerUser: 1,
        termsAndConditions:
          "Valid for one premium ride within Surrey area. Subject to driver availability.",
      },
    ];

    console.log("\nCreating rewards...");
    for (const reward of rewards) {
      const existing = await Reward.findOne({ title: reward.title });
      if (!existing) {
        await Reward.create(reward);
        console.log(`✓ Created reward: ${reward.title}`);
      } else {
        console.log(`- Reward already exists: ${reward.title}`);
      }
    }

    console.log("\n✅ Rewards seeding completed successfully!");
    console.log("\n📋 Summary:");
    console.log(`- Created ${tiers.length} reward tiers`);
    console.log(`- Created ${rewards.length} rewards`);

    console.log("\n🎯 Reward System Features:");
    console.log("- Points expire after 12 months");
    console.log("- Minimum redemption: 500 points");
    console.log("- Referral rewards: 100 points for referrer, 50 for referee");
    console.log("- Tier progression: Bronze → Silver → Gold → Platinum");
    console.log("- Activity tracking for all point transactions");
  } catch (error) {
    console.error("❌ Error seeding rewards:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run if called directly
if (require.main === module) {
  seedRewards();
}

module.exports = { seedRewards };
