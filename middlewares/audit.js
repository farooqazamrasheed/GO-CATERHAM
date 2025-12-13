const AuditService = require("../services/auditService");

/**
 * Middleware to log admin actions
 * @param {string} action - Action type
 * @param {string} resource - Resource type
 * @param {Function} getDetails - Function to extract details from request/response
 * @returns {Function} Express middleware
 */
const auditLogger = (action, resource, getDetails = null) => {
  return async (req, res, next) => {
    // Store original response methods
    const originalJson = res.json;
    const originalSend = res.send;
    const originalStatus = res.status;

    let responseData = null;
    let statusCode = 200;

    // Override response methods to capture response data
    res.json = function (data) {
      responseData = data;
      return originalJson.call(this, data);
    };

    res.send = function (data) {
      if (typeof data === "object") {
        responseData = data;
      }
      return originalSend.call(this, data);
    };

    res.status = function (code) {
      statusCode = code;
      return originalStatus.call(this, code);
    };

    // Continue with request
    res.on("finish", async () => {
      try {
        // Only log for authenticated admin users
        if (!req.user || !req.user.id) return;

        const isAdminAction = ["superadmin", "admin", "subadmin"].includes(
          req.user.role
        );
        if (!isAdminAction) return;

        // Prepare audit log data
        const auditData = {
          userId: req.user.id,
          action,
          resource,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent") || "Unknown",
          success: statusCode < 400,
          errorMessage:
            statusCode >= 400
              ? responseData?.message || "Unknown error"
              : undefined,
        };

        // Add resource ID if available
        if (req.params.id) {
          auditData.resourceId = req.params.id;
        } else if (req.params.driverId) {
          auditData.resourceId = req.params.driverId;
        } else if (responseData?.admin?._id) {
          auditData.resourceId = responseData.admin._id;
        } else if (responseData?.role?._id) {
          auditData.resourceId = responseData.role._id;
        } else if (responseData?.permission?._id) {
          auditData.resourceId = responseData.permission._id;
        }

        // Get custom details if provided
        if (getDetails) {
          const customDetails = getDetails(req, responseData);
          auditData.details = customDetails.details || {};
          auditData.oldValues = customDetails.oldValues || {};
          auditData.newValues = customDetails.newValues || {};
        } else {
          // Default details extraction
          auditData.details = {
            method: req.method,
            url: req.originalUrl,
            body: req.body,
            query: req.query,
            params: req.params,
          };

          if (responseData && typeof responseData === "object") {
            auditData.newValues = responseData;
          }
        }

        await AuditService.logAction(auditData);
      } catch (error) {
        console.error("Audit logging failed:", error);
        // Don't throw error to avoid breaking the response
      }
    });

    next();
  };
};

/**
 * Pre-built audit loggers for common actions
 */
const auditLoggers = {
  // Admin management
  createAdmin: auditLogger("CREATE_ADMIN", "admin", (req, resData) => ({
    details: {
      adminType: req.body?.adminType,
      assignedPermissions: req.body?.assignedPermissions,
      assignedRoles: req.body?.assignedRoles,
    },
    newValues: resData?.admin || {},
  })),

  updateAdminPermissions: auditLogger(
    "UPDATE_ADMIN_PERMISSIONS",
    "admin",
    (req, resData) => ({
      details: {
        adminId: req.params.id,
        assignedPermissions: req.body?.assignedPermissions,
        assignedRoles: req.body?.assignedRoles,
      },
      newValues: resData?.admin || {},
    })
  ),

  deleteAdmin: auditLogger("DELETE_ADMIN", "admin", (req) => ({
    details: { adminId: req.params.id },
  })),

  // Role management
  createRole: auditLogger("CREATE_ROLE", "role", (req, resData) => ({
    details: {
      roleName: req.body.name,
      permissions: req.body.permissions,
    },
    newValues: resData?.role || {},
  })),

  updateRole: auditLogger("UPDATE_ROLE", "role", (req, resData) => ({
    details: { roleId: req.params.id },
    newValues: resData?.role || {},
  })),

  deleteRole: auditLogger("DELETE_ROLE", "role", (req) => ({
    details: { roleId: req.params.id },
  })),

  // Permission management
  createPermission: auditLogger(
    "CREATE_PERMISSION",
    "permission",
    (req, resData) => ({
      details: {
        permissionName: req.body.name,
        description: req.body.description,
      },
      newValues: resData?.permission || {},
    })
  ),

  updatePermission: auditLogger(
    "UPDATE_PERMISSION",
    "permission",
    (req, resData) => ({
      details: { permissionId: req.params.id },
      newValues: resData?.permission || {},
    })
  ),

  deletePermission: auditLogger("DELETE_PERMISSION", "permission", (req) => ({
    details: { permissionId: req.params.id },
  })),

  // Driver management
  approveDriver: auditLogger("APPROVE_DRIVER", "driver", (req, resData) => ({
    details: { driverId: req.params.driverId },
    newValues: resData?.driver || {},
  })),

  rejectDriver: auditLogger("REJECT_DRIVER", "driver", (req, resData) => ({
    details: { driverId: req.params.driverId },
    newValues: resData?.driver || {},
  })),

  deleteDriver: auditLogger("DELETE_DRIVER", "driver", (req) => ({
    details: { driverId: req.params.driverId },
  })),
};

module.exports = {
  auditLogger,
  auditLoggers,
};
