const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const multer = require("multer");

const authController = require("../controllers/authController");
const profileController = require("../controllers/profileController");

// Middleware to parse form data for auth routes
const parseFormData = multer().none();

router.post("/signup", parseFormData, authController.signup);
router.post("/login", parseFormData, authController.login);
router.post("/logout/:driverId", parseFormData, authController.logoutDriver);
router.post("/logout/:riderId", parseFormData, authController.logoutRider);
router.post("/logout/:adminId", parseFormData, authController.logoutAdmin);
router.post(
  "/logout/:subadminId",
  parseFormData,
  authController.logoutSubadmin
);
router.post(
  "/logout/:superadminId",
  parseFormData,
  authController.logoutSuperadmin
);
router.post("/request-otp", parseFormData, authController.requestOTP);
router.post("/verify-otp", parseFormData, authController.verifyOTP);
router.post("/reset-password", parseFormData, authController.resetPassword);

// Active status management
router.post(
  "/activate/rider/:riderId",
  auth,
  parseFormData,
  profileController.activateRider
);
router.post(
  "/activate/driver/:driverId",
  auth,
  parseFormData,
  profileController.activateDriver
);
router.post(
  "/activate/admin/:adminId",
  auth,
  parseFormData,
  profileController.activateAdmin
);
router.post(
  "/activate/subadmin/:subadminId",
  auth,
  parseFormData,
  profileController.activateSubadmin
);
router.post(
  "/activate/superadmin/:superadminId",
  auth,
  parseFormData,
  profileController.activateSuperadmin
);

router.post(
  "/deactivate/rider/:riderId",
  auth,
  parseFormData,
  profileController.deactivateRider
);
router.post(
  "/deactivate/driver/:driverId",
  auth,
  parseFormData,
  profileController.deactivateDriver
);
router.post(
  "/deactivate/admin/:adminId",
  auth,
  parseFormData,
  profileController.deactivateAdmin
);
router.post(
  "/deactivate/subadmin/:subadminId",
  auth,
  parseFormData,
  profileController.deactivateSubadmin
);
router.post(
  "/deactivate/superadmin/:superadminId",
  auth,
  parseFormData,
  profileController.deactivateSuperadmin
);

module.exports = router;
