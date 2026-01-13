const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");

const walletController = require("../controllers/walletController");

// User must be logged in
router.use(auth);

router.get("/", walletController.getWallet);

module.exports = router;
