const jwt = require("jsonwebtoken");
const User = require("../User/model");
const Supplier = require("../supplier/model");

/**
 * Middleware to verify JWT and attach decoded user to req.user.
 * Works for any role — pass the expected role to restrict further.
 *
 * Usage:
 *   authenticate              — any valid token
 *   authenticate("user")      — only tokens with role === "user"
 *   authenticate("admin")     — only tokens with role === "admin"
 */
const authenticate = (role) => async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token missing",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (role && decoded.role !== role) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (decoded.role === "user") {
      const user = await User.findById(decoded.id)
        .select("isActive +tokenVersion")
        .lean();
      const tokenVersion = decoded.tokenVersion ?? 0;

      if (!user || !user.isActive || tokenVersion !== user.tokenVersion) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }
    }

    if (decoded.role === "supplier") {
      const supplier = await Supplier.findById(decoded.id)
        .select("isActive +tokenVersion")
        .lean();
      const tokenVersion = decoded.tokenVersion ?? 0;
      if (!supplier || !supplier.isActive || tokenVersion !== supplier.tokenVersion) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authenticate;
