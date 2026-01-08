# Backend Changes Required for Live Location Feature

## Overview

This document outlines the backend changes required to ensure the mobile app's live location feature works correctly. The mobile app has been updated to follow the `LIVE_LOCATION_API.md` specification.

---

## 🔴 CRITICAL ISSUE IDENTIFIED

**Backend Log Analysis:**
```
DEBUG [getNearbyDrivers]: Total LiveLocation records: 6
DEBUG [getNearbyDrivers]: Found 0 recent locations
```

**Root Cause:** The backend has 6 LiveLocation records but considers **ALL of them stale** (not recent). This means:
1. Either the "recent" threshold is too strict (e.g., 1-2 minutes)
2. OR the `timestamp` field is not being updated when location is updated
3. OR locations are being saved but with old timestamps

**Recommended Fix:** 
- Check the "recent" threshold in `getNearbyDrivers` - should be **5 minutes** (300,000 ms), not 1-2 minutes
- Ensure `timestamp` is set to `new Date()` on every location update (not just on document creation)

---

## Current Issues

1. **Driver going online WITHOUT location** - The warning message indicates location is not being saved when driver goes online
2. **Drivers not appearing in rider searches** - Even when online, drivers are not visible to riders (0 recent locations found)
3. **Ride requests not showing on driver dashboard** - May be related to location/visibility issues

---

## API Endpoints to Verify/Update

### 1. Update Driver Status - `PUT /api/v1/drivers/status`

**Expected Request Body:**
```json
{
  "status": "online",
  "latitude": 51.24372854,
  "longitude": -0.58948157,
  "heading": 90,
  "speed": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `"online"`, `"offline"`, or `"busy"` |
| `latitude` | number | Yes* | Latitude (-90 to 90). *Required when going online |
| `longitude` | number | Yes* | Longitude (-180 to 180). *Required when going online |
| `heading` | number | No | Direction in degrees (0-360). 0 = North |
| `speed` | number | No | Speed in km/h |

**Expected Success Response (200):**
```json
{
  "status": "success",
  "message": "Status updated successfully",
  "data": {
    "driver": {
      "_id": "6956c5a21e681f55c6dde310",
      "status": "online",
      "isApproved": "approved",
      "vehicleType": "sedan"
    },
    "locationSaved": true,
    "isVisible": true
  }
}
```

**Warning Response (200) - No Location Provided:**
```json
{
  "status": "success",
  "message": "You are online but your location was not sent...",
  "data": {
    "driver": { ... },
    "locationSaved": false,
    "isVisible": false,
    "warning": "You are online but your location was not sent. You will NOT appear in rider searches...",
    "requiresLocation": true,
    "locationEndpoint": "POST /api/v1/drivers/location"
  }
}
```

**Backend Implementation Notes:**
- Extract `latitude`, `longitude`, `heading`, `speed` from request body (at root level, NOT nested in `location` object)
- Save to `LiveLocation` collection when going online
- Set `locationSaved: true` and `isVisible: true` in response if location was saved successfully
- Set `requiresLocation: true` if location was not provided or failed to save

---

### 2. Update Driver Location - `POST /api/v1/drivers/location`

This endpoint should be called by drivers every 10-30 seconds while online.

**Expected Request Body:**
```json
{
  "latitude": 51.24372854,
  "longitude": -0.58948157,
  "heading": 180,
  "speed": 35,
  "timestamp": "2026-01-07T12:30:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `latitude` | number | Yes | Current latitude |
| `longitude` | number | Yes | Current longitude |
| `heading` | number | No | Direction in degrees (0-360) |
| `speed` | number | No | Current speed in km/h |
| `timestamp` | string | No | ISO timestamp (defaults to server time) |

**Expected Success Response (200):**
```json
{
  "status": "success",
  "message": "Location updated successfully",
  "data": {
    "location": {
      "_id": "64abc123...",
      "driver": "6956c5a21e681f55c6dde310",
      "latitude": 51.24372854,
      "longitude": -0.58948157,
      "heading": 180,
      "speed": 35,
      "timestamp": "2026-01-07T12:30:00.000Z"
    }
  }
}
```

**Backend Implementation Notes:**
- Verify driver is authenticated (JWT)
- Verify driver status is `online`
- Update/upsert `LiveLocation` record for this driver
- Optionally validate location is within Surrey boundary

---

### 3. Get Available Drivers - `GET /api/v1/riders/available-drivers`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Rider's current latitude |
| `longitude` | number | Yes | Rider's current longitude |
| `radius` | number | No | Search radius in meters (default: 5000) |
| `vehicleType` | string | No | Filter by vehicle type |

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "drivers": [
      {
        "driverId": "6956c5a21e681f55c6dde310",
        "driverName": "John Doe",
        "location": {
          "latitude": 51.24501234,
          "longitude": -0.58123456
        },
        "heading": 90,
        "vehicleType": "sedan",
        "distance": 0.8,
        "eta": 3,
        "speed": 30,
        "lastUpdated": "2026-01-07T12:30:00.000Z"
      }
    ],
    "count": 1,
    "searchRadius": 5000,
    "timestamp": "2026-01-07T12:30:15.000Z"
  }
}
```

**Backend Query Logic:**
```javascript
// Find drivers that meet ALL these criteria:
const drivers = await LiveLocation.aggregate([
  {
    $match: {
      // Location updated within last 5 minutes
      timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      // Within search radius (using geospatial query)
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: radius
        }
      }
    }
  },
  {
    $lookup: {
      from: "drivers",
      localField: "driver",
      foreignField: "_id",
      as: "driverInfo"
    }
  },
  {
    $match: {
      "driverInfo.status": "online",
      "driverInfo.isApproved": "approved",
      "driverInfo.activeStatus": "active"
    }
  }
]);
```

---

## WebSocket Events to Implement/Verify

### 1. `update_location` (Client → Server)

**Payload:**
```javascript
socket.emit("update_location", {
  latitude: 51.24372854,
  longitude: -0.58948157,
  heading: 180,
  speed: 35
});
```

**Backend Handler:**
```javascript
socket.on("update_location", async (data) => {
  try {
    const { latitude, longitude, heading, speed } = data;
    const driverId = socket.user.id; // From JWT auth
    
    // Update LiveLocation
    await LiveLocation.findOneAndUpdate(
      { driver: driverId },
      {
        latitude,
        longitude,
        heading: heading || 0,
        speed: speed || 0,
        timestamp: new Date()
      },
      { upsert: true }
    );
    
    // Acknowledge success
    socket.emit("location_update_success", {
      message: "Location updated successfully",
      timestamp: new Date().toISOString()
    });
    
    // Broadcast to riders tracking this driver (if in active ride)
    const activeRide = await Ride.findOne({ driver: driverId, status: "in_progress" });
    if (activeRide) {
      io.to(`ride_${activeRide._id}`).emit("driver_location_update", {
        rideId: activeRide._id,
        driverId,
        latitude,
        longitude,
        heading,
        speed,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    socket.emit("location_update_error", {
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### 2. `location_update_success` (Server → Client)

```javascript
socket.emit("location_update_success", {
  message: "Location updated successfully",
  timestamp: "2026-01-07T12:30:00.000Z"
});
```

### 3. `location_update_error` (Server → Client)

```javascript
socket.emit("location_update_error", {
  message: "Error description",
  timestamp: "2026-01-07T12:30:00.000Z"
});
```

### 4. `location_reminder` (Server → Client)

Send when driver is online but hasn't sent location recently (e.g., > 2 minutes).

```javascript
socket.emit("location_reminder", {
  type: "stale_location", // or "no_location", "location_update_needed"
  message: "Your location hasn't been updated in 5 minutes. Please ensure GPS is enabled.",
  requiresAction: true,
  lastLocationAge: 5, // minutes since last update (or null if no location)
  timestamp: "2026-01-07T12:30:00.000Z"
});
```

**Backend Implementation (scheduled job or middleware):**
```javascript
// Check every minute for stale locations
setInterval(async () => {
  const staleDrivers = await Driver.find({
    status: "online",
    // Has no recent location OR location is stale
  });
  
  for (const driver of staleDrivers) {
    const location = await LiveLocation.findOne({ driver: driver._id });
    const ageInMinutes = location 
      ? (Date.now() - location.timestamp.getTime()) / 60000 
      : null;
    
    if (!location || ageInMinutes > 5) {
      io.to(`driver_${driver._id}`).emit("location_reminder", {
        type: location ? "stale_location" : "no_location",
        message: location 
          ? `Your location hasn't been updated in ${Math.floor(ageInMinutes)} minutes.`
          : "You are online but we don't have your location.",
        requiresAction: true,
        lastLocationAge: ageInMinutes,
        timestamp: new Date().toISOString()
      });
    }
  }
}, 60000); // Every minute
```

### 5. `ride_request` (Server → Client)

When a ride request is available for the driver.

```javascript
socket.emit("ride_request", {
  rideId: "ride_64abc123...",
  riderId: "rider_123...",
  riderName: "Jane Doe",
  pickup: {
    latitude: 51.24372854,
    longitude: -0.58948157,
    address: "123 High Street, Guildford"
  },
  dropoff: {
    latitude: 51.23521873,
    longitude: -0.57240172,
    address: "456 London Road, Guildford"
  },
  distance: 1.5, // km
  fare: 12.50, // estimated fare
  estimatedFare: 12.50,
  expiresAt: "2026-01-07T12:31:00.000Z", // 30 seconds from now
  timestamp: "2026-01-07T12:30:30.000Z"
});
```

---

## Database Schema Verification

### LiveLocation Collection

Ensure the `LiveLocation` collection has these fields:

```javascript
const LiveLocationSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    unique: true // One record per driver
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  heading: {
    type: Number,
    default: 0
  },
  speed: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true // Index for efficient "recent location" queries
  },
  // Geospatial index for nearby queries
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  }
}, { timestamps: true });

// Pre-save hook to update geospatial field
LiveLocationSchema.pre('save', function(next) {
  this.location = {
    type: 'Point',
    coordinates: [this.longitude, this.latitude]
  };
  next();
});

// Also add pre-update hook for findOneAndUpdate
LiveLocationSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.latitude && update.longitude) {
    update.location = {
      type: 'Point',
      coordinates: [update.longitude, update.latitude]
    };
  }
  next();
});
```

---

## 🔧 IMMEDIATE FIX REQUIRED: getNearbyDrivers

The backend's `getNearbyDrivers` function is filtering out all drivers because of the "recent" timestamp check.

### Current Behavior (Problem):
```javascript
// Backend is likely doing something like this:
const recentThreshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes - TOO STRICT!
const recentLocations = await LiveLocation.find({
  timestamp: { $gte: recentThreshold }
});
// Result: 0 recent locations (all 6 records are older than 2 minutes)
```

### Required Fix:
```javascript
// Change the threshold to 5 minutes (300,000 ms)
const LOCATION_STALENESS_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const recentThreshold = new Date(Date.now() - LOCATION_STALENESS_THRESHOLD);

const recentLocations = await LiveLocation.find({
  timestamp: { $gte: recentThreshold }
});
```

### Also Ensure Timestamp Updates on Every Location Update:

When updating driver location (via REST API or WebSocket), ensure `timestamp` is always set:

```javascript
// In your updateDriverLocation controller/handler:
await LiveLocation.findOneAndUpdate(
  { driver: driverId },
  {
    latitude,
    longitude,
    heading: heading || 0,
    speed: speed || 0,
    timestamp: new Date(), // 👈 CRITICAL: Always update timestamp!
    updatedAt: new Date()
  },
  { upsert: true, new: true }
);
```

### Quick Debug Query (MongoDB Shell):
```javascript
// Check all LiveLocation records and their timestamps
db.livelocations.find({}, { driver: 1, timestamp: 1, latitude: 1, longitude: 1 }).sort({ timestamp: -1 })

// Check how old the most recent location is
db.livelocations.aggregate([
  { $sort: { timestamp: -1 } },
  { $limit: 1 },
  { $project: { 
    driver: 1, 
    timestamp: 1,
    ageInMinutes: { $divide: [{ $subtract: [new Date(), "$timestamp"] }, 60000] }
  }}
])
```

---

## Debugging Checklist

### When Driver Goes Online:

1. ✅ Check request body contains `latitude` and `longitude` (not nested in `location` object)
2. ✅ Verify `LiveLocation` record is created/updated
3. ✅ Response includes `locationSaved: true`
4. ✅ Response includes `isVisible: true`
5. ✅ If location missing, response includes `requiresLocation: true`

### When Rider Searches for Drivers:

1. ✅ Query filters by `timestamp > (now - 5 minutes)`
2. ✅ Query filters by `driver.status === "online"`
3. ✅ Query filters by `driver.isApproved === "approved"`
4. ✅ Query filters by `driver.activeStatus === "active"`
5. ✅ Query uses geospatial index for radius search
6. ✅ Response includes all required fields (`driverId`, `location`, `heading`, `eta`, etc.)

### WebSocket Events:

1. ✅ `update_location` event is received and processed
2. ✅ `location_update_success` is emitted after successful update
3. ✅ `location_update_error` is emitted on failure
4. ✅ `location_reminder` is sent to online drivers with stale/missing location
5. ✅ `ride_request` is sent to nearby online drivers when rider requests ride

---

## Testing Commands

### Test Driver Status Update (cURL):

```bash
curl -X PUT http://localhost:5000/api/v1/drivers/status \
  -H "Authorization: Bearer <DRIVER_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "online",
    "latitude": 51.24372854,
    "longitude": -0.58948157,
    "heading": 90,
    "speed": 0
  }'
```

### Test Driver Location Update (cURL):

```bash
curl -X POST http://localhost:5000/api/v1/drivers/location \
  -H "Authorization: Bearer <DRIVER_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 51.24372854,
    "longitude": -0.58948157,
    "heading": 180,
    "speed": 35
  }'
```

### Test Available Drivers (cURL):

```bash
curl -X GET "http://localhost:5000/api/v1/riders/available-drivers?latitude=51.2437&longitude=-0.5894&radius=5000" \
  -H "Authorization: Bearer <RIDER_JWT_TOKEN>"
```

---

## Summary of Required Backend Changes

| Component | Change Required |
|-----------|-----------------|
| `PUT /api/v1/drivers/status` | Accept `latitude`, `longitude`, `heading`, `speed` at root level |
| `PUT /api/v1/drivers/status` | Return `locationSaved`, `isVisible`, `requiresLocation` in response |
| `POST /api/v1/drivers/location` | Create endpoint if not exists |
| `GET /api/v1/riders/available-drivers` | Filter by recent location (< 5 min) AND driver status/approval |
| WebSocket `update_location` | Save to LiveLocation, emit success/error |
| WebSocket `location_reminder` | Send to online drivers with stale location |
| WebSocket `ride_request` | Include all required fields (pickup, dropoff, fare, expiresAt) |
| Database | Ensure LiveLocation has geospatial index |

---

## Contact

For questions about these requirements, please contact the mobile app team.
