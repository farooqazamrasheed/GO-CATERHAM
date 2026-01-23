/**
 * Transform ride data to match API Contract
 * Converts MongoDB field names to frontend-expected field names
 */

/**
 * Transform a single ride object
 * @param {Object} ride - MongoDB ride document
 * @returns {Object} - Transformed ride object matching API contract
 */
const transformRide = (ride) => {
  if (!ride) return null;

  const transformed = {
    // Change _id to id (API Contract requirement)
    id: ride._id.toString(),
    
    // Change rider/driver ObjectIds to riderId/driverId
    riderId: ride.rider?._id?.toString() || ride.rider?.toString(),
    driverId: ride.driver?._id?.toString() || ride.driver?.toString(),
    
    // Keep other fields as is
    status: ride.status,
    fare: ride.fare,
    distance: ride.distance,
    duration: ride.duration,
    
    // Transform pickup location
    pickup: ride.pickupLocation ? {
      address: ride.pickupLocation.address,
      latitude: parseFloat(ride.pickupLocation.coordinates?.[1] || ride.pickupLocation.latitude || 0),
      longitude: parseFloat(ride.pickupLocation.coordinates?.[0] || ride.pickupLocation.longitude || 0),
    } : null,
    
    // Transform dropoff location
    dropoff: ride.dropoffLocation ? {
      address: ride.dropoffLocation.address,
      latitude: parseFloat(ride.dropoffLocation.coordinates?.[1] || ride.dropoffLocation.latitude || 0),
      longitude: parseFloat(ride.dropoffLocation.coordinates?.[0] || ride.dropoffLocation.longitude || 0),
    } : null,
    
    // Transform driver current location if available
    currentLocation: ride.driverLocation ? {
      latitude: parseFloat(ride.driverLocation.coordinates?.[1] || ride.driverLocation.latitude || 0),
      longitude: parseFloat(ride.driverLocation.coordinates?.[0] || ride.driverLocation.longitude || 0),
    } : null,
    
    // Timestamps
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
    acceptedAt: ride.acceptedAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    
    // Populated fields (if available)
    rider: ride.rider && typeof ride.rider === 'object' && ride.rider.fullName ? {
      id: ride.rider._id.toString(),
      name: ride.rider.fullName, // API Contract: 'name' not 'fullName'
      phoneNumber: ride.rider.phoneNumber,
      rating: ride.rider.rating,
      profilePicture: ride.rider.profilePicture,
    } : undefined,
    
    driver: ride.driver && typeof ride.driver === 'object' && ride.driver.user ? {
      id: ride.driver._id.toString(),
      name: ride.driver.user.fullName, // API Contract: 'name' not 'fullName'
      phoneNumber: ride.driver.user.phoneNumber,
      rating: ride.driver.rating,
      profilePicture: ride.driver.profilePicture,
      vehicle: ride.driver.vehicle ? {
        type: ride.driver.vehicle.type,
        make: ride.driver.vehicle.make,
        model: ride.driver.vehicle.model,
        color: ride.driver.vehicle.color,
        year: ride.driver.vehicle.year,
        vehicleNumber: ride.driver.vehicle.plateNumber || ride.driver.vehicle.vehicleNumber, // API Contract: 'vehicleNumber' not 'plateNumber'
      } : undefined,
    } : undefined,
  };

  // Remove undefined fields
  Object.keys(transformed).forEach(key => 
    transformed[key] === undefined && delete transformed[key]
  );

  return transformed;
};

/**
 * Transform an array of rides
 * @param {Array} rides - Array of MongoDB ride documents
 * @returns {Array} - Array of transformed ride objects
 */
const transformRides = (rides) => {
  if (!rides || !Array.isArray(rides)) return [];
  return rides.map(transformRide);
};

module.exports = {
  transformRide,
  transformRides,
};
