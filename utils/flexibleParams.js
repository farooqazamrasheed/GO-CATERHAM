/**
 * Flexible Parameter Helper
 * Allows frontend to use any format for IDs
 * Works with: id, rideId, riderid, ride_id, Id, ID, etc.
 */

/**
 * Get ride ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @returns {string|null} - The ride ID or null if not found
 */
const getRideId = (req) => {
  return req.params.id || 
         req.params.rideId || 
         req.params.rideid || 
         req.params.rideID ||
         req.params.ride_id || 
         req.params.Id ||
         req.params.ID ||
         req.body.id ||
         req.body.rideId ||
         req.body.rideid ||
         req.body.ride_id ||
         null;
};

/**
 * Get user ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @returns {string|null} - The user ID or null if not found
 */
const getUserId = (req) => {
  return req.params.id ||
         req.params.userId ||
         req.params.userid ||
         req.params.userID ||
         req.params.user_id ||
         req.params.Id ||
         req.user?.id ||
         null;
};

/**
 * Get driver ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @returns {string|null} - The driver ID or null if not found
 */
const getDriverId = (req) => {
  return req.params.id ||
         req.params.driverId ||
         req.params.driverid ||
         req.params.driverID ||
         req.params.driver_id ||
         req.params.Id ||
         req.body.driverId ||
         req.body.driver_id ||
         null;
};

/**
 * Get rider ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @returns {string|null} - The rider ID or null if not found
 */
const getRiderId = (req) => {
  return req.params.id ||
         req.params.riderId ||
         req.params.riderid ||
         req.params.riderID ||
         req.params.rider_id ||
         req.params.Id ||
         req.body.riderId ||
         req.body.rider_id ||
         null;
};

/**
 * Get vehicle ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @returns {string|null} - The vehicle ID or null if not found
 */
const getVehicleId = (req) => {
  return req.params.id ||
         req.params.vehicleId ||
         req.params.vehicleid ||
         req.params.vehicleID ||
         req.params.vehicle_id ||
         req.params.Id ||
         null;
};

/**
 * Get payment ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @returns {string|null} - The payment ID or null if not found
 */
const getPaymentId = (req) => {
  return req.params.id ||
         req.params.paymentId ||
         req.params.paymentid ||
         req.params.paymentID ||
         req.params.payment_id ||
         req.params.Id ||
         null;
};

/**
 * Get any generic ID from request params (supports multiple formats)
 * @param {Object} req - Express request object
 * @param {string} paramName - The expected parameter name (e.g., 'ride', 'user', 'driver')
 * @returns {string|null} - The ID or null if not found
 */
const getFlexibleId = (req, paramName) => {
  const lowerName = paramName.toLowerCase();
  const upperName = paramName.charAt(0).toUpperCase() + paramName.slice(1);
  
  return req.params.id ||
         req.params[`${lowerName}Id`] ||
         req.params[`${lowerName}id`] ||
         req.params[`${lowerName}ID`] ||
         req.params[`${lowerName}_id`] ||
         req.params[upperName] ||
         req.params.Id ||
         req.params.ID ||
         req.body.id ||
         req.body[`${lowerName}Id`] ||
         req.body[`${lowerName}_id`] ||
         null;
};

module.exports = {
  getRideId,
  getUserId,
  getDriverId,
  getRiderId,
  getVehicleId,
  getPaymentId,
  getFlexibleId,
};
