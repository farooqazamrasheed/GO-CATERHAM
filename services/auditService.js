const AuditLog = require("../models/AuditLog");

/**
 * Service class for audit logging operations
 */
class AuditService {
  /**
   * Log an admin action
   * @param {Object} logData - Audit log data
   * @returns {Promise<Object>} Created audit log
   */
  static async logAction(logData) {
    try {
      const auditLog = await AuditLog.create({
        userId: logData.userId,
        action: logData.action,
        resource: logData.resource,
        resourceId: logData.resourceId,
        details: logData.details || {},
        ipAddress: logData.ipAddress,
        userAgent: logData.userAgent,
        success: logData.success !== false,
        errorMessage: logData.errorMessage,
        oldValues: logData.oldValues || {},
        newValues: logData.newValues || {},
      });

      // Log to console for development
      console.log(
        `[AUDIT] ${logData.action} by user ${logData.userId}: ${JSON.stringify(
          logData.details
        )}`
      );

      return auditLog;
    } catch (error) {
      console.error("Audit logging error:", error);
      // Don't throw error to avoid breaking main functionality
      return null;
    }
  }

  /**
   * Get audit logs with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Paginated audit logs
   */
  static async getAuditLogs(filters = {}, pagination = {}) {
    try {
      const page = parseInt(pagination.page) || 1;
      const limit = parseInt(pagination.limit) || 50;
      const skip = (page - 1) * limit;

      let query = {};

      // Apply filters
      if (filters.userId) query.userId = filters.userId;
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.resourceId) query.resourceId = filters.resourceId;
      if (filters.success !== undefined) query.success = filters.success;

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate)
          query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }

      const total = await AuditLog.countDocuments(query);
      const logs = await AuditLog.find(query)
        .populate("userId", "fullName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);

      return {
        logs,
        pagination: {
          currentPage: page,
          totalPages,
          totalLogs: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Get audit logs error:", error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Object>} Statistics
   */
  static async getAuditStats(filters = {}) {
    try {
      let matchQuery = {};

      // Apply filters
      if (filters.userId) matchQuery.userId = filters.userId;
      if (filters.startDate || filters.endDate) {
        matchQuery.createdAt = {};
        if (filters.startDate)
          matchQuery.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate)
          matchQuery.createdAt.$lte = new Date(filters.endDate);
      }

      const stats = await AuditLog.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalActions: { $sum: 1 },
            successfulActions: {
              $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] },
            },
            failedActions: {
              $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] },
            },
            actionsByType: {
              $push: "$action",
            },
            actionsByResource: {
              $push: "$resource",
            },
            recentActivity: {
              $push: {
                action: "$action",
                timestamp: "$createdAt",
                success: "$success",
              },
            },
          },
        },
      ]);

      if (stats.length === 0) {
        return {
          totalActions: 0,
          successfulActions: 0,
          failedActions: 0,
          actionsByType: {},
          actionsByResource: {},
          recentActivity: [],
        };
      }

      const result = stats[0];

      // Count actions by type
      const actionsByType = {};
      result.actionsByType.forEach((action) => {
        actionsByType[action] = (actionsByType[action] || 0) + 1;
      });

      // Count actions by resource
      const actionsByResource = {};
      result.actionsByResource.forEach((resource) => {
        actionsByResource[resource] = (actionsByResource[resource] || 0) + 1;
      });

      // Get recent activity (last 10)
      const recentActivity = result.recentActivity
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

      return {
        totalActions: result.totalActions,
        successfulActions: result.successfulActions,
        failedActions: result.failedActions,
        successRate:
          result.totalActions > 0
            ? ((result.successfulActions / result.totalActions) * 100).toFixed(
                2
              )
            : 0,
        actionsByType,
        actionsByResource,
        recentActivity,
      };
    } catch (error) {
      console.error("Get audit stats error:", error);
      throw error;
    }
  }

  /**
   * Clean up old audit logs (for maintenance)
   * @param {number} daysOld - Delete logs older than this many days
   * @returns {Promise<number>} Number of deleted logs
   */
  static async cleanupOldLogs(daysOld = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await AuditLog.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      console.log(
        `Cleaned up ${result.deletedCount} audit logs older than ${daysOld} days`
      );
      return result.deletedCount;
    } catch (error) {
      console.error("Cleanup audit logs error:", error);
      throw error;
    }
  }
}

module.exports = AuditService;
