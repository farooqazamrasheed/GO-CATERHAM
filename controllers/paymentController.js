const Payment = require("../models/Payment");

exports.getPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find({ rider: req.user._id });
    res.status(200).json({ success: true, payments });
  } catch (err) {
    next(err);
  }
};
