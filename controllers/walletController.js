const Wallet = require("../models/Wallet");

exports.getWallet = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });
    res.status(200).json({ success: true, wallet });
  } catch (err) {
    next(err);
  }
};
