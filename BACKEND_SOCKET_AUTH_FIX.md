# Backend Socket Authentication Fix - Instructions for Backend Team

## 🚨 Issue Summary

**Error:** "Auth Failed: No token provided"

**Status:** Frontend is sending token correctly, backend is not reading it from the correct location.

**Evidence:**
- Frontend logs show: `hasToken: true, userId: "6956c5a21e681f55c6dde310"`
- Backend logs show: `Auth Failed: No token provided`
- Socket connects successfully but then gets disconnected
- Same socket ID and timestamp in both logs

---

## 🔍 Root Cause

The backend Socket.IO authentication middleware is checking the **wrong location** for the JWT token.

The frontend is sending the token in the `auth` object as per Socket.IO v3+ standards:

```javascript
// Frontend (React Native)
const socket = io(SERVER_URL, {
  auth: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
});
```

Backend must read it from: `socket.handshake.auth.token`

---

## ✅ Solution - Update Backend Auth Middleware

### Step 1: Locate Your Socket Auth Middleware

Find your Socket.IO server initialization, usually in:
- `server.js` or `app.js`
- `socket/index.js`
- `websocket/socketHandler.js`

Look for code like:
```javascript
io.use((socket, next) => {
  // Auth logic here
});
```

### Step 2: Add Debug Logging (Temporary)

First, add this debug logging to see what you're receiving:

```javascript
io.use((socket, next) => {
  console.log('🔍 ============================================');
  console.log('🔍 SOCKET AUTH DEBUG');
  console.log('🔍 ============================================');
  console.log('🔍 socket.id:', socket.id);
  console.log('🔍 socket.handshake.auth:', socket.handshake.auth);
  console.log('🔍 socket.handshake.query:', socket.handshake.query);
  console.log('🔍 socket.handshake.headers.authorization:', socket.handshake.headers.authorization);
  console.log('🔍 ============================================');
  
  // Your existing auth logic below...
});
```

### Step 3: Update Token Reading Logic

**❌ INCORRECT (Old Methods):**

```javascript
// DON'T use headers - this is for REST APIs only
const token = socket.handshake.headers.authorization?.replace('Bearer ', '');

// DON'T use query params - not secure for JWTs
const token = socket.handshake.query.token;
```

**✅ CORRECT (Socket.IO v3+ Standard):**

```javascript
// Use the auth object - this is the modern Socket.IO way
const token = socket.handshake.auth.token;
```

### Step 4: Complete Working Example

Replace your existing `io.use()` middleware with this:

```javascript
const jwt = require('jsonwebtoken');

io.use((socket, next) => {
  // Read token from auth object (Socket.IO v3+ standard)
  const token = socket.handshake.auth.token;
  
  // Validate token exists
  if (!token) {
    console.error('❌ No token provided in socket.handshake.auth.token');
    return next(new Error('No token provided'));
  }
  
  console.log('✅ Token received, length:', token.length);
  
  // Verify JWT token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('❌ JWT verification failed:', err.message);
      return next(new Error('Authentication error'));
    }
    
    // Token is valid - attach user info to socket
    console.log('✅ JWT verified successfully');
    console.log('   User ID:', decoded.id || decoded.userId);
    console.log('   User Type:', decoded.role || decoded.userType);
    
    socket.user = decoded;
    socket.userId = decoded.id || decoded.userId;
    socket.userRole = decoded.role || decoded.userType;
    
    next(); // Allow connection
  });
});
```

---

## 🧪 Testing the Fix

### Step 1: Update and Restart Backend

1. Update your socket auth middleware as shown above
2. Restart your backend server
3. Check backend console for debug logs

### Step 2: Test from Mobile App

1. Login as a driver in the mobile app
2. Navigate to driver dashboard
3. Check backend logs

### Step 3: Expected Backend Logs

**Before fix (Current):**
```
❌ No token provided in socket.handshake.auth.token
Auth Failed: No token provided
```

**After fix (Expected):**
```
✅ Token received, length: 250
✅ JWT verified successfully
   User ID: 6956c5a21e681f55c6dde310
   User Type: driver
[WEBSOCKET CONNECTED]
   Socket ID: Xhj2l9-6o1aa6s9qAAAf
   User: 6956c5a21e681f55c6dde310 (driver)
```

---

## 📋 Checklist for Backend Team

- [ ] Located socket auth middleware in backend code
- [ ] Added debug logging to see what's being received
- [ ] Changed from `socket.handshake.headers` or `socket.handshake.query` to `socket.handshake.auth.token`
- [ ] Tested JWT verification is working
- [ ] Verified user info is attached to socket: `socket.user`, `socket.userId`, `socket.userRole`
- [ ] Restarted backend server
- [ ] Confirmed mobile app can connect without auth errors
- [ ] Removed debug logging after confirming fix works

---

## 🔒 Security Notes

### Why Use `auth` Object?

1. **Standard**: Socket.IO v3+ official recommendation
2. **Secure**: Token is not exposed in URL query params
3. **Clean**: Separate auth from regular headers
4. **Type-safe**: Explicit auth object vs mixed headers

### JWT Verification Best Practices

```javascript
// ✅ Good - Use environment variable for secret
jwt.verify(token, process.env.JWT_SECRET, callback);

// ✅ Good - Check token expiration
jwt.verify(token, process.env.JWT_SECRET, { 
  ignoreExpiration: false 
}, callback);

// ✅ Good - Validate required fields in decoded token
if (!decoded.id && !decoded.userId) {
  return next(new Error('Invalid token payload'));
}
```

---

## 🐛 Common Issues After Fix

### Issue 1: "JWT malformed"
**Cause:** Token format is incorrect
**Solution:** Ensure frontend is sending raw JWT, not "Bearer {token}"

### Issue 2: "Invalid signature"  
**Cause:** JWT_SECRET mismatch between login and socket auth
**Solution:** Use same JWT_SECRET everywhere

### Issue 3: "Token expired"
**Cause:** Token has exceeded expiration time
**Solution:** 
- Increase token expiration: `jwt.sign(payload, secret, { expiresIn: '24h' })`
- Implement refresh token logic
- Frontend should re-login if token expired

---

## 📞 Support

### Frontend Team Contact
The frontend code is confirmed working correctly. Token is being sent in this format:

```javascript
{
  auth: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NTZjNWEyMWU2ODFmNTVjNmRkZTMxMCIsInJvbGUiOiJkcml2ZXIiLCJpYXQiOjE3MzY0MjE2MDEsImV4cCI6MTczNjUwODAwMX0.xxxx"
  }
}
```

### Questions?
If you have issues implementing this fix:
1. Share your current `io.use()` middleware code
2. Share backend console logs with debug logging enabled
3. Confirm Socket.IO version (`npm list socket.io`)

---

## 📚 References

- [Socket.IO v3 Authentication Docs](https://socket.io/docs/v3/middlewares/#sending-credentials)
- [Socket.IO v4 Authentication](https://socket.io/docs/v4/middlewares/#sending-credentials)
- [JWT Verification Best Practices](https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback)

---

**Last Updated:** 2026-01-09  
**Issue Status:** Awaiting backend fix  
**Priority:** High (Blocking driver real-time features)
