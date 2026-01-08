# WebSocket API Documentation

## Overview

This document describes all WebSocket events available in the GO-CATERHAM backend. The WebSocket server uses Socket.IO and provides real-time updates for drivers, riders, and admins.

## Connection

### Server URL
```
ws://YOUR_SERVER_URL:5000
```

### Authentication
Include the JWT token when connecting:

```javascript
import { io } from "socket.io-client";

const socket = io("http://YOUR_SERVER_URL:5000", {
  auth: {
    token: "your_jwt_token"
  }
});

socket.on("connect", () => {
  console.log("Connected to WebSocket server");
});

socket.on("disconnect", () => {
  console.log("Disconnected from WebSocket server");
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
});
```

---

## Events by User Type

## 🚗 Driver Events

### Subscribing to Dashboard Updates

```javascript
// Subscribe to driver dashboard updates
socket.emit("subscribe_dashboard", {
  userId: "driver_user_id",
  userType: "driver",
  latitude: 51.2437,    // Optional: auto-saves location if provided
  longitude: -0.5894
});
```

### Sending Location Updates

**Via WebSocket (Recommended for real-time updates):**
```javascript
socket.emit("update_location", {
  latitude: 51.2437,
  longitude: -0.5894,
  heading: 90,      // Optional: direction in degrees
  speed: 30         // Optional: speed in km/h
});

// Success response
socket.on("location_update_success", (data) => {
  console.log("Location updated:", data.timestamp);
});

// Error response
socket.on("location_update_error", (data) => {
  console.error("Location update failed:", data.message);
});
```

**Via REST API:**
```javascript
PUT /api/v1/drivers/status
{
  "status": "online",
  "latitude": 51.2437,
  "longitude": -0.5894
}

// OR

POST /api/v1/drivers/location
{
  "latitude": 51.2437,
  "longitude": -0.5894,
  "heading": 90,
  "speed": 30
}
```

### Events to Listen For

#### `driver_approved`
Received when admin approves the driver account.

```javascript
socket.on("driver_approved", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   status: "approved",
  //   message: "Congratulations! Your driver account has been approved...",
  //   canGoOnline: true,
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show success message and enable "Go Online" button
  alert(data.message);
});
```

#### `driver_rejected`
Received when admin rejects the driver application.

```javascript
socket.on("driver_rejected", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   status: "rejected",
  //   rejectionMessage: "Documents are not clear...",
  //   canReapply: true,
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show rejection reason and prompt to reapply
  alert("Application rejected: " + data.rejectionMessage);
});
```

#### `document_verified`
Received when admin verifies a specific document.

```javascript
socket.on("document_verified", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   documentType: "drivingLicenseFront",
  //   verifiedCount: 5,
  //   totalRequired: 8,
  //   allVerified: false,
  //   message: "Document verified. 5/8 documents verified.",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Update verification progress UI
  updateVerificationProgress(data.verifiedCount, data.totalRequired);
});
```

#### `account_activated`
Received when admin activates the driver account.

```javascript
socket.on("account_activated", (data) => {
  // data: {
  //   userType: "driver",
  //   driverId: "64abc...",
  //   activeStatus: "active",
  //   message: "Your driver account has been activated.",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Re-enable app functionality
});
```

#### `account_deactivated`
Received when admin deactivates the driver account.

```javascript
socket.on("account_deactivated", (data) => {
  // data: {
  //   userType: "driver",
  //   driverId: "64abc...",
  //   activeStatus: "inactive",
  //   message: "Your driver account has been deactivated...",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show deactivation message, disable features, force offline
  alert(data.message);
  goOffline();
});
```

#### `location_reminder`
Received when driver is online but hasn't sent location updates recently.

```javascript
socket.on("location_reminder", (data) => {
  // data: {
  //   type: "no_location" | "stale_location" | "location_update_needed",
  //   message: "You are online but we don't have your location...",
  //   requiresAction: true,
  //   lastLocationAge: 10,  // minutes (or null)
  //   timestamp: "2026-01-07T..."
  // }
  
  if (data.requiresAction) {
    // Show prominent warning - driver won't receive ride requests
    showLocationWarning(data.message);
    
    // Request location permission and send update
    requestLocationAndSend();
  }
});
```

#### `ride_request`
Received when a rider requests a ride near the driver.

```javascript
socket.on("ride_request", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   pickup: { lat: 51.24, lng: -0.58, address: "..." },
  //   dropoff: { lat: 51.23, lng: -0.57, address: "..." },
  //   fare: 12.50,
  //   distance: 2.5,
  //   estimatedDuration: 15,
  //   riderName: "John",
  //   riderRating: 4.8,
  //   expiresAt: "2026-01-07T...",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show ride request modal with countdown timer
  showRideRequest(data);
});
```

#### `ride_cancelled`
Received when rider cancels the ride.

```javascript
socket.on("ride_cancelled", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   reason: "Rider changed plans",
  //   cancelledBy: "rider",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Clear current ride and return to available state
});
```

#### `dashboard_update`
Received for general dashboard data updates.

```javascript
socket.on("dashboard_update", (data) => {
  // data contains updated dashboard information
  updateDashboard(data);
});
```

---

## 🧑 Rider Events

### Subscribing to Dashboard Updates

```javascript
socket.emit("subscribe_dashboard", {
  userId: "rider_user_id",
  userType: "rider",
  latitude: 51.2437,
  longitude: -0.5894
});
```

### Subscribing to Ride Updates

```javascript
// Subscribe to updates for a specific ride
socket.emit("subscribe_ride", {
  rideId: "ride_id_here"
});

// Unsubscribe when done
socket.emit("unsubscribe_ride", {
  rideId: "ride_id_here"
});
```

### Events to Listen For

#### `account_activated`
Received when admin activates the rider account.

```javascript
socket.on("account_activated", (data) => {
  // data: {
  //   userType: "rider",
  //   riderId: "64abc...",
  //   activeStatus: "active",
  //   message: "Your rider account has been activated.",
  //   timestamp: "2026-01-07T..."
  // }
});
```

#### `account_deactivated`
Received when admin deactivates the rider account.

```javascript
socket.on("account_deactivated", (data) => {
  // data: {
  //   userType: "rider",
  //   riderId: "64abc...",
  //   activeStatus: "inactive",
  //   message: "Your rider account has been deactivated...",
  //   timestamp: "2026-01-07T..."
  // }
  
  alert(data.message);
});
```

#### `ride_accepted`
Received when a driver accepts the ride request.

```javascript
socket.on("ride_accepted", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   driverId: "64abc...",
  //   driverName: "Mike",
  //   driverPhoto: "url...",
  //   driverRating: 4.9,
  //   vehicleType: "sedan",
  //   vehiclePlate: "ABC 123",
  //   estimatedArrival: 5,  // minutes
  //   driverLocation: { lat: 51.24, lng: -0.58 },
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show driver info and start tracking
  showDriverOnMap(data);
});
```

#### `driver_location_update`
Received during an active ride with driver's real-time location.

```javascript
socket.on("driver_location_update", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   driverId: "64abc...",
  //   latitude: 51.2437,
  //   longitude: -0.5894,
  //   heading: 90,
  //   speed: 30,
  //   timestamp: "2026-01-07T..."
  // }
  
  // Update driver marker on map
  updateDriverMarker(data.latitude, data.longitude, data.heading);
});
```

#### `driver_arriving`
Received when driver is about to arrive at pickup location.

```javascript
socket.on("driver_arriving", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   estimatedArrival: 2,  // minutes
  //   message: "Your driver is arriving in 2 minutes",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show notification
  showNotification(data.message);
});
```

#### `driver_arrived`
Received when driver arrives at pickup location.

```javascript
socket.on("driver_arrived", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   message: "Your driver has arrived",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show "Driver Arrived" notification
  showNotification(data.message);
});
```

#### `ride_started`
Received when driver starts the ride.

```javascript
socket.on("ride_started", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   startTime: "2026-01-07T...",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Update UI to show ride in progress
});
```

#### `ride_completed`
Received when driver completes the ride.

```javascript
socket.on("ride_completed", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   fare: 12.50,
  //   distance: 2.5,
  //   duration: 15,
  //   endTime: "2026-01-07T...",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show ride summary and rating screen
  showRideSummary(data);
});
```

#### `ride_cancelled`
Received when driver cancels the ride.

```javascript
socket.on("ride_cancelled", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   reason: "Driver had an emergency",
  //   cancelledBy: "driver",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show cancellation message and offer to rebook
});
```

#### `nearby_drivers_update`
Received with updates about available drivers nearby.

```javascript
socket.on("nearby_drivers_update", (data) => {
  // data: {
  //   drivers: [
  //     {
  //       driverId: "64abc...",
  //       location: { lat: 51.24, lng: -0.58 },
  //       heading: 90,
  //       vehicleType: "sedan",
  //       distance: 0.5,  // km
  //       eta: 3  // minutes
  //     },
  //     ...
  //   ],
  //   timestamp: "2026-01-07T..."
  // }
  
  // Update driver markers on map
  updateNearbyDrivers(data.drivers);
});
```

#### `reward_earned`
Received when rider earns reward points.

```javascript
socket.on("reward_earned", (data) => {
  // data: {
  //   points: 50,
  //   reason: "Ride completed",
  //   totalPoints: 1250,
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show points earned animation
});
```

---

## 👨‍💼 Admin Events

### Subscribing to Admin Updates

```javascript
socket.emit("subscribe_dashboard", {
  userId: "admin_user_id",
  userType: "admin"
});

// Also join admin room
socket.emit("join", { room: "admin" });
```

### Events to Listen For

#### `admin_driver_approved`
Received when any admin approves a driver.

```javascript
socket.on("admin_driver_approved", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   driverName: "John Doe",
  //   approvedBy: "Admin Name",
  //   timestamp: "2026-01-07T...",
  //   message: "Driver John Doe has been approved"
  // }
  
  // Update admin dashboard
  refreshDriverList();
});
```

#### `admin_driver_rejected`
Received when any admin rejects a driver.

```javascript
socket.on("admin_driver_rejected", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   driverName: "John Doe",
  //   rejectedBy: "Admin Name",
  //   rejectionMessage: "Documents unclear",
  //   rejectionCount: 1,
  //   timestamp: "2026-01-07T..."
  // }
  
  refreshDriverList();
});
```

#### `admin_document_verified`
Received when any admin verifies a document.

```javascript
socket.on("admin_document_verified", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   documentType: "drivingLicenseFront",
  //   verifiedBy: "Admin Name",
  //   verifiedCount: 5,
  //   totalRequired: 8,
  //   allVerified: false,
  //   timestamp: "2026-01-07T..."
  // }
});
```

#### `admin_driver_activated`
Received when any admin activates a driver account.

```javascript
socket.on("admin_driver_activated", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   activatedBy: "Admin Name",
  //   timestamp: "2026-01-07T..."
  // }
});
```

#### `admin_driver_deactivated`
Received when any admin deactivates a driver account.

```javascript
socket.on("admin_driver_deactivated", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   deactivatedBy: "Admin Name",
  //   timestamp: "2026-01-07T..."
  // }
});
```

#### `admin_rider_activated`
Received when any admin activates a rider account.

```javascript
socket.on("admin_rider_activated", (data) => {
  // data: {
  //   riderId: "64abc...",
  //   activatedBy: "Admin Name",
  //   timestamp: "2026-01-07T..."
  // }
});
```

#### `admin_rider_deactivated`
Received when any admin deactivates a rider account.

```javascript
socket.on("admin_rider_deactivated", (data) => {
  // data: {
  //   riderId: "64abc...",
  //   deactivatedBy: "Admin Name",
  //   timestamp: "2026-01-07T..."
  // }
});
```

#### `admin_new_driver_registration`
Received when a new driver registers.

```javascript
socket.on("admin_new_driver_registration", (data) => {
  // data: {
  //   driverId: "64abc...",
  //   driverName: "John Doe",
  //   email: "john@example.com",
  //   phone: "+44...",
  //   timestamp: "2026-01-07T..."
  // }
  
  // Show notification and update pending drivers count
});
```

#### `admin_ride_alert`
Received for important ride events (cancellations, issues, etc.)

```javascript
socket.on("admin_ride_alert", (data) => {
  // data: {
  //   rideId: "64abc...",
  //   alertType: "cancellation" | "dispute" | "sos",
  //   message: "Ride cancelled by driver",
  //   details: { ... },
  //   timestamp: "2026-01-07T..."
  // }
});
```

---

## Common Patterns

### Reconnection Handling

```javascript
socket.on("disconnect", () => {
  console.log("Disconnected, attempting to reconnect...");
});

socket.on("reconnect", (attemptNumber) => {
  console.log("Reconnected after", attemptNumber, "attempts");
  
  // Re-subscribe to rooms after reconnection
  resubscribeToRooms();
});

socket.on("reconnect_error", (error) => {
  console.error("Reconnection failed:", error);
});
```

### Error Handling

```javascript
socket.on("error", (error) => {
  console.error("Socket error:", error);
});

socket.on("connect_error", (error) => {
  if (error.message === "Authentication error") {
    // Token expired, redirect to login
    redirectToLogin();
  }
});
```

### Joining/Leaving Rooms

```javascript
// Join a specific room
socket.emit("join", { room: "ride_123" });

// Leave a room
socket.emit("leave", { room: "ride_123" });
```

---

## Best Practices

### 1. Location Updates for Drivers

When driver is online, send location updates every **10-30 seconds**:

```javascript
let locationInterval;

function startLocationUpdates() {
  locationInterval = setInterval(async () => {
    const position = await getCurrentPosition();
    socket.emit("update_location", {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: position.coords.heading || 0,
      speed: position.coords.speed || 0
    });
  }, 15000); // Every 15 seconds
}

function stopLocationUpdates() {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
}
```

### 2. Handling Network Changes

```javascript
// Listen for network status
window.addEventListener('online', () => {
  socket.connect();
});

window.addEventListener('offline', () => {
  // Handle offline state gracefully
});
```

### 3. Battery-Efficient Location Updates

For mobile apps, use significant location change APIs when in background:

```javascript
// Foreground: High accuracy, frequent updates
// Background: Lower accuracy, less frequent updates
```

---

## Event Summary Table

| Event | Recipient | Description |
|-------|-----------|-------------|
| `driver_approved` | Driver | Account approved by admin |
| `driver_rejected` | Driver | Account rejected by admin |
| `document_verified` | Driver | Document verified by admin |
| `account_activated` | Driver/Rider | Account activated by admin |
| `account_deactivated` | Driver/Rider | Account deactivated by admin |
| `location_reminder` | Driver | Reminder to send location updates |
| `location_update_success` | Driver | Location update confirmed |
| `location_update_error` | Driver | Location update failed |
| `ride_request` | Driver | New ride request |
| `ride_accepted` | Rider | Driver accepted ride |
| `ride_cancelled` | Driver/Rider | Ride cancelled |
| `ride_started` | Rider | Ride started |
| `ride_completed` | Rider | Ride completed |
| `driver_location_update` | Rider | Driver location during ride |
| `driver_arriving` | Rider | Driver almost at pickup |
| `driver_arrived` | Rider | Driver at pickup |
| `nearby_drivers_update` | Rider | Available drivers nearby |
| `reward_earned` | Rider | Points earned |
| `dashboard_update` | All | Dashboard data update |
| `admin_*` | Admin | Various admin notifications |

---

## Support

For questions about the WebSocket API, contact the backend team or raise an issue in the repository.
