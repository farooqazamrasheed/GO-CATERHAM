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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", driverSchema);
