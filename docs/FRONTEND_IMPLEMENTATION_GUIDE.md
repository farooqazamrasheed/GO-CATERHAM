# Frontend Implementation Guide

## Overview

This document outlines the required frontend changes to integrate with the backend driver location and availability system.

---

## 1. Driver App - Going Online

### Endpoint
`PUT /api/v1/drivers/status`

### Request
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
| `latitude` | number | Yes* | Driver's current latitude |
| `longitude` | number | Yes* | Driver's current longitude |
| `heading` | number | No | Direction in degrees (0-360) |
| `speed` | number | No | Speed in km/h |

> *Location is required when going `online` for driver to appear in rider searches.

### Response
```json
{
  "status": "success",
  "message": "Status updated successfully",
  "data": {
    "driver": { ... },
    "locationSaved": true,
    "isVisible": true
  }
}
```

### Response (Missing Location)
```json
{
  "status": "success",
  "message": "You are online but your location was not sent...",
  "data": {
    "driver": { ... },
    "locationSaved": false,
    "isVisible": false,
    "requiresLocation": true,
    "locationEndpoint": "POST /api/v1/drivers/location"
  }
}
```

### Response Flags

| Flag | Type | Description |
|------|------|-------------|
| `locationSaved` | boolean | Whether location was saved to database |
| `isVisible` | boolean | Whether driver appears in rider searches |
| `requiresLocation` | boolean | If `true`, prompt user to enable GPS |
| `warning` | string | Warning message to display |

### Frontend Action Required
```javascript
const response = await updateDriverStatus('online', latitude, longitude);

if (response.data.requiresLocation) {
  // Show GPS enable prompt
  showAlert("Please enable GPS to receive ride requests");
}

if (response.data.isVisible) {
  // Driver is now visible to riders
  showStatus("You're online and visible to riders");
} else {
  // Driver is online but NOT visible
  showWarning("You're online but riders can't see you. Enable GPS.");
}
```

---

## 2. Driver App - Continuous Location Updates

> **IMPORTANT**: Driver locations older than 5 minutes are filtered out. Send updates every 10-30 seconds.

### Option A: REST API

**Endpoint:** `POST /api/v1/drivers/location`

**Request:**
```json
{
  "latitude": 51.24372854,
  "longitude": -0.58948157,
  "heading": 180,
  "speed": 35
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Location updated successfully",
  "data": {
    "location": {
      "_id": "...",
      "driver": "...",
      "latitude": 51.24372854,
      "longitude": -0.58948157,
      "heading": 180,
      "speed": 35,
      "timestamp": "2026-01-07T14:30:00.000Z"
    }
  }
}
```

### Option B: WebSocket (Recommended)

**Emit:**
```javascript
socket.emit('update_location', {
  latitude: 51.24372854,
  longitude: -0.58948157,
  heading: 180,
  speed: 35
});
```

**Listen:**
```javascript
socket.on('location_update_success', (data) => {
  // Location saved successfully
  console.log('Updated at:', data.timestamp);
});

socket.on('location_update_error', (data) => {
  // Handle error
  console.error(data.message);
});
```

### Implementation Example
```javascript
// Start location tracking when driver goes online
let locationInterval = null;

const startLocationTracking = () => {
  locationInterval = setInterval(async () => {
    const position = await getCurrentPosition();
    
    // Option A: REST
    await fetch('/api/v1/drivers/location', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading || 0,
        speed: (position.coords.speed || 0) * 3.6 // m/s to km/h
      })
    });
    
    // Option B: WebSocket
    socket.emit('update_location', {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: position.coords.heading || 0,
      speed: (position.coords.speed || 0) * 3.6
    });
    
  }, 15000); // Every 15 seconds
};

const stopLocationTracking = () => {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
};
```

---

## 3. Driver App - Handle Location Reminder

When driver's location becomes stale, backend sends a reminder via WebSocket.

**Listen:**
```javascript
socket.on('location_reminder', (data) => {
  // data structure:
  // {
  //   type: "stale_location" | "no_location" | "location_update_needed",
  //   message: "Your location is 10 minutes old...",
  //   requiresAction: true,
  //   lastLocationAge: 10,  // minutes (null if no location)
  //   timestamp: "2026-01-07T14:30:00.000Z"
  // }
  
  if (data.requiresAction) {
    showGPSPrompt(data.message);
  }
});
```

### Reminder Types

| Type | Severity | Action |
|------|----------|--------|
| `no_location` | High | Show "Enable GPS" modal |
| `stale_location` | High | Show "Location outdated" warning |
| `location_update_needed` | Low | Soft reminder, check GPS |

---

## 4. Rider App - Get Available Drivers

### Endpoint
`GET /api/v1/riders/available-drivers`

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `latitude` | number | Yes | - | Rider's latitude |
| `longitude` | number | Yes | - | Rider's longitude |
| `radius` | number | No | 5000 | Search radius in meters (max 50000) |
| `vehicleType` | string | No | - | Filter by vehicle type |

### Request Example
```
GET /api/v1/riders/available-drivers?latitude=51.2437&longitude=-0.5894&radius=5000
```

### Response
```json
{
  "status": "success",
  "message": "Available drivers retrieved successfully",
  "data": {
    "drivers": [
      {
        "driverId": "6956c5a21e681f55c6dde310",
        "driverName": "Hamza Mullah",
        "location": {
          "latitude": 31.4918552,
          "longitude": 74.4306538
        },
        "heading": 180,
        "vehicleType": "sedan",
        "distance": 1.2,
        "eta": 3,
        "speed": 35,
        "lastUpdated": "2026-01-07T14:34:08.230Z"
      }
    ],
    "count": 1,
    "searchRadius": 5000,
    "timestamp": "2026-01-07T14:34:21.042Z"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `driverId` | string | Driver's unique ID |
| `driverName` | string | Driver's full name |
| `location` | object | `{ latitude, longitude }` |
| `heading` | number | Direction (0-360 degrees) |
| `vehicleType` | string | Vehicle type (sedan, suv, etc.) |
| `distance` | number | Distance from rider in km |
| `eta` | number | Estimated arrival time in minutes |
| `speed` | number | Current speed in km/h |
| `lastUpdated` | string | ISO timestamp of last location update |

### Vehicle Types
- `sedan`
- `suv`
- `electric`
- `hatchback`
- `coupe`
- `convertible`
- `wagon`
- `pickup`
- `van`
- `motorcycle`

### Implementation Example
```javascript
const getAvailableDrivers = async (latitude, longitude, radius = 5000, vehicleType = null) => {
  let url = `/api/v1/riders/available-drivers?latitude=${latitude}&longitude=${longitude}&radius=${radius}`;
  
  if (vehicleType) {
    url += `&vehicleType=${vehicleType}`;
  }
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  return data.data.drivers;
};

// Poll for driver updates every 10 seconds
const startDriverPolling = (latitude, longitude) => {
  setInterval(async () => {
    const drivers = await getAvailableDrivers(latitude, longitude);
    updateMapMarkers(drivers);
  }, 10000);
};
```

---

## 5. WebSocket Events Reference

### Driver App Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `update_location` | Emit | Send location update |
| `location_update_success` | Listen | Location saved confirmation |
| `location_update_error` | Listen | Location save failed |
| `location_reminder` | Listen | GPS/location reminder |
| `ride_request` | Listen | New ride request |
| `ride_taken` | Listen | Ride taken by another driver |
| `dashboard_update` | Listen | Dashboard data changed |

### Rider App Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `driver_assigned` | Listen | Driver accepted ride |
| `driver_location_update` | Listen | Driver location changed |
| `ride_status_change` | Listen | Ride status updated |
| `ride_cancelled` | Listen | Ride was cancelled |

---

## 6. Ride Request Handling (Driver App)

### Event: `ride_request`

```javascript
socket.on('ride_request', (data) => {
  // data structure:
  // {
  //   rideId: "...",
  //   riderId: "...",
  //   riderName: "John Doe",
  //   pickup: {
  //     latitude: 51.2437,
  //     longitude: -0.5894,
  //     address: "123 Main St"
  //   },
  //   dropoff: {
  //     latitude: 51.2500,
  //     longitude: -0.5800,
  //     address: "456 Oak Ave"
  //   },
  //   distance: 5.2,
  //   fare: 15.50,
  //   estimatedFare: 15.50,
  //   vehicleType: "sedan",
  //   expiresAt: "2026-01-07T14:35:00.000Z",
  //   timeLeft: 30,
  //   timestamp: "2026-01-07T14:34:30.000Z"
  // }
  
  showRideRequestModal(data);
  startCountdown(data.timeLeft, data.expiresAt);
});
```

### Implementation Example
```javascript
const showRideRequestModal = (rideRequest) => {
  // Calculate remaining time
  const expiresAt = new Date(rideRequest.expiresAt);
  const now = new Date();
  const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  
  // Show modal with countdown
  setModalData({
    ...rideRequest,
    remainingSeconds
  });
  setShowModal(true);
  
  // Start countdown
  const timer = setInterval(() => {
    const remaining = Math.max(0, Math.floor((expiresAt - new Date()) / 1000));
    setRemainingTime(remaining);
    
    if (remaining <= 0) {
      clearInterval(timer);
      setShowModal(false);
      // Auto-reject or timeout
    }
  }, 1000);
};
```

---

## 7. Driver Location Updates for Active Ride (Rider App)

### Event: `driver_location_update`

```javascript
socket.on('driver_location_update', (data) => {
  // data structure:
  // {
  //   rideId: "...",
  //   driverId: "...",
  //   latitude: 51.2437,
  //   longitude: -0.5894,
  //   heading: 180,
  //   speed: 35,
  //   timestamp: "2026-01-07T14:35:00.000Z"
  // }
  
  updateDriverMarkerOnMap(data);
  recalculateETA(data);
});
```

---

## 8. Connection Setup

### WebSocket Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://your-server-url:5000', {
  query: { token: 'YOUR_JWT_TOKEN' }
});

socket.on('connect', () => {
  console.log('Connected to server');
  
  // Subscribe to dashboard updates
  socket.emit('subscribe_dashboard', {
    userId: user.id,
    userType: 'driver', // or 'rider'
    latitude: currentLatitude,
    longitude: currentLongitude
  });
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

---

## 9. Error Handling

### Common Error Responses

| Status Code | Message | Action |
|-------------|---------|--------|
| 400 | "Latitude and longitude are required" | Check GPS permissions |
| 400 | "Driver must be online to update location" | Update driver status first |
| 401 | "Unauthorized" | Refresh token or re-login |
| 404 | "Driver profile not found" | Complete driver registration |
| 429 | "Location updates too frequent" | Reduce update frequency |

### Implementation
```javascript
const handleApiError = (error) => {
  switch (error.status) {
    case 400:
      if (error.message.includes('location')) {
        requestGPSPermission();
      }
      break;
    case 401:
      refreshToken();
      break;
    case 429:
      // Slow down updates
      increaseUpdateInterval();
      break;
    default:
      showErrorToast(error.message);
  }
};
```

---

## 10. Checklist

### Driver App
- [ ] Send location with status update when going online
- [ ] Handle `requiresLocation` flag in status response
- [ ] Implement continuous location updates (every 10-30 seconds)
- [ ] Handle `location_reminder` WebSocket event
- [ ] Handle `ride_request` with countdown timer
- [ ] Stop location tracking when going offline

### Rider App
- [ ] Call `available-drivers` endpoint with rider's location
- [ ] Display drivers on map with correct markers
- [ ] Poll for driver updates or use WebSocket
- [ ] Handle `driver_location_update` during active ride
- [ ] Filter drivers by vehicle type (optional)

---

## 11. Testing

### Test Driver Visibility
1. Driver goes online with location → Should see `isVisible: true`
2. Wait 6 minutes without location update → Driver disappears from searches
3. Send location update → Driver reappears

### Test Available Drivers
```bash
curl -X GET "http://localhost:5000/api/v1/riders/available-drivers?latitude=51.2437&longitude=-0.5894&radius=5000" \
  -H "Authorization: Bearer <RIDER_TOKEN>"
```

### Test Location Update
```bash
curl -X POST "http://localhost:5000/api/v1/drivers/location" \
  -H "Authorization: Bearer <DRIVER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 51.2437, "longitude": -0.5894, "heading": 180, "speed": 35}'
```

---

## Contact

For questions about this implementation, contact the backend team.
