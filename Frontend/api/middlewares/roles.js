/**
 * Role-based access control middleware for Vercel serverless functions.
 * Usage:
 *   const roleCheck = hasRole("student")(req, res, user);
 *   if (!roleCheck) return;
 */

export const hasRole = (requiredRole) => {
  return (req, res, user) => {
    if (!user || !user.role) {
      return res.status(401).json({ message: "Unauthorized: user not authenticated." });
    }

    if (Array.isArray(requiredRole)) {
      if (!requiredRole.includes(user.role)) {
        return res.status(403).json({
          message: `Access denied. Requires one of: ${requiredRole.join(", ")}.`,
        });
      }
    } else {
      if (user.role !== requiredRole) {
        return res.status(403).json({
          message: `Access denied. Requires role: ${requiredRole}.`,
        });
      }
    }

    // ✅ Authorized
    return true;
  };
};
