// middlewares/rbac.js
module.exports = function rbac(...allowedRoles) {
  return (req, res, next) => {
    try {
      // Must be authenticated first
      if (!req.user || !req.user.role) {
        return res
          .status(401)
          .json({ success: false, message: "Not authenticated" });
      }

      const userRole = req.user.role;

      // If no roles provided → allow any logged-in user
      if (allowedRoles.length === 0) {
        return next();
      }

      // Check role
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role(s): [${allowedRoles.join(
            ", "
          )}]. Your role: ${userRole}.`,
        });
      }

      next();
    } catch (err) {
      console.error("RBAC middleware error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Server error (rbac)" });
    }
  };
};
