const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    adminType: {
      type: String,
      enum: ["superadmin", "admin", "subadmin"],
      required: true,
    },
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    assignedPermissions: [
      {
        permissionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Permission",
          required: true,
        },
        expiresAt: {
          type: Date,
          required: false, // null means no expiration
        },
        grantedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        grantedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    assignedRoles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
