const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Admin management
        "CREATE_ADMIN",
        "UPDATE_ADMIN_PERMISSIONS",
        "DELETE_ADMIN",
        "ADMIN_LOGIN",
        "ADMIN_LOGOUT",

        // Role management
        "CREATE_ROLE",
        "UPDATE_ROLE",
        "DELETE_ROLE",

        // Permission management
        "CREATE_PERMISSION",
        "UPDATE_PERMISSION",
        "DELETE_PERMISSION",

        // Driver management
        "APPROVE_DRIVER",
        "REJECT_DRIVER",
        "UPDATE_DRIVER_STATUS",

        // Rider management
        "UPDATE_RIDER_STATUS",
        "SUSPEND_RIDER",

        // Ride management
        "CANCEL_RIDE",
        "MODIFY_RIDE_FARE",

        // Payment management
        "PROCESS_REFUND",
        "UPDATE_PAYMENT_STATUS",

        // System actions
        "SYSTEM_BACKUP",
        "CONFIGURATION_CHANGE",
      ],
    },
    resource: {
      type: String,
      required: true,
      enum: [
        "admin",
        "role",
        "permission",
        "driver",
        "rider",
        "ride",
        "payment",
        "vehicle",
        "system",
      ],
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Not all actions have a specific resource ID
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Flexible object for action details
      default: {},
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    success: {
      type: Boolean,
      default: true,
    },
    errorMessage: {
      type: String,
      required: false,
    },
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index for efficient querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
