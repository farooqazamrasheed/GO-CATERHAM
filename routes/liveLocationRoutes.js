const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const rbac = require("../middlewares/rbac");

const liveLocationController = require("../controllers/liveLocationController");

// Only drivers can update live location
router.use(auth, rbac("driver"));

router.post("/update", liveLocationController.updateLocation);

module.exports = router;
