const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const rbac = require("../middlewares/rbac");

const paymentController = require("../controllers/paymentController");

// All payment routes need authentication
router.use(auth);

// Rider can view payments
router.get("/", rbac("rider"), paymentController.getPayments);

module.exports = router;
