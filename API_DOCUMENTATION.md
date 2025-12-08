# 🚗 GO-CATERHAM TAXI APP - COMPLETE API DOCUMENTATION

## 📋 **OVERVIEW**

This document provides comprehensive documentation for all implemented APIs in the GO-CATERHAM taxi application backend. All APIs are fully functional and tested.

**📅 Last Updated:** December 5, 2025
**🔄 Recent Changes:**

- ✅ Added `GET /api/v1/drivers/verification/status` - Driver verification status endpoint
- ✅ Added `GET /api/v1/drivers/status` - Get current driver status endpoint
- ✅ Updated driver status to support "busy" state
- ✅ Enhanced driver profile documentation with complete response format

---

## 🔐 **AUTHENTICATION**

All protected routes require JWT authentication via `Authorization: Bearer <token>` header.

### **1. User Registration**

**Endpoint:** `POST /api/v1/auth/signup`

**Request Body:**

```json
{
  "username": "string",
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "password": "string",
  "confirmPassword": "string",
  "role": "rider" | "driver" | "admin"
}
```

**Response:**

```json
{
  "status": "success",
  "message": "User created",
  "data": {
    "user": { "id": "string", "username": "string", "role": "rider" },
    "token": "jwt_token",
    "refreshToken": "refresh_token",
    "profile": {
      /* profile data */
    }
  }
}
```

### **2. User Login**

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**

```json
{
  "identifier": "username|email|phone",
  "password": "string",
  "role": "rider" | "driver" | "admin" | "superadmin"
}
```

**Response:** Same as registration

### **3. Logout**

**Endpoint:** `POST /api/v1/auth/logout`
**Headers:** `Authorization: Bearer <token>`

### **4. Password Reset**

- `POST /api/v1/auth/request-otp` - Request OTP
- `POST /api/v1/auth/verify-otp` - Verify OTP
- `POST /api/v1/auth/reset-password` - Reset password

---

## 👤 **RIDER APIs**

### **1. Rider Profile Management**

#### **Get Rider Profile**

**Endpoint:** `GET /api/v1/riders/profile`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "username": "string",
  "totalRides": 25,
  "averageRating": 4.8,
  "memberSince": "2025-01-01T00:00:00Z",
  "profilePhoto": "url"
}
```

#### **Update Rider Profile**

**Endpoint:** `PUT /api/v1/riders/profile`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "fullName": "string",
  "phone": "string",
  "profilePhoto": "base64_string"
}
```

#### **Upload Profile Picture**

**Endpoint:** `POST /api/v1/riders/profile/picture`
**Headers:** `Authorization: Bearer <token>`
**Content-Type:** `multipart/form-data`

### **2. Ride Management**

#### **Request a Ride (Primary)**

**Endpoint:** `POST /api/v1/rides/request`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "estimateId": "string", // From fare estimation
  "paymentMethod": "wallet" | "cash",
  "scheduledTime": "ISO_date_string" // Optional for future booking
}
```

**Response:**

```json
{
  "rideId": "string",
  "status": "searching" | "assigned",
  "estimatedPickupTime": 15,
  "driverAssigned": true,
  "scheduledTime": "ISO_date",
  "message": "Driver assigned! Estimated pickup in 15 minutes"
}
```

#### **Request a Ride (Alternative)**

**Endpoint:** `POST /api/v1/rides/book`
**Same request/response as above**

#### **Get Active Ride**

**Endpoint:** `GET /api/v1/rides/active`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "rideId": "string",
  "status": "assigned" | "in_progress",
  "driver": {
    "name": "John Doe",
    "phone": "+447000000000",
    "rating": 4.8,
    "vehicle": {
      "make": "Toyota",
      "model": "Prius",
      "color": "Blue",
      "plateNumber": "AB12CDE"
    }
  },
  "locations": {
    "pickup": { "address": "123 Main St", "eta": 5 },
    "dropoff": { "address": "456 High St", "eta": 20 }
  },
  "fare": { "estimated": 25.0, "actual": 0, "currency": "GBP" },
  "timing": {
    "estimatedPickupTime": 15,
    "startTime": "ISO_date"
  }
}
```

#### **Get Ride Status**

**Endpoint:** `GET /api/v1/rides/:rideId/status`
**Headers:** `Authorization: Bearer <token>`

#### **Cancel Ride**

**Endpoint:** `PUT /api/v1/rides/:rideId/cancel`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "reason": "Changed my mind"
}
```

### **3. Ride History**

#### **Get Ride History (Primary)**

**Endpoint:** `GET /api/v1/rides/history?page=1&limit=20`
**Headers:** `Authorization: Bearer <token>`

#### **Get Ride History (Alternative)**

**Endpoint:** `GET /api/v1/riders/rides?page=1&limit=20`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "rides": [
    {
      "rideId": "string",
      "date": "2025-01-01T10:00:00Z",
      "driverName": "John Doe",
      "pickup": { "address": "123 Main St" },
      "dropoff": { "address": "456 High St" },
      "fare": 25.0,
      "distance": 5.2,
      "duration": 15,
      "status": "completed",
      "rating": 5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 25,
    "hasMore": true
  }
}
```

### **4. Payment Methods**

#### **Get Payment Methods**

**Endpoint:** `GET /api/v1/riders/profile/payment-methods`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "methods": [
    {
      "id": "string",
      "type": "card" | "cash" | "wallet",
      "lastFourDigits": "1234",
      "isDefault": true
    }
  ]
}
```

#### **Add Payment Method**

**Endpoint:** `POST /api/v1/riders/profile/payment-methods`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "type": "card",
  "cardNumber": "4111111111111111",
  "expiryMonth": "12",
  "expiryYear": "25",
  "cvv": "123"
}
```

#### **Delete Payment Method**

**Endpoint:** `DELETE /api/v1/riders/profile/payment-methods/:id`
**Headers:** `Authorization: Bearer <token>`

### **5. Rewards System**

#### **Get Rewards (Primary)**

**Endpoint:** `GET /api/v1/rider/rewards`
**Headers:** `Authorization: Bearer <token>`

#### **Get Rewards (Alternative)**

**Endpoint:** `GET /api/v1/rewards/balance`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "points": 1250,
  "tier": "silver" | "gold" | "platinum",
  "rewards": [
    {
      "id": "string",
      "title": "10% Off Next Ride",
      "description": "Get 10% off your next ride",
      "pointsCost": 500,
      "expiresAt": "2025-12-31T23:59:59Z"
    }
  ]
}
```

#### **Get Available Rewards**

**Endpoint:** `GET /api/v1/rewards/available`
**Headers:** `Authorization: Bearer <token>`

#### **Redeem Reward**

**Endpoint:** `POST /api/v1/rewards/redeem`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "rewardId": "string"
}
```

#### **Get Referral Info**

**Endpoint:** `GET /api/v1/rewards/referrals`
**Headers:** `Authorization: Bearer <token>`

#### **Get Rewards Activity**

**Endpoint:** `GET /api/v1/rewards/activity`
**Headers:** `Authorization: Bearer <token>`

### **6. Dashboard & Wallet**

#### **Get Rider Dashboard**

**Endpoint:** `GET /api/v1/riders/dashboard`
**Headers:** `Authorization: Bearer <token>`

#### **Top-up Wallet**

**Endpoint:** `POST /api/v1/riders/wallet/topup`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "amount": 50.0,
  "paymentMethod": "card"
}
```

---

## 👨‍💼 **DRIVER APIs**

### **1. Driver Profile Management**

#### **Create Driver Profile**

**Endpoint:** `POST /api/v1/drivers/profile`
**Headers:** `Authorization: Bearer <token>`

#### **Get Driver Profile**

**Endpoint:** `GET /api/v1/drivers/profile`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "vehicle": "string",
  "numberPlate": "string",
  "licenseNumber": "string",
  "verificationStatus": "unverified" | "verified",
  "rating": 4.5,
  "totalRides": 0,
  "memberSince": "2025-12-05T00:00:00Z"
}
```

#### **Get Driver Verification Status**

**Endpoint:** `GET /api/v1/drivers/verification/status`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "verificationStatus": "unverified" | "verified",
  "canGoOnline": false,
  "rejectionReason": null
}
```

#### **Get Current Driver Status**

**Endpoint:** `GET /api/v1/drivers/status`
**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "status": "offline" | "online" | "busy"
}
```

#### **Update Driver Status**

**Endpoint:** `PUT /api/v1/drivers/status`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "status": "online" | "offline" | "busy"
}
```

**Status Rules:**

- **offline**: Driver not accepting rides (always allowed)
- **online**: Driver available for rides (requires verified status)
- **busy**: Driver on active ride (requires verified status)

### **2. Ride Management**

#### **Accept Ride**

**Endpoint:** `PUT /api/v1/rides/:rideId/accept`
**Headers:** `Authorization: Bearer <token>`

#### **Reject Ride**

**Endpoint:** `PUT /api/v1/rides/:rideId/reject`
**Headers:** `Authorization: Bearer <token>`

#### **Start Ride**

**Endpoint:** `PUT /api/v1/rides/:rideId/start`
**Headers:** `Authorization: Bearer <token>`

#### **Complete Ride**

**Endpoint:** `PUT /api/v1/rides/:rideId/complete`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "actualDistance": 5.2,
  "actualDuration": 15
}
```

### **3. Location Updates**

#### **Update Driver Location**

**Endpoint:** `POST /api/v1/live-location/update`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "latitude": 51.5074,
  "longitude": -0.1278,
  "heading": 90,
  "speed": 30
}
```

### **4. Earnings & Reports**

#### **Get Earnings Report**

**Endpoint:** `GET /api/v1/drivers/earnings/report`
**Headers:** `Authorization: Bearer <token>`
**Query Params:** `?startDate=2025-01-01&endDate=2025-01-31&format=pdf`

---

## 👑 **ADMIN APIs**

### **1. Authentication**

- Same as regular users but with `role: "admin"` or `role: "superadmin"`

### **2. Driver Management**

#### **Approve Driver**

**Endpoint:** `PUT /api/v1/admin/driver/:driverId/approve`
**Headers:** `Authorization: Bearer <token>`

#### **Reject Driver**

**Endpoint:** `PUT /api/v1/admin/driver/:driverId/reject`
**Headers:** `Authorization: Bearer <token>`

### **3. Admin Management (Superadmin/Admin only)**

#### **Create Admin/Subadmin**

**Endpoint:** `POST /api/v1/admin/admins`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "fullName": "string",
  "email": "string",
  "password": "string",
  "adminType": "admin" | "subadmin",
  "assignedPermissions": ["permission_id"],
  "assignedRoles": ["role_id"]
}
```

#### **List Admins**

**Endpoint:** `GET /api/v1/admin/admins?page=1&limit=10`
**Headers:** `Authorization: Bearer <token>`

#### **Update Admin Permissions**

**Endpoint:** `PUT /api/v1/admin/admins/:id/permissions`
**Headers:** `Authorization: Bearer <token>`

#### **Delete Admin**

**Endpoint:** `DELETE /api/v1/admin/admins/:id`
**Headers:** `Authorization: Bearer <token>`

### **4. Role Management**

#### **Create Role**

**Endpoint:** `POST /api/v1/roles`
**Headers:** `Authorization: Bearer <token>`

#### **List Roles**

**Endpoint:** `GET /api/v1/roles?page=1&limit=10`
**Headers:** `Authorization: Bearer <token>`

#### **Update Role**

**Endpoint:** `PUT /api/v1/roles/:id`
**Headers:** `Authorization: Bearer <token>`

#### **Delete Role**

**Endpoint:** `DELETE /api/v1/roles/:id`
**Headers:** `Authorization: Bearer <token>`

### **5. Permission Management**

#### **Create Permission**

**Endpoint:** `POST /api/v1/permissions`
**Headers:** `Authorization: Bearer <token>`

#### **List Permissions**

**Endpoint:** `GET /api/v1/permissions?page=1&limit=10`
**Headers:** `Authorization: Bearer <token>`

#### **Update Permission**

**Endpoint:** `PUT /api/v1/permissions/:id`
**Headers:** `Authorization: Bearer <token>`

#### **Delete Permission**

**Endpoint:** `DELETE /api/v1/permissions/:id`
**Headers:** `Authorization: Bearer <token>`

---

## 🛠️ **UTILITY APIs**

### **1. Fare Estimation**

**Endpoint:** `POST /api/v1/rides/estimate`
**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "pickupLat": 51.5074,
  "pickupLng": -0.1278,
  "pickupAddress": "123 Main St, London",
  "dropoffLat": 51.5074,
  "dropoffLng": -0.1278,
  "dropoffAddress": "456 High St, London",
  "vehicleType": "sedan" | "SUV" | "electric"
}
```

**Response:**

```json
{
  "estimateId": "est_abc123",
  "pickup": { "lat": 51.5074, "lng": -0.1278, "address": "123 Main St" },
  "dropoff": { "lat": 51.5074, "lng": -0.1278, "address": "456 High St" },
  "vehicleType": "sedan",
  "distance": { "miles": 5.2, "kilometers": 8.4 },
  "duration": { "minutes": 15, "formatted": "15 min" },
  "fareBreakdown": {
    "baseFare": 3.0,
    "distanceFare": 10.4,
    "timeFare": 0.75,
    "surgeMultiplier": 1.0,
    "subtotal": 14.15,
    "tax": 2.84,
    "total": 16.99
  },
  "driverAvailability": {
    "count": 3,
    "estimatedPickupTime": 12,
    "message": "3 drivers available"
  },
  "expiresAt": "2025-01-01T12:15:00Z",
  "validFor": "10 minutes"
}
```

---

## 📊 **RESPONSE FORMAT**

All APIs return responses in this format:

### **Success Response:**

```json
{
  "status": "success",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "message": "Operation completed successfully",
  "data": {
    /* response data */
  }
}
```

### **Error Response:**

```json
{
  "status": "error",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "message": "Error description",
  "details": {
    /* additional error info */
  }
}
```

---

## 🔐 **PERMISSIONS SYSTEM**

The app uses a comprehensive RBAC (Role-Based Access Control) system:

### **Available Permissions:**

- `view_profile`, `update_profile`, `upload_photo`
- `book_ride`, `view_ride_status`, `cancel_ride`
- `view_rides`, `view_dashboard`
- `topup_wallet`, `view_rewards`, `redeem_rewards`
- `accept_ride`, `reject_ride`, `start_ride`, `complete_ride`
- `approve_driver`, `reject_driver`, `view_drivers`
- `create_role`, `edit_role`, `delete_role`, `view_roles`
- `create_permission`, `edit_permission`, `delete_permission`, `view_permissions`
- And many more...

### **User Roles:**

- **Rider**: Basic ride booking and tracking
- **Driver**: Ride acceptance, GPS updates, earnings
- **Admin**: Driver approval, basic management
- **Superadmin**: Full system access, user management

---

## 🚀 **QUICK START**

1. **Register/Login** as rider/driver/admin
2. **Get JWT token** from login response
3. **Include token** in all API requests: `Authorization: Bearer <token>`
4. **Use appropriate endpoints** based on your role

---

## 📞 **SUPPORT**

All APIs are fully implemented, tested, and production-ready. The system includes:

- ✅ JWT Authentication
- ✅ Role-Based Access Control
- ✅ Comprehensive error handling
- ✅ Input validation
- ✅ Pagination support
- ✅ Real-time features
- ✅ Payment processing
- ✅ GPS tracking
- ✅ Fare calculation
- ✅ Admin dashboard
- ✅ Audit logging

**Total APIs Implemented: 52+**

**Status: ✅ 100% COMPLETE AND PRODUCTION-READY**
