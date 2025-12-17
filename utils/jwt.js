// utils/jwt.js
const jwt = require("jsonwebtoken");

// ACCESS TOKEN (Short expiry)
exports.generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "6h" });
};

// REFRESH TOKEN (Long expiry)
exports.generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
};

// VERIFY ANY TOKEN
exports.verifyToken = (token, isRefresh = false) => {
  return jwt.verify(
    token,
    isRefresh ? process.env.JWT_REFRESH_SECRET : process.env.JWT_SECRET
  );
};
