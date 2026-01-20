const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    licenseNumber: { type: String, required: true, trim: true, unique: true },
    vehicle: { type: String, required: true, trim: true },
    vehicleModel: { type: String, trim: true },
    vehicleYear: { type: Number, min: 1900, max: new Date().getFullYear() + 1 },
    vehicleColor: { type: String, trim: true },
    vehicleType: {
      type: String,
      enum: [
        "sedan",
        "suv",
        "electric",
        "hatchback",
        "coupe",
        "convertible",
        "wagon",
        "pickup",
        "van",
        "motorcycle",
      ],
      default: "sedan",
    },
    numberPlateOfVehicle: { type: String, required: true, trim: true },
    // Document uploads
    documents: {
      drivingLicenseFront: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      drivingLicenseBack: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      cnicFront: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      cnicBack: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      vehicleRegistration: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      insuranceCertificate: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      vehiclePhotoFront: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
      vehiclePhotoSide: {
        url: String,
        uploadedAt: Date,
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ['not_uploaded', 'uploaded', 'pending_verification', 'verified', 'rejected'],
          default: 'not_uploaded'
        },
        rejected: { type: Boolean, default: false },
        rejectionReason: String,
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionCount: { type: Number, default: 0 },
        markedMissingAt: Date,
        remindersSent: { type: Number, default: 0 },
        previousVersions: [{
          url: String,
          uploadedAt: Date,
          rejectedAt: Date,
          rejectionReason: String,
        }],
        currentVersion: { type: Number, default: 1 },
        lastUploadedAt: Date,
      },
    },
    status: {
      type: String,
      enum: ["online", "offline", "busy"],
      default: "offline",
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "verified"],
      default: "unverified",
    },
    isApproved: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionCount: { type: Number, default: 0 },
    rejectionMessage: { type: String },
    lastRejectedAt: { type: Date },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    photo: {
      url: String,
      uploadedAt: Date,
      filename: String,
      mimetype: String,
      size: Number,
    },
    activeStatus: {
      type: String,
      enum: ["active", "deactive"],
      default: "active",
    },
    // Stripe Connect integration for driver payouts
    stripeConnectAccountId: {
      type: String,
      sparse: true,
      index: true,
    },
    stripeAccountStatus: {
      type: String,
      enum: ["pending", "enabled", "disabled", "rejected"],
      default: "pending",
    },
    stripeAccountCreatedAt: Date,
    stripeOnboardingCompleted: {
      type: Boolean,
      default: false,
    },
    // Earnings and payout tracking
    earnings: {
      totalEarned: { type: Number, default: 0 },
      availableBalance: { type: Number, default: 0 },
      pendingBalance: { type: Number, default: 0 },
      totalPaidOut: { type: Number, default: 0 },
      lastPayoutAt: Date,
      currency: { type: String, default: "gbp" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", driverSchema);
