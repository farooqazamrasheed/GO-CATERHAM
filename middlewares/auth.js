// middlewares/auth.js
const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");

module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing",
      });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = verifyToken(token); // Access token verification
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found for provided token",
      });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      isVerified: user.isVerified || false,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error (auth)" });
  }
};
