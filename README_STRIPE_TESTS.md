# Stripe Integration Test Suite - README

Complete guide for running and understanding the Stripe integration test scripts.

---

## 📁 Test Files Overview

### Individual Test Scripts

1. **`tests/stripe-wallet-topup.test.js`**
   - Tests wallet top-up flow
   - Creates payment intent
   - Confirms payment
   - Verifies wallet balance
   - Duration: ~30 seconds

2. **`tests/stripe-saved-cards.test.js`**
   - Tests payment method management
   - Lists saved cards
   - Tests card saving endpoint
   - Verifies security
   - Duration: ~20 seconds

3. **`tests/stripe-driver-payouts.test.js`**
   - Tests driver earnings and payouts
   - Stripe Connect account creation
   - Onboarding flow
   - Payout requests
   - Duration: ~25 seconds

4. **`tests/stripe-refunds-admin.test.js`**
   - Tests admin operations
   - Refund processing
   - Admin permissions
   - Manual payouts
   - Duration: ~20 seconds

5. **`tests/stripe-test-runner.js`**
   - Runs all tests sequentially
   - Provides summary report
   - Duration: ~2 minutes

---

## 🚀 Quick Start

### Prerequisites

1. **Backend Server Running**
   ```bash
   npm start
   # Server should be running on http://localhost:5000
   ```

2. **Test Accounts Created**
   - Rider account: `testrider@example.com` / `TestPassword123!`
   - Driver account: `testdriver@example.com` / `TestPassword123!`
   - Admin account: `admin@example.com` / `AdminPassword123!`

3. **Environment Variables**
   ```bash
   # .env file should have:
   STRIPE_TEST_SECRET_KEY=sk_test_xxxxx
   STRIPE_TEST_PUBLISHABLE_KEY=pk_test_xxxxx
   STRIPE_TEST_WEBHOOK_SECRET=whsec_xxxxx
   ```

### Running Tests

#### Run All Tests
```bash
node tests/stripe-test-runner.js
```

#### Run Individual Tests
```bash
# Wallet top-up test
node tests/stripe-wallet-topup.test.js

# Saved cards test
node tests/stripe-saved-cards.test.js

# Driver payouts test
node tests/stripe-driver-payouts.test.js

# Admin/refunds test
node tests/stripe-refunds-admin.test.js
```

---

## 📋 Test Script Details

### 1. Wallet Top-Up Test

**Purpose:** Verify complete wallet top-up flow using Stripe payments

**Test Steps:**
1. Login as rider
2. Get current wallet balance
3. Get Stripe configuration
4. Create payment intent for £50
5. Simulate Stripe payment (informational)
6. Confirm payment on backend
7. Verify wallet balance updated
8. View transaction history

**Expected Results:**
- Payment intent created successfully
- Client secret returned
- Payment confirmed (may fail in automated test)
- Wallet balance updated (if payment succeeded)

**Sample Output:**
```
[Step 1] Login as Rider
✅ Logged in successfully as testrider@example.com

[Step 2] Get Initial Wallet Balance
✅ Current wallet balance: £50.00

[Step 3] Get Stripe Configuration
✅ Stripe configured in development mode

[Step 4] Create Payment Intent for £50.00
✅ Payment intent created successfully
ℹ️  Payment Intent ID: pi_xxxxx

[Step 5] Simulate Stripe Payment
⚠️  This is a simulated step...

[Step 6] Confirm Payment on Backend
⚠️  Payment confirmation failed - expected in automated tests

TEST SUMMARY
Total Tests: 8 | Passed: 6 | Failed: 2
Success Rate: 75.0%
```

### 2. Saved Payment Methods Test

**Purpose:** Test saving, listing, and managing payment methods

**Test Steps:**
1. Login as rider
2. List existing payment methods
3. Show how to create payment methods (informational)
4. Test save payment method endpoint
5. Test set default payment method
6. Test delete payment method
7. Verify payment method security
8. Test input validation

**Expected Results:**
- All saved cards listed with masked numbers
- Only last 4 digits exposed
- No full card numbers in response
- Validation working correctly

**Sample Output:**
```
[Step 2] List Existing Payment Methods
✅ Found 2 saved payment method(s)

Existing Payment Methods:
  1. VISA ending in 4242
     Expires: 12/2025
     Default: Yes
     Status: active

[Step 7] Verify Payment Method Security
✅ ✓ Only last 4 digits of card exposed
✅ ✓ Full card number not included
✅ ✓ Masked card number properly formatted

Security checks passed: 5/5
```

### 3. Driver Payouts Test

**Purpose:** Test driver earnings tracking and Stripe Connect payouts

**Test Steps:**
1. Login as driver
2. Get earnings summary
3. Create Stripe Connect account
4. Get onboarding link
5. Get Connect account status
6. Request payout

**Expected Results:**
- Earnings summary retrieved
- Connect account created or existing found
- Onboarding link generated
- Account status retrieved
- Payout request successful (if balance available)

**Sample Output:**
```
[Step 2] Get Driver Earnings Summary
✅ Earnings summary retrieved
ℹ️  Total Earnings: £1,250.50
ℹ️  Available Balance: £1,250.50
ℹ️  Pending Balance: £0.00
ℹ️  Total Rides: 87
ℹ️  Stripe Account Status: enabled

[Step 3] Create Stripe Connect Account
⚠️  Driver already has a Connect account

[Step 5] Get Connect Account Status
✅ Account status retrieved
ℹ️  Charges Enabled: true
ℹ️  Payouts Enabled: true
ℹ️  Onboarding Complete: true
```

### 4. Admin & Refunds Test

**Purpose:** Test admin-level operations including refunds

**Test Steps:**
1. Login as admin
2. Get recent payments
3. Test refund validation
4. Test refund with real payment
5. Test partial refund
6. Get all drivers
7. Test admin driver payout
8. Test refund reasons
9. Test admin permissions

**Expected Results:**
- Admin can access all data
- Refund validation working
- Proper authorization checks
- All endpoints secured

**Sample Output:**
```
[Step 2] Get Recent Payments
✅ Found 45 payments

Recent Payments:
  1. Amount: £25.50
     Status: paid
     Method: card
     Stripe ID: pi_xxxxx

[Step 3] Test Refund Validation
✅ ✓ Correctly rejected invalid payment ID

[Step 9] Test Admin-Only Permissions
✅ ✓ Admin endpoints properly protected
```

---

## 🎯 Understanding Test Results

### Success Indicators

✅ **Green Checkmarks** - Test passed successfully
ℹ️  **Blue Info** - Informational message
⚠️  **Yellow Warning** - Expected limitation or informational warning
❌ **Red X** - Test failed (may be expected)

### Common "Failures" That Are Normal

1. **Payment Confirmation Fails**
   - **Why:** Automated tests can't complete actual Stripe payment
   - **Fix:** Use frontend with Stripe.js for real payment testing
   - **Impact:** None - this is expected behavior

2. **Webhook Not Received**
   - **Why:** Webhooks need real Stripe events
   - **Fix:** Use Stripe CLI or trigger from dashboard
   - **Impact:** None for unit tests

3. **No Available Balance for Payout**
   - **Why:** Test driver hasn't completed rides
   - **Fix:** Complete some test rides first
   - **Impact:** Payout test skipped

### Real Failures to Investigate

❌ **Login Failed** - Check test credentials exist
❌ **API Connection Error** - Verify server is running
❌ **Stripe Key Error** - Check .env configuration
❌ **Database Error** - Verify MongoDB connection
❌ **Authorization Error** - Check RBAC permissions

---

## 🔧 Customizing Tests

### Change Test User Credentials

Edit in each test file:

```javascript
// Update these constants
const TEST_RIDER = {
  email: 'your-rider@example.com',
  password: 'YourPassword123!'
};

const TEST_DRIVER = {
  email: 'your-driver@example.com',
  password: 'YourPassword123!'
};

const TEST_ADMIN = {
  email: 'your-admin@example.com',
  password: 'YourPassword123!'
};
```

### Change Test Server URL

```javascript
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Or set environment variable:
BASE_URL=https://staging.go-caterham.com node tests/stripe-wallet-topup.test.js
```

### Change Test Amounts

```javascript
// In stripe-wallet-topup.test.js
const topupAmount = 50.00; // Change this value

// In stripe-driver-payouts.test.js
const payoutAmount = Math.min(10, earnings.availableBalance); // Change 10
```

---

## 🧪 Manual Testing Guide

For complete testing, you need frontend integration:

### 1. Wallet Top-Up (Frontend Required)

```javascript
// Frontend code example
const stripe = Stripe('pk_test_xxxxx');

// 1. Create payment intent
const response = await fetch('/api/v1/stripe/create-payment-intent', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ amount: 50, currency: 'gbp' })
});

const { clientSecret } = await response.json();

// 2. Confirm payment with Stripe.js
const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'John Doe' }
  }
});

// 3. Confirm on backend
if (paymentIntent.status === 'succeeded') {
  await fetch('/api/v1/stripe/confirm-payment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ paymentIntentId: paymentIntent.id })
  });
}
```

### 2. Test Cards

Use these Stripe test cards:

| Card Number | Scenario |
|-------------|----------|
| 4242 4242 4242 4242 | Success |
| 4000 0025 0000 3155 | 3D Secure required |
| 4000 0000 0000 9995 | Insufficient funds |
| 4000 0000 0000 0002 | Card declined |

All test cards:
- Expiry: Any future date (e.g., 12/26)
- CVC: Any 3 digits (e.g., 123)
- Postal Code: Any valid code

---

## 📊 Test Coverage

### What Tests Cover

✅ **API Endpoints**
- All Stripe endpoints functional
- Authentication working
- Authorization checks in place
- Input validation working

✅ **Business Logic**
- Payment intent creation
- Wallet balance updates
- Driver earnings tracking
- Refund processing

✅ **Error Handling**
- Invalid input rejected
- Proper error messages
- Failed payments handled
- Authorization failures caught

### What Tests Don't Cover

❌ **Frontend Integration**
- Stripe.js card element
- 3D Secure popup flow
- UI/UX testing
- Browser compatibility

❌ **Real Payments**
- Actual card charges
- Real bank transfers
- Live webhook events
- Production Stripe processing

❌ **Load Testing**
- Concurrent payments
- High volume testing
- Performance under load
- Scalability testing

---

## 🐛 Troubleshooting

### Test Won't Run

**Problem:** `Error: Cannot find module 'axios'`
```bash
# Solution: Install dependencies
npm install axios
```

**Problem:** `Error: connect ECONNREFUSED`
```bash
# Solution: Start backend server
npm start
```

### Test Fails Immediately

**Problem:** Login fails with 401
```bash
# Solution: Create test accounts or update credentials
# Use your actual test account email/password
```

**Problem:** Stripe key error
```bash
# Solution: Check .env file
cat .env | grep STRIPE
# Verify keys are present and start with sk_test_
```

### Webhook Tests Fail

**Problem:** Webhooks not received
```bash
# Solution: Use Stripe CLI
stripe listen --forward-to localhost:5000/api/v1/stripe/webhook
stripe trigger payment_intent.succeeded
```

---

## 📝 Adding New Tests

To add a new test:

1. **Create Test File**
   ```bash
   touch tests/stripe-my-new-test.test.js
   ```

2. **Use Template**
   ```javascript
   const axios = require('axios');
   const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
   
   async function myTest() {
     // Your test logic
   }
   
   myTest().catch(console.error);
   ```

3. **Add to Test Runner**
   ```javascript
   // In stripe-test-runner.js
   const testSuites = [
     // ... existing tests
     {
       name: 'My New Test',
       file: 'stripe-my-new-test.test.js',
       description: 'Tests my new feature'
     }
   ];
   ```

---

## 📚 Additional Resources

- **Stripe Testing Guide**: https://stripe.com/docs/testing
- **Stripe API Docs**: https://stripe.com/docs/api
- **Integration Guide**: `docs/STRIPE_INTEGRATION.md`
- **Production Guide**: `docs/STRIPE_PRODUCTION_DEPLOYMENT.md`

---

## 🎯 Quick Reference

### Run All Tests
```bash
node tests/stripe-test-runner.js
```

### Run Specific Test
```bash
node tests/stripe-wallet-topup.test.js
```

### With Custom Server URL
```bash
BASE_URL=https://staging.example.com node tests/stripe-wallet-topup.test.js
```

### Run Tests in CI/CD
```bash
# package.json
"scripts": {
  "test:stripe": "node tests/stripe-test-runner.js"
}

# Then run:
npm run test:stripe
```

---

**Happy Testing! 🧪**
