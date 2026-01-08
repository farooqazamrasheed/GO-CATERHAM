# Payment Method System - Technical Overview

## System Architecture

### Overview
The Payment Method system in GO-CATERHAM allows riders to securely save and manage their payment cards using Stripe's tokenization system. This ensures PCI compliance and provides a seamless payment experience.

---

## How It Works

### 1. **High-Level Flow**

```
User enters card → Stripe.js tokenizes → Backend saves token → Database stores metadata
       ↓                    ↓                    ↓                      ↓
   Card details      Payment Method ID    Attach to Customer    Card details (masked)
   (never sent)      (pm_xxx123...)       in Stripe             last4, brand, expiry
```

### 2. **Components**

#### **Frontend (Mobile/Web App)**
- **Stripe.js / Stripe React Native SDK**: Securely collects card information
- **Card Input Form**: User interface for entering card details
- **Payment Method List**: Displays saved cards with options to manage them

#### **Backend (Node.js + Express)**
- **Stripe Service** (`services/stripeService.js`): Handles all Stripe API interactions
- **Stripe Controller** (`controllers/stripeController.js`): Manages HTTP requests/responses
- **Payment Method Routes** (`routes/stripeRoutes.js`): Defines API endpoints

#### **Database (MongoDB)**
- **PaymentMethod Model** (`models/PaymentMethod.js`): Stores payment method metadata
- **Rider Model** (`models/Rider.js`): Links riders to Stripe customers

#### **External Service**
- **Stripe API**: Tokenizes and stores actual card data securely

---

## Detailed Workflow

### **Saving a New Payment Method**

```
Step 1: Frontend - User enters card details
┌──────────────────────────┐
│  User enters:            │
│  - Card number           │
│  - Expiry date           │
│  - CVC                   │
│  - Cardholder name       │
└────────────┬─────────────┘
             │
             ▼
Step 2: Frontend - Stripe.js creates payment method token
┌──────────────────────────┐
│  stripe.createPaymentMethod({
│    type: 'card',
│    card: cardElement,
│    billing_details: {...}
│  })
│  
│  Returns: pm_1234567890
└────────────┬─────────────┘
             │
             ▼
Step 3: Frontend - Send token to backend
┌──────────────────────────┐
│  POST /api/v1/stripe/save-payment-method
│  Body: {
│    paymentMethodId: "pm_1234567890",
│    setAsDefault: true
│  }
└────────────┬─────────────┘
             │
             ▼
Step 4: Backend - Get or create Stripe customer
┌──────────────────────────┐
│  If rider.stripeCustomerId exists:
│    Use existing customer
│  Else:
│    Create new Stripe customer
│    Save customer ID to rider profile
└────────────┬─────────────┘
             │
             ▼
Step 5: Backend - Attach payment method to customer
┌──────────────────────────┐
│  stripe.paymentMethods.attach(
│    paymentMethodId,
│    { customer: customerId }
│  )
└────────────┬─────────────┘
             │
             ▼
Step 6: Backend - Retrieve payment method details
┌──────────────────────────┐
│  stripe.paymentMethods.retrieve(
│    paymentMethodId
│  )
│  
│  Gets: card.last4, brand, exp_month, exp_year
└────────────┬─────────────┘
             │
             ▼
Step 7: Backend - Save to database
┌──────────────────────────┐
│  PaymentMethod.create({
│    rider: riderId,
│    type: "card",
│    stripePaymentMethodId: "pm_1234567890",
│    stripeCustomerId: "cus_1234567890",
│    card: {
│      last4: "4242",
│      brand: "visa",
│      expiryMonth: 12,
│      expiryYear: 2025
│    },
│    isDefault: true,
│    status: "active"
│  })
└────────────┬─────────────┘
             │
             ▼
Step 8: Backend - Return safe data to frontend
┌──────────────────────────┐
│  Response: {
│    success: true,
│    data: {
│      _id: "...",
│      maskedCard: "**** **** **** 4242",
│      card: { last4, brand, expiry },
│      isDefault: true
│    }
│  }
└──────────────────────────┘
```

---

## Database Schema

### **PaymentMethod Collection**

```javascript
{
  _id: ObjectId("6943efec2ae629fba8370e8b"),
  rider: ObjectId("6943efec2ae629fba8370e8a"),
  
  // Payment method type
  type: "card",                    // card, paypal, apple_pay, google_pay
  provider: "stripe",              // stripe (primary)
  status: "active",                // active, expired, failed
  isDefault: true,                 // Only one default per rider
  
  // Card information (masked)
  card: {
    last4: "4242",                 // Last 4 digits only
    brand: "visa",                 // visa, mastercard, amex, discover
    expiryMonth: 12,               // 1-12
    expiryYear: 2025,              // Full year
    cardholderName: "John Doe"     // Name on card
  },
  
  // Stripe integration
  stripePaymentMethodId: "pm_1NqZz2KckCEtMKxh...",
  stripeCustomerId: "cus_NqZz2KckCEtMKxh...",
  fingerprint: "Q6oPxHXbHXmPpQ2W",    // For duplicate detection
  
  createdAt: ISODate("2025-01-08T10:30:00.000Z"),
  updatedAt: ISODate("2025-01-08T10:30:00.000Z")
}
```

### **Rider Model Integration**

```javascript
{
  _id: ObjectId("6943efec2ae629fba8370e8a"),
  user: ObjectId("..."),
  
  // Stripe customer fields
  stripeCustomerId: "cus_NqZz2KckCEtMKxh...",
  stripeCustomerCreatedAt: ISODate("2025-01-08T10:30:00.000Z"),
  
  // Other rider fields...
}
```

---

## Key Features

### 1. **Default Payment Method**
- Each rider can have one default payment method
- Pre-save hook ensures only one default per rider
- When setting a new default, all others are automatically unset

```javascript
// In PaymentMethod model
paymentMethodSchema.pre("save", async function () {
  if (this.isDefault) {
    await mongoose.model("PaymentMethod").updateMany(
      { rider: this.rider, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
});
```

### 2. **Card Expiry Detection**
- Model method checks if card is expired
- Frontend can display warnings for expiring cards

```javascript
paymentMethodSchema.methods.isExpired = function () {
  if (this.type === "card" && this.card) {
    const now = new Date();
    const expiryDate = new Date(
      this.card.expiryYear,
      this.card.expiryMonth - 1
    );
    return expiryDate < now;
  }
  return false;
};
```

### 3. **Secure Data Handling**
- Raw card numbers never touch our servers
- Only Stripe payment method IDs are stored
- `getSafeData()` method filters sensitive information

```javascript
paymentMethodSchema.methods.getSafeData = function () {
  return {
    _id: this._id,
    type: this.type,
    isDefault: this.isDefault,
    card: this.card ? {
      last4: this.card.last4,
      brand: this.card.brand,
      expiryMonth: this.card.expiryMonth,
      expiryYear: this.card.expiryYear,
    } : undefined,
    maskedCard: this.maskedCard,
    isExpired: this.isExpired(),
    createdAt: this.createdAt,
  };
};
```

### 4. **Duplicate Prevention**
- Checks for existing payment method before saving
- Uses Stripe's card fingerprint to detect duplicates

```javascript
const existingMethod = await PaymentMethod.findOne({
  rider: rider._id,
  stripePaymentMethodId: paymentMethodId,
});

if (existingMethod) {
  return res.status(400).json({
    success: false,
    message: "This payment method is already saved"
  });
}
```

---

## Security Measures

### **PCI Compliance**
✅ **We are PCI compliant** because:
1. Card data never touches our servers
2. Stripe.js collects card data directly
3. We only store Stripe tokens (payment method IDs)
4. Card numbers are never in our database or logs

### **Data Protection**
- **Tokenization**: Cards are tokenized by Stripe
- **TLS/HTTPS**: All communication encrypted
- **Authentication**: JWT tokens required for all operations
- **Authorization**: Riders can only access their own payment methods

### **Audit Trail**
- All payment method operations are logged
- Timestamps tracked (createdAt, updatedAt)
- Status changes recorded

---

## API Endpoints Summary

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/stripe/config` | GET | Get Stripe publishable key | No |
| `/stripe/save-payment-method` | POST | Save new payment method | Rider |
| `/stripe/payment-methods` | GET | List all payment methods | Rider |
| `/stripe/payment-methods/:id` | DELETE | Delete payment method | Rider |
| `/stripe/payment-methods/:id/default` | PUT | Set default payment method | Rider |

---

## Integration with Payment Flow

### **Wallet Top-Up**
1. User initiates wallet top-up
2. Can choose from saved payment methods OR enter new card
3. If new card → Save payment method flow
4. Create payment intent with selected/new payment method
5. Process payment

### **Ride Payment**
1. Ride completed → Calculate fare
2. Get rider's default payment method
3. Charge the default card automatically
4. If no default or charge fails → Prompt user to select/add card

---

## Error Handling

### **Common Scenarios**

| Scenario | Backend Response | Frontend Action |
|----------|------------------|-----------------|
| Card already saved | 400 - "Already saved" | Show message, don't duplicate |
| Invalid card | Stripe error | Display Stripe error message |
| Expired card | Save with status="expired" | Show warning, allow save |
| Network error | 500 - Server error | Retry mechanism |
| Unauthorized | 401 - Unauthorized | Redirect to login |
| Card declined | Stripe error | Ask for different card |

---

## Testing

### **Test Cards (Development)**
- **Success**: 4242 4242 4242 4242 (Visa)
- **Declined**: 4000 0000 0000 0002
- **Insufficient Funds**: 4000 0000 0000 9995
- **Expired**: 4000 0000 0000 0069

### **Test Scenarios**
1. ✅ Save first payment method (becomes default)
2. ✅ Save second payment method (first stays default)
3. ✅ Change default payment method
4. ✅ Delete non-default payment method
5. ✅ Delete default payment method (make another default)
6. ✅ Try to save duplicate card (should fail)
7. ✅ Save expired card (should save with warning)

---

## Performance Considerations

### **Optimizations**
1. **Indexes**: Created on `stripePaymentMethodId`, `rider`, `isDefault`
2. **Caching**: Frontend caches payment methods list
3. **Lazy Loading**: Only fetch when needed
4. **Batch Operations**: Update defaults efficiently

### **Scalability**
- Stripe handles unlimited payment methods per customer
- Database queries optimized with proper indexes
- Stateless API design allows horizontal scaling

---

## Future Enhancements

### **Planned Features**
1. **Apple Pay / Google Pay**: Support for mobile wallets
2. **PayPal Integration**: Alternative payment method
3. **Bank Account**: Direct debit support (UK)
4. **Card Update**: Handle card updates (expiry, new card number)
5. **Auto-Update**: Stripe's automatic card updater integration
6. **Payment Analytics**: Track payment method usage

### **Potential Improvements**
1. Add card nickname/label
2. Set spending limits per card
3. Transaction history per card
4. Card verification (small charge + refund)
5. Multi-currency support

---

## Troubleshooting

### **Common Issues**

**Issue**: Payment method not appearing in list
- **Cause**: Not saved to database
- **Fix**: Check console for errors, verify API response

**Issue**: "This card is already saved" error
- **Cause**: Duplicate payment method ID
- **Fix**: Use existing card instead

**Issue**: Can't delete payment method
- **Cause**: Network error or unauthorized
- **Fix**: Check authentication, retry

**Issue**: Stripe publishable key not loading
- **Cause**: Backend config endpoint failing
- **Fix**: Verify `.env` file has `STRIPE_TEST_PUBLISHABLE_KEY`

---

## Monitoring & Logs

### **What to Monitor**
1. Payment method save success rate
2. Average time to save payment method
3. Duplicate card attempts
4. Failed card saves
5. Payment method deletions

### **Logging**
```javascript
console.log("Payment method saved:", {
  riderId: rider._id,
  last4: paymentMethod.card.last4,
  brand: paymentMethod.card.brand,
  isDefault: paymentMethod.isDefault
});
```

---

## Support & Documentation

### **Related Documents**
- `PAYMENT_METHOD_FRONTEND_GUIDE.md` - Complete frontend integration guide
- `STRIPE_INTEGRATION.md` - Overall Stripe setup
- `STRIPE_COMPLETE_PAYMENT_FLOW_ANALYSIS.md` - Full payment flow

### **External Resources**
- [Stripe Payment Methods API](https://stripe.com/docs/api/payment_methods)
- [Stripe.js Reference](https://stripe.com/docs/js)
- [PCI Compliance Guide](https://stripe.com/docs/security)

---

**Document Version:** 1.0  
**Last Updated:** January 8, 2025  
**Maintained By:** Backend Development Team
