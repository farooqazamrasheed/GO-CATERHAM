const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const rideController = require("../controllers/rideController");

// All ride routes require logged-in user
router.use(auth);

// Fare estimation
router.post(
  "/estimate",
  checkPermission("book_ride"),
  rideController.getFareEstimate
);

// Rider actions
router.post("/book", checkPermission("book_ride"), rideController.bookRide);
router.post("/request", checkPermission("book_ride"), rideController.bookRide); // Alias for /book
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
  "/:rideId/status",
  checkPermission("view_ride_status"),
  rideController.getRideStatus
);
router.put(
  "/:rideId/cancel",
  checkPermission("cancel_ride"),
  rideController.cancelRide
);

// Driver actions
router.put(
  "/:rideId/accept",
  checkPermission("accept_ride"),
  rideController.acceptRide
);
router.put(
  "/:rideId/reject",
  checkPermission("reject_ride"),
  rideController.rejectRide
);
router.put(
  "/:rideId/start",
  checkPermission("start_ride"),
  rideController.startRide
);
router.put(
  "/:rideId/complete",
  checkPermission("complete_ride"),
  rideController.completeRide
);

module.exports = router;
