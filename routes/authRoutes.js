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
router.post("/logout", auth, parseFormData, authController.logout);
router.post("/request-otp", parseFormData, authController.requestOTP);
router.post("/verify-otp", parseFormData, authController.verifyOTP);
router.post("/reset-password", parseFormData, authController.resetPassword);

// Active status management
router.post(
  "/deactivate",
  auth,
  parseFormData,
  profileController.deactivateAccount
);
router.post(
  "/activate",
  auth,
  parseFormData,
  profileController.activateAccount
);

module.exports = router;
