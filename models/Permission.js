const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "User Management",
        "Admin Management",
        "Role Management",
        "Permission Management",
        "Driver Management",
        "Rider Management",
        "Ride Management",
        "Payment Management",
        "Vehicle Management",
        "Wallet Management",
        "Location Management",
        "Rewards Management",
        "System Management",
      ],
      default: "System Management",
    },
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],
    isSystemPermission: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional for system permissions
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Permission", permissionSchema);
