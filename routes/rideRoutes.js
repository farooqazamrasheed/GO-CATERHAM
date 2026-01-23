const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");
const { formDataParser } = require("../config/multerConfig");

const rideController = require("../controllers/rideController");

// All ride routes require logged-in user
router.use(auth);

// Fare estimation
router.post(
  "/estimate",
  formDataParser.none(), // Parse form-data fields
  checkPermission("book_ride"),
  rideController.getFareEstimate
);

// Rider actions
router.post(
  "/book",
  // Support both form-data and JSON content types
  (req, res, next) => {
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('multipart/form-data')) {
      return formDataParser.none()(req, res, next);
    }
    // If JSON or other, let express.json() middleware handle it (already configured in app.js)
    next();
  },
  checkPermission("book_ride"),
  rideController.bookRide
);
router.post(
  "/request",
  // Support both form-data and JSON content types
  (req, res, next) => {
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('multipart/form-data')) {
      return formDataParser.none()(req, res, next);
    }
    next();
  },
  checkPermission("book_ride"),
  rideController.bookRide
); // Alias for /book
router.get(
  "/active",
  checkPermission("view_ride_status"),
  rideController.getActiveRide
);
router.get(
  "/history",
  checkPermission("view_rides"),
  require("../controllers/riderController").getRideHistory
); // Alias for /api/v1/riders/rides
router.get(
  "/my-rides",
  checkPermission("view_rides"),
  require("../controllers/riderController").getRideHistory
); // Alias for rider ride history
router.get(
  "/:id/status",
  checkPermission("view_ride_status"),
  rideController.getRideStatus
);
router.get(
  "/:id/driver-location",
  checkPermission("view_ride_status"),
  rideController.getDriverLocation
);
router.put(
  "/:id/cancel",
  formDataParser.none(), // Parse form-data fields
  checkPermission("cancel_ride"),
  rideController.cancelRide
);

// Driver actions - Support both :id and :rideId for flexibility
router.put("/:id/accept", checkPermission("accept_ride"), rideController.acceptRide);
router.put("/:rideId/accept", checkPermission("accept_ride"), rideController.acceptRide); // Alias

router.put("/:id/reject", formDataParser.none(), checkPermission("reject_ride"), rideController.rejectRide);
router.put("/:rideId/reject", formDataParser.none(), checkPermission("reject_ride"), rideController.rejectRide); // Alias

router.put("/:id/arrived", checkPermission("start_ride"), rideController.markDriverArrived);
router.put("/:rideId/arrived", checkPermission("start_ride"), rideController.markDriverArrived); // Alias
router.patch("/:id/arrived", checkPermission("start_ride"), rideController.markDriverArrived); // PATCH alias
router.patch("/:rideId/arrived", checkPermission("start_ride"), rideController.markDriverArrived); // PATCH alias

router.put("/:id/start", checkPermission("start_ride"), rideController.startRide);
router.put("/:rideId/start", checkPermission("start_ride"), rideController.startRide); // Alias
router.patch("/:id/start", checkPermission("start_ride"), rideController.startRide); // PATCH alias
router.patch("/:rideId/start", checkPermission("start_ride"), rideController.startRide); // PATCH alias

router.put("/:id/complete", checkPermission("complete_ride"), rideController.completeRide);
router.put("/:rideId/complete", checkPermission("complete_ride"), rideController.completeRide); // Alias
router.patch("/:id/complete", checkPermission("complete_ride"), rideController.completeRide); // PATCH alias
router.patch("/:rideId/complete", checkPermission("complete_ride"), rideController.completeRide); // PATCH alias

// Tip system
router.post(
  "/:id/tip",
  formDataParser.none(), // Parse form-data fields
  checkPermission("add_tip"),
  rideController.addTip
);

// Rating system
router.post(
  "/:id/rate-driver",
  formDataParser.none(), // Parse form-data fields
  checkPermission("rate_driver"),
  rideController.rateDriver
);

router.post(
  "/:id/rate-rider",
  formDataParser.none(), // Parse form-data fields
  checkPermission("rate_rider"),
  rideController.rateRider
);

module.exports = router;
