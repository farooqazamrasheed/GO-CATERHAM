const mongoose = require("mongoose");
const Permission = require("../models/Permission");
const Role = require("../models/Role");
require("dotenv").config();

/**
 * Seed initial permissions and roles for RBAC system
 */
async function seedRBAC() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Define initial permissions with categories
    const permissions = [
      // Role Management
      {
        name: "create_role",
        description: "Create new roles",
        category: "Role Management",
      },
      {
        name: "edit_role",
        description: "Edit existing roles",
        category: "Role Management",
      },
      {
        name: "delete_role",
        description: "Delete roles",
        category: "Role Management",
      },
      {
        name: "view_roles",
        description: "View roles list",
        category: "Role Management",
      },

      // Permission Management
      {
        name: "create_permission",
        description: "Create new permissions",
        category: "Permission Management",
      },
      {
        name: "edit_permission",
        description: "Edit existing permissions",
        category: "Permission Management",
      },
      {
        name: "delete_permission",
        description: "Delete permissions",
        category: "Permission Management",
      },
      {
        name: "view_permissions",
        description: "View permissions list",
        category: "Permission Management",
      },

      // Admin Management
      {
        name: "create_admin",
        description: "Create admin/subadmin accounts",
        category: "Admin Management",
      },
      {
        name: "view_admins",
        description: "View admin list",
        category: "Admin Management",
      },
      {
        name: "manage_admin_permissions",
        description: "Assign permissions to admins",
        category: "Admin Management",
      },
      {
        name: "delete_admin",
        description: "Delete admin accounts",
        category: "Admin Management",
      },

      // Driver Management
      {
        name: "approve_driver",
        description: "Approve driver applications",
        category: "Driver Management",
      },
      {
        name: "reject_driver",
        description: "Reject driver applications",
        category: "Driver Management",
      },
      {
        name: "view_drivers",
        description: "View driver list and details",
        category: "Driver Management",
      },
      {
        name: "manage_drivers",
        description: "Full driver management",
        category: "Driver Management",
      },

      // Rider Management
      {
        name: "view_riders",
        description: "View rider list and details",
        category: "Rider Management",
      },
      {
        name: "manage_riders",
        description: "Full rider management",
        category: "Rider Management",
      },

      // Ride Management
      {
        name: "view_rides",
        description: "View ride history and details",
        category: "Ride Management",
      },
      {
        name: "manage_rides",
        description: "Full ride management",
        category: "Ride Management",
      },
      {
        name: "book_ride",
        description: "Book a ride",
        category: "Ride Management",
      },
      {
        name: "cancel_ride",
        description: "Cancel rides",
        category: "Ride Management",
      },
      {
        name: "start_ride",
        description: "Start a ride",
        category: "Ride Management",
      },
      {
        name: "complete_ride",
        description: "Complete rides",
        category: "Ride Management",
      },

      // Payment Management
      {
        name: "view_payments",
        description: "View payment records",
        category: "Payment Management",
      },
      {
        name: "manage_payments",
        description: "Full payment management",
        category: "Payment Management",
      },
      {
        name: "process_refund",
        description: "Process payment refunds",
        category: "Payment Management",
      },

      // Vehicle Management
      {
        name: "view_vehicles",
        description: "View vehicle information",
        category: "Vehicle Management",
      },
      {
        name: "manage_vehicles",
        description: "Full vehicle management",
        category: "Vehicle Management",
      },
      {
        name: "update_vehicle",
        description: "Update vehicle information",
        category: "Vehicle Management",
      },

      // Wallet Management
      {
        name: "view_wallets",
        description: "View wallet balances",
        category: "Wallet Management",
      },
      {
        name: "manage_wallets",
        description: "Full wallet management",
        category: "Wallet Management",
      },
      {
        name: "topup_wallet",
        description: "Top up wallet balance",
        category: "Wallet Management",
      },

      // Location Management
      {
        name: "update_location",
        description: "Update live location",
        category: "Location Management",
      },
      {
        name: "view_location",
        description: "View location data",
        category: "Location Management",
      },

      // Document Management (under Driver Management)
      {
        name: "upload_documents",
        description: "Upload driver documents",
        category: "Driver Management",
      },
      {
        name: "view_documents",
        description: "View document status",
        category: "Driver Management",
      },
      {
        name: "delete_documents",
        description: "Delete uploaded documents",
        category: "Driver Management",
      },
      {
        name: "verify_documents",
        description: "Verify and approve documents",
        category: "Driver Management",
      },

      // User Management
      {
        name: "view_users",
        description: "View user information",
        category: "User Management",
      },
      {
        name: "manage_users",
        description: "Full user management",
        category: "User Management",
      },

      // Driver-specific permissions
      {
        name: "view_earnings",
        description: "View earnings and statistics",
        category: "Driver Management",
      },
      {
        name: "accept_ride",
        description: "Accept ride requests",
        category: "Ride Management",
      },
      {
        name: "reject_ride",
        description: "Reject ride requests",
        category: "Ride Management",
      },

      // Rider-specific permissions
      {
        name: "rate_driver",
        description: "Rate drivers after rides",
        category: "Ride Management",
      },
      {
        name: "view_receipts",
        description: "View ride receipts",
        category: "Payment Management",
      },
      {
        name: "schedule_ride",
        description: "Schedule rides for later",
        category: "Ride Management",
      },
      {
        name: "view_dashboard",
        description: "View rider dashboard",
        category: "User Management",
      },
      {
        name: "view_ride_status",
        description: "View real-time ride status and tracking",
        category: "Ride Management",
      },
      {
        name: "upload_photo",
        description: "Upload driver profile photo",
        category: "Driver Management",
      },
      {
        name: "view_driver_photo",
        description: "View driver profile photos",
        category: "Driver Management",
      },
      {
        name: "create_profile",
        description: "Create driver profile",
        category: "Driver Management",
      },
      {
        name: "view_profile",
        description: "View driver profile",
        category: "Driver Management",
      },
      {
        name: "update_status",
        description: "Update driver online/offline status",
        category: "Driver Management",
      },
      {
        name: "view_rewards",
        description: "View rewards balance and activity",
        category: "Rewards Management",
      },
      {
        name: "redeem_rewards",
        description: "Redeem rewards for points",
        category: "Rewards Management",
      },
      {
        name: "view_referrals",
        description: "View referral information and statistics",
        category: "Rewards Management",
      },
      {
        name: "view_profile",
        description: "View user profile information",
        category: "User Management",
      },
      {
        name: "update_profile",
        description: "Update user profile information",
        category: "User Management",
      },
    ];

    console.log("Creating permissions...");
    const createdPermissions = [];
    for (const perm of permissions) {
      const existing = await Permission.findOne({ name: perm.name });
      if (!existing) {
        const newPerm = await Permission.create(perm);
        createdPermissions.push(newPerm);
        console.log(`✓ Created permission: ${perm.name}`);
      } else {
        createdPermissions.push(existing);
        console.log(`- Permission already exists: ${perm.name}`);
      }
    }

    // Create default roles
    const roles = [
      {
        name: "Driver Manager",
        description: "Manages driver approvals and oversight",
        permissions: createdPermissions
          .filter((p) =>
            [
              "approve_driver",
              "reject_driver",
              "view_drivers",
              "view_rides",
              "view_payments",
            ].includes(p.name)
          )
          .map((p) => p._id),
      },
      {
        name: "Rider Support",
        description: "Handles rider-related operations and support",
        permissions: createdPermissions
          .filter((p) =>
            [
              "view_riders",
              "view_rides",
              "view_payments",
              "manage_rides",
            ].includes(p.name)
          )
          .map((p) => p._id),
      },
      {
        name: "Finance Manager",
        description: "Manages payments and financial operations",
        permissions: createdPermissions
          .filter((p) =>
            [
              "view_payments",
              "manage_payments",
              "view_wallets",
              "manage_wallets",
            ].includes(p.name)
          )
          .map((p) => p._id),
      },
      {
        name: "System Admin",
        description: "Full system administration access",
        permissions: createdPermissions
          .filter(
            (p) =>
              ![
                "create_role",
                "edit_role",
                "delete_role",
                "create_permission",
                "edit_permission",
                "delete_permission",
                "create_admin",
                "delete_admin",
              ].includes(p.name)
          )
          .map((p) => p._id),
      },
    ];

    console.log("\nCreating roles...");
    for (const role of roles) {
      const existing = await Role.findOne({ name: role.name });
      if (!existing) {
        await Role.create(role);
        console.log(`✓ Created role: ${role.name}`);
      } else {
        console.log(`- Role already exists: ${role.name}`);
      }
    }

    console.log("\n✅ RBAC seeding completed successfully!");
    console.log("\n📋 Summary:");
    console.log(`- Created ${createdPermissions.length} permissions`);
    console.log(`- Created ${roles.length} default roles`);

    console.log("\n🔑 Next steps:");
    console.log("1. Create a superadmin user manually in the database");
    console.log("2. Assign permissions to subadmins as needed");
    console.log("3. Test the RBAC system with different user roles");
  } catch (error) {
    console.error("❌ Error seeding RBAC:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run if called directly
if (require.main === module) {
  seedRBAC();
}

module.exports = { seedRBAC };
