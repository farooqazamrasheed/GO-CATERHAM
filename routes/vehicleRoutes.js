const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const rbac = require("../middlewares/rbac");
const vehicleController = require("../controllers/vehicleController");

// All routes require driver authentication
router.use(auth, rbac("driver"));

// Add vehicle
router.post("/", vehicleController.addVehicle);

// Update vehicle
router.put("/", vehicleController.updateVehicle);

// Get vehicle info
router.get("/", vehicleController.getVehicle);

module.exports = router;
