// middlewares/auth.js
const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");

module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    console.log("\n🔐 [Auth Middleware]");
    console.log("   Auth Header Present:", !!authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("   ❌ No authorization header or invalid format");
      return res.status(401).json({
        success: false,
        message: "Authorization token missing",
      });
    }

    const token = authHeader.split(" ")[1];
    console.log("   Token Present:", !!token);

    let decoded;
    try {
      decoded = verifyToken(token); // Access token verification
      console.log("   ✅ Token verified, User ID:", decoded.id);
    } catch (err) {
      console.log("   ❌ Token verification failed:", err.message);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.log("   ❌ User not found:", decoded.id);
      return res.status(401).json({
        success: false,
        message: "User not found for provided token",
      });
    }

    console.log("   ✅ User authenticated:", user.email, "Role:", user.role);

    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      isVerified: user.isVerified || false,
    };

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error (auth)" });
  }
};
