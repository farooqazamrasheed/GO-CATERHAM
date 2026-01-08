# Live Location API Reference

## Overview

This document provides a complete API reference for implementing live location features in the GO-CATERHAM mobile apps (Driver & Rider). It covers all location-related endpoints, WebSocket events, and best practices for real-time location tracking.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Driver Location APIs](#driver-location-apis)
3. [Rider Location APIs](#rider-location-apis)
4. [Nearby Drivers System](#nearby-drivers-system)
5. [Real-time Tracking During Rides](#real-time-tracking-during-rides)
6. [ETA Calculations](#eta-calculations)
7. [Geofencing & Boundaries](#geofencing--boundaries)
8. [WebSocket Events for Location](#websocket-events-for-location)
9. [Best Practices](#best-practices)
10. [Error Handling](#error-handling)
11. [Code Examples](#code-examples)

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Driver App    │     │    Backend      │     │   Rider App     │
│                 │     │                 │     │                 │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ GPS       │──┼────►│  │ LiveLoc   │──┼────►│  │ Map View  │  │
│  │ Service   │  │     │  │ Database  │  │     │  │           │  │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │
│                 │     │                 │     │                 │
│  Send location  │     │  Store & relay  │     │  Display driver │
│  every 10-30s   │     │  to subscribers │     │  on map         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **LiveLocation** | Database record storing driver's current position |
| **Recent Location** | Location updated within last 5 minutes (drivers appear in searches) |
| **Surrey Boundary** | Service area polygon - drivers/pickups must be within |
| **ETA** | Estimated Time of Arrival calculated from distance & speed |

---

## Driver Location APIs

### 1. Update Driver Status (with Location)

When a driver goes online, they **MUST** include their location to be visible to riders.

**Endpoint:** `PUT /api/v1/drivers/status`

**Headers:**
```
Authorization: Bearer <driver_jwt_token>
Content-Type: application/json
```

**Request Body:**
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

**Success Response (200):**
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

> ⚠️ **Important:** If `requiresLocation: true`, immediately call the location update endpoint!

---

### 2. Update Driver Location (Periodic Updates)

Send location updates every **10-30 seconds** while online.

**Endpoint:** `POST /api/v1/drivers/location`

**Headers:**
```
Authorization: Bearer <driver_jwt_token>
Content-Type: application/json
```

**Request Body:**
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

**Success Response (200):**
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

**Error Response (400) - Outside Boundary:**
```json
{
  "status": "error",
  "message": "Location must be within Surrey boundary"
}
```

---

### 3. Update Location via WebSocket (Alternative)

For more efficient real-time updates, use WebSocket instead of REST.

**Emit Event:** `update_location`

```javascript
socket.emit("update_location", {
  latitude: 51.24372854,
  longitude: -0.58948157,
  heading: 180,
  speed: 35
});
```

**Success Response Event:** `location_update_success`
```javascript
socket.on("location_update_success", (data) => {
  // data: { message: "Location updated successfully", timestamp: "..." }
});
```

**Error Response Event:** `location_update_error`
```javascript
socket.on("location_update_error", (data) => {
  // data: { message: "Error description", timestamp: "..." }
});
```

---

### 4. Get Driver's Current Location

**Endpoint:** `GET /api/v1/drivers/location`

**Headers:**
```
Authorization: Bearer <driver_jwt_token>
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "location": {
      "latitude": 51.24372854,
      "longitude": -0.58948157,
      "heading": 180,
      "speed": 35,
      "timestamp": "2026-01-07T12:30:00.000Z"
    },
    "isRecent": true,
    "ageInSeconds": 45
  }
}
```

---

## Rider Location APIs

### 1. Get Available Drivers Near Rider

Fetch nearby available drivers for display on map.

**Endpoint:** `GET /api/v1/riders/available-drivers`

**Headers:**
```
Authorization: Bearer <rider_jwt_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Rider's current latitude |
| `longitude` | number | Yes | Rider's current longitude |
| `radius` | number | No | Search radius in meters (default: 5000) |
| `vehicleType` | string | No | Filter by vehicle type: `sedan`, `suv`, `electric` |

**Example Request:**
```
GET /api/v1/riders/available-drivers?latitude=51.2437&longitude=-0.5894&radius=5000&vehicleType=sedan
```

**Success Response (200):**
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
      },
      {
        "driverId": "6956c5a21e681f55c6dde311",
        "driverName": "Jane Smith",
        "location": {
          "latitude": 51.24234567,
          "longitude": -0.59012345
        },
        "heading": 270,
        "vehicleType": "sedan",
        "distance": 1.2,
        "eta": 5,
        "speed": 25,
        "lastUpdated": "2026-01-07T12:29:45.000Z"
      }
    ],
    "count": 2,
    "searchRadius": 5000,
    "timestamp": "2026-01-07T12:30:15.000Z"
  }
}
```

**Response Fields:**

| Field | Description |
|-------|-------------|
| `driverId` | Unique driver identifier |
| `driverName` | Driver's display name |
| `location` | Driver's current coordinates |
| `heading` | Direction driver is facing (degrees) |
| `vehicleType` | Type of vehicle |
| `distance` | Distance from rider in km |
| `eta` | Estimated arrival time in minutes |
| `speed` | Driver's current speed in km/h |
| `lastUpdated` | When driver's location was last updated |

---

### 2. Get Fare Estimate (Includes Driver Availability)

**Endpoint:** `POST /api/v1/rides/estimate`

**Headers:**
```
Authorization: Bearer <rider_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "pickupLat": 51.24372854,
  "pickupLng": -0.58948157,
  "pickupAddress": "123 High Street, Guildford",
  "dropoffLat": 51.23521873,
  "dropoffLng": -0.57240172,
  "dropoffAddress": "456 London Road, Guildford",
  "vehicleType": "sedan"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "estimateId": "est_e336e9891f8c0c4f",
    "pickup": {
      "lat": 51.24372854,
      "lng": -0.58948157,
      "address": "123 High Street, Guildford"
    },
    "dropoff": {
      "lat": 51.23521873,
      "lng": -0.57240172,
      "address": "456 London Road, Guildford"
    },
    "vehicleType": "sedan",
    "distance": {
      "kilometers": 1.5,
      "miles": 0.9
    },
    "duration": {
      "formatted": "15 min",
      "minutes": 15
    },
    "fare": 12.74,
    "estimatedFare": 12.74,
    "fareBreakdown": {
      "baseFare": 3.00,
      "distanceFare": 1.42,
      "timeFare": 3.75,
      "surgeMultiplier": 1.3,
      "subtotal": 10.62,
      "tax": 2.12,
      "total": 12.74
    },
    "currency": "GBP",
    "driverAvailability": {
      "count": 3,
      "estimatedPickupTime": 5,
      "message": "3 drivers available nearby"
    },
    "expiresAt": "2026-01-07T12:40:00.000Z",
    "validFor": "10 minutes"
  }
}
```

**Driver Availability States:**

| State | Response |
|-------|----------|
| Drivers available | `{ "count": 3, "estimatedPickupTime": 5, "message": "3 drivers available nearby" }` |
| No drivers | `{ "count": 0, "estimatedPickupTime": 15, "message": "No drivers available right now" }` |

---

## Nearby Drivers System

### How It Works

1. **Driver goes online** → Sends location → Stored in `LiveLocation` collection
2. **Driver sends periodic updates** → Every 10-30 seconds
3. **Rider opens app** → Requests nearby drivers
4. **Backend queries** → Finds drivers with location updated in last 5 minutes
5. **Filters applied:**
   - Driver status = `"online"`
   - Driver isApproved = `"approved"`
   - Driver activeStatus = `"active"`
   - Location within service boundary
   - Within requested radius

### Driver Visibility Requirements

For a driver to appear in rider searches, ALL conditions must be met:

| Requirement | Check |
|-------------|-------|
| Online status | `driver.status === "online"` |
| Approved account | `driver.isApproved === "approved"` |
| Active account | `driver.activeStatus === "active"` |
| Recent location | Location updated within last 5 minutes |
| Within boundary | Inside Surrey service area |
| Within radius | Within rider's search radius |

---

## Real-time Tracking During Rides

### Subscribe to Ride Updates

After a ride is confirmed, both driver and rider should subscribe to real-time updates.

**WebSocket Event:** `subscribe_ride`

```javascript
socket.emit("subscribe_ride", {
  rideId: "ride_64abc123..."
});
```

### Driver Location Updates During Ride

**Event:** `driver_location_update`

Riders receive this event every time the assigned driver's location changes.

```javascript
socket.on("driver_location_update", (data) => {
  // data: {
  //   rideId: "ride_64abc123...",
  //   driverId: "6956c5a21e681f55c6dde310",
  //   latitude: 51.24372854,
  //   longitude: -0.58948157,
  //   heading: 90,
  //   speed: 35,
  //   timestamp: "2026-01-07T12:30:00.000Z"
  // }
  
  updateDriverMarkerOnMap(data.latitude, data.longitude, data.heading);
});
```

### Driver Arrival Events

**Event:** `driver_arriving`
```javascript
socket.on("driver_arriving", (data) => {
  // data: {
  //   rideId: "ride_64abc123...",
  //   estimatedArrival: 2,  // minutes
  //   message: "Your driver is arriving in 2 minutes"
  // }
  
  showNotification(data.message);
});
```

**Event:** `driver_arrived`
```javascript
socket.on("driver_arrived", (data) => {
  // data: {
  //   rideId: "ride_64abc123...",
  //   message: "Your driver has arrived"
  // }
  
  showNotification(data.message);
  vibratePhone();
});
```

### Unsubscribe from Ride Updates

When ride is completed or cancelled:

```javascript
socket.emit("unsubscribe_ride", {
  rideId: "ride_64abc123..."
});
```

---

## ETA Calculations

### How ETA is Calculated

```
ETA (minutes) = (Distance in km / Speed in km/h) × 60

If speed < 10 km/h:
  ETA = Distance × 3  (assumes 20 km/h average in traffic)

Minimum ETA: 1 minute
Maximum ETA: 60 minutes (drivers beyond this are not shown)
```

### ETA in API Responses

| Context | Field | Unit |
|---------|-------|------|
| Available drivers | `eta` | minutes |
| Fare estimate | `driverAvailability.estimatedPickupTime` | minutes |
| During ride | `estimatedArrival` | minutes |

---

## Geofencing & Boundaries

### Service Area: Surrey, UK

The service operates within a defined polygon covering Surrey. Coordinates outside this boundary will be rejected.

**Approximate Boundary:**
```
Northwest: 51.47, -0.85
Northeast: 51.47, 0.07
Southeast: 51.07, 0.07
Southwest: 51.07, -0.85
```

### Boundary Validation

**For Drivers:**
- Location updates outside boundary → Warning logged (currently allowed for testing)
- In production → `400` error: "Location must be within Surrey boundary"

**For Riders:**
- Pickup location outside boundary → `400` error: "Pickup location is outside service area"
- Dropoff location outside boundary → `400` error: "Dropoff location is outside service area"

### Check if Location is Valid

**Endpoint:** `POST /api/v1/rides/validate-location`

```json
{
  "latitude": 51.24372854,
  "longitude": -0.58948157
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "isValid": true,
    "inServiceArea": true,
    "message": "Location is within service area"
  }
}
```

---

## WebSocket Events for Location

### Driver App Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `update_location` | Emit | Send current location |
| `location_update_success` | Receive | Location saved confirmation |
| `location_update_error` | Receive | Location save failed |
| `location_reminder` | Receive | Prompt to send location (when stale) |

### Rider App Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `subscribe_ride` | Emit | Subscribe to ride updates |
| `unsubscribe_ride` | Emit | Unsubscribe from ride updates |
| `driver_location_update` | Receive | Driver's real-time location |
| `driver_arriving` | Receive | Driver almost at pickup |
| `driver_arrived` | Receive | Driver at pickup location |
| `nearby_drivers_update` | Receive | Updated list of nearby drivers |

### Location Reminder Event (Driver)

Backend sends this when driver is online but hasn't sent location recently.

```javascript
socket.on("location_reminder", (data) => {
  // data: {
  //   type: "no_location" | "stale_location" | "location_update_needed",
  //   message: "You are online but we don't have your location...",
  //   requiresAction: true,
  //   lastLocationAge: 10,  // minutes (or null)
  //   timestamp: "2026-01-07T12:30:00.000Z"
  // }
  
  if (data.requiresAction) {
    // Show warning to driver
    showLocationWarning(data.message);
    
    // Request GPS permission and send location
    requestLocationPermission().then(() => {
      sendCurrentLocation();
    });
  }
});
```

---

## Best Practices

### 1. Driver App - Location Updates

```javascript
// Configuration
const LOCATION_UPDATE_INTERVAL = 15000; // 15 seconds
const HIGH_ACCURACY = true;

let locationWatchId = null;

// Start tracking when going online
function startLocationTracking() {
  // First, get current position immediately
  navigator.geolocation.getCurrentPosition(
    (position) => sendLocation(position),
    (error) => handleLocationError(error),
    { enableHighAccuracy: HIGH_ACCURACY }
  );
  
  // Then watch for changes
  locationWatchId = navigator.geolocation.watchPosition(
    (position) => sendLocation(position),
    (error) => handleLocationError(error),
    {
      enableHighAccuracy: HIGH_ACCURACY,
      maximumAge: 10000,        // Accept cached position up to 10s old
      timeout: 15000,           // Wait max 15s for position
      distanceFilter: 10        // Update if moved 10+ meters (mobile)
    }
  );
  
  // Also send periodic updates as backup
  setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => sendLocation(position),
      (error) => console.warn("Periodic location failed:", error)
    );
  }, LOCATION_UPDATE_INTERVAL);
}

// Stop tracking when going offline
function stopLocationTracking() {
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
}

// Send location via WebSocket (preferred) or REST API
function sendLocation(position) {
  const locationData = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    heading: position.coords.heading || 0,
    speed: (position.coords.speed || 0) * 3.6 // Convert m/s to km/h
  };
  
  // Prefer WebSocket for real-time updates
  if (socket && socket.connected) {
    socket.emit("update_location", locationData);
  } else {
    // Fallback to REST API
    fetch("/api/v1/drivers/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(locationData)
    });
  }
}
```

### 2. Rider App - Display Nearby Drivers

```javascript
const REFRESH_INTERVAL = 30000; // 30 seconds

let refreshTimer = null;

// Start fetching nearby drivers
function startNearbyDriversRefresh(riderLocation) {
  // Fetch immediately
  fetchNearbyDrivers(riderLocation);
  
  // Then refresh periodically
  refreshTimer = setInterval(() => {
    fetchNearbyDrivers(riderLocation);
  }, REFRESH_INTERVAL);
}

// Stop refreshing
function stopNearbyDriversRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// Fetch nearby drivers
async function fetchNearbyDrivers(location) {
  try {
    const response = await fetch(
      `/api/v1/riders/available-drivers?` +
      `latitude=${location.latitude}&` +
      `longitude=${location.longitude}&` +
      `radius=5000`,
      {
        headers: { "Authorization": `Bearer ${token}` }
      }
    );
    
    const data = await response.json();
    
    if (data.status === "success") {
      updateDriverMarkersOnMap(data.data.drivers);
    }
  } catch (error) {
    console.error("Failed to fetch nearby drivers:", error);
  }
}

// Update map markers
function updateDriverMarkersOnMap(drivers) {
  // Clear existing markers
  clearDriverMarkers();
  
  // Add new markers
  drivers.forEach(driver => {
    addDriverMarker({
      id: driver.driverId,
      position: driver.location,
      rotation: driver.heading,
      vehicleType: driver.vehicleType
    });
  });
}
```

### 3. Real-time Tracking During Ride

```javascript
// Subscribe when ride is accepted
function onRideAccepted(rideId, driverInfo) {
  // Subscribe to ride updates
  socket.emit("subscribe_ride", { rideId });
  
  // Show driver on map
  showDriverOnMap(driverInfo);
  
  // Listen for location updates
  socket.on("driver_location_update", (data) => {
    if (data.rideId === rideId) {
      animateDriverMarker(data.latitude, data.longitude, data.heading);
      updateETA(data);
    }
  });
  
  socket.on("driver_arriving", (data) => {
    showNotification("Driver arriving soon!");
  });
  
  socket.on("driver_arrived", (data) => {
    showNotification("Your driver has arrived!");
    vibratePhone();
  });
}

// Unsubscribe when ride ends
function onRideEnded(rideId) {
  socket.emit("unsubscribe_ride", { rideId });
  socket.off("driver_location_update");
  socket.off("driver_arriving");
  socket.off("driver_arrived");
  clearDriverMarker();
}
```

### 4. Battery Optimization (Mobile)

```javascript
// Adjust accuracy based on app state
function setLocationAccuracy(appState) {
  if (appState === "foreground") {
    // High accuracy when app is visible
    return {
      enableHighAccuracy: true,
      distanceFilter: 10,      // 10 meters
      interval: 10000          // 10 seconds
    };
  } else if (appState === "background") {
    // Lower accuracy when in background
    return {
      enableHighAccuracy: false,
      distanceFilter: 50,      // 50 meters
      interval: 30000          // 30 seconds
    };
  }
}

// For React Native, use significant location changes in background
import BackgroundGeolocation from 'react-native-background-geolocation';

BackgroundGeolocation.configure({
  desiredAccuracy: BackgroundGeolocation.HIGH_ACCURACY,
  stationaryRadius: 25,
  distanceFilter: 10,
  stopOnTerminate: false,
  startOnBoot: true,
  interval: 15000,
  fastestInterval: 5000,
  activitiesInterval: 10000
});
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Location must be within Surrey boundary" | GPS coordinates outside service area | Show user message about service area |
| "Driver profile not found" | User not registered as driver | Redirect to driver registration |
| "Location (latitude and longitude) is required" | Missing coordinates | Request GPS permission |
| "Invalid coordinates" | Malformed lat/lng values | Validate before sending |

### GPS Permission Denied

```javascript
function handleLocationError(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      showAlert(
        "Location Required",
        "Please enable location services to use this app.",
        [{ text: "Open Settings", onPress: openAppSettings }]
      );
      break;
      
    case error.POSITION_UNAVAILABLE:
      showAlert(
        "Location Unavailable",
        "Unable to determine your location. Please try again."
      );
      break;
      
    case error.TIMEOUT:
      showAlert(
        "Location Timeout",
        "Location request timed out. Please check your GPS signal."
      );
      break;
  }
}
```

---

## Quick Reference

### Driver Flow
```
1. Login
2. Go Online → Send status + location
3. Start periodic location updates (every 15s)
4. Receive ride requests
5. Accept ride → Location shared with rider automatically
6. Complete ride
7. Continue location updates OR Go Offline
```

### Rider Flow
```
1. Login
2. Open app → See nearby drivers on map
3. Enter destination → Get fare estimate + driver availability
4. Request ride
5. Ride accepted → Subscribe to driver location updates
6. Track driver in real-time
7. Ride complete → Unsubscribe
```

### Required Permissions

| Platform | Permission | Usage |
|----------|------------|-------|
| iOS | `NSLocationWhenInUseUsageDescription` | Foreground location |
| iOS | `NSLocationAlwaysAndWhenInUseUsageDescription` | Background location (driver) |
| Android | `ACCESS_FINE_LOCATION` | GPS location |
| Android | `ACCESS_BACKGROUND_LOCATION` | Background location (driver) |

---

## Support

For questions about the Live Location API, contact the backend team or raise an issue in the repository.
