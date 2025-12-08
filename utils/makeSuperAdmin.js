const mongoose = require("mongoose");
const User = require("../models/User");
const Admin = require("../models/Admin");
require("dotenv").config();

/**
 * Create a superadmin user
 * Run this script to create the initial superadmin
 */
async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Superadmin details
    const superAdminData = {
      username: "superadmin",
      fullName: "Super Administrator",
      email: "superadmin@gocaterham.com",
      phone: "07000000000",
      password: "superADMIN@123", // This will be hashed
      role: "superadmin",
      isVerified: true,
    };

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: "superadmin" });
    if (existingSuperAdmin) {
      console.log("❌ Superadmin already exists!");
      console.log("Username:", existingSuperAdmin.username);
      console.log("Email:", existingSuperAdmin.email);
      return;
    }

    // Create superadmin user
    const superAdmin = await User.create(superAdminData);
    console.log("✅ Superadmin user created successfully!");
    console.log("User ID:", superAdmin._id);

    // Create admin profile with superadmin type
    const adminProfile = await Admin.create({
      user: superAdmin._id,
      adminType: "superadmin",
      status: "online",
    });

    console.log("✅ Superadmin profile created successfully!");
    console.log("Admin ID:", adminProfile._id);
    console.log("Admin Type:", adminProfile.adminType);

    console.log("\n🎉 SUPERADMIN CREATED SUCCESSFULLY!");
    console.log("=====================================");
    console.log("Username: superadmin");
    console.log("Email: superadmin@gocaterham.com");
    console.log("Password: superADMIN@123");
    console.log("Role: superadmin");
    console.log("Admin Type: superadmin");
    console.log("=====================================");
    console.log("\n⚠️  IMPORTANT: Change the password after first login!");
    console.log("🔑 Use these credentials to login and manage the system");
  } catch (error) {
    console.error("❌ Error creating superadmin:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Alternative: Update existing admin to superadmin
async function promoteToSuperAdmin(email) {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ User not found with email:", email);
      return;
    }

    // Update user role to superadmin
    user.role = "superadmin";
    await user.save();

    // Update or create admin profile
    const adminProfile = await Admin.findOneAndUpdate(
      { user: user._id },
      {
        adminType: "superadmin",
        status: "online",
      },
      { upsert: true, new: true }
    );

    console.log("✅ User promoted to superadmin successfully!");
    console.log("User:", user.fullName, "(", user.email, ")");
    console.log("New Role:", user.role);
    console.log("Admin Type:", adminProfile.adminType);
  } catch (error) {
    console.error("❌ Error promoting user:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run the script
if (require.main === module) {
  const command = process.argv[2];
  const email = process.argv[3];

  if (command === "promote" && email) {
    console.log(`Promoting user ${email} to superadmin...`);
    promoteToSuperAdmin(email);
  } else {
    console.log("Creating new superadmin...");
    createSuperAdmin();
  }
}

module.exports = { createSuperAdmin, promoteToSuperAdmin };
