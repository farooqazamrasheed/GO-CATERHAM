const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 8 },
    role: {
      type: String,
      enum: ["rider", "driver", "admin", "superadmin", "subadmin"],
      required: true,
    },
    // Extended profile fields
    profilePicture: { type: String },
    address: {
      street: { type: String },
      city: { type: String },
      postcode: { type: String },
      country: { type: String, default: "UK" },
    },
    dateOfBirth: { type: Date },
    preferences: {
      language: { type: String, default: "en" },
      currency: { type: String, default: "GBP" },
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
      },
      privacy: {
        shareRideHistory: { type: Boolean, default: false },
        showOnlineStatus: { type: Boolean, default: true },
      },
    },
    isVerified: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    otp: String,
    otpExpiry: Date,
    otpAttempts: { type: Number, default: 0 },
    lastOtpRequest: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    lastLocationUpdate: Date, // For rate limiting location updates
  },
  { timestamps: true }
);

// Password hashing
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Password comparison
userSchema.methods.comparePassword = async function (password) {
  if (this.password.startsWith("$2")) {
    return await bcrypt.compare(password, this.password);
  } else {
    return password === this.password;
  }
};

module.exports = mongoose.model("User", userSchema);
