# Payment Method System - Frontend Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Endpoints](#api-endpoints)
4. [Implementation Guide](#implementation-guide)
5. [Code Examples](#code-examples)
6. [Error Handling](#error-handling)
7. [Testing](#testing)

---

## Overview

The Payment Method system allows riders to save and manage their payment cards for quick and easy payments. This guide provides everything the frontend team needs to integrate payment method management into the GO-CATERHAM mobile/web application.

### Key Features
- **Save Payment Cards**: Securely save credit/debit cards for future use
- **Multiple Cards**: Support multiple payment methods per rider
- **Default Card**: Set a preferred default payment method
- **Card Management**: View, update, and delete saved cards
- **Secure Storage**: Cards are tokenized and stored securely via Stripe
- **Auto-expiry Detection**: System automatically detects expired cards

### Supported Payment Types
- **Cards**: Visa, Mastercard, Amex, Discover
- **Providers**: Stripe (primary), with support for PayPal, Apple Pay, Google Pay (future)

---

## Architecture

### Data Flow

```
┌─────────────────┐
│  Frontend App   │
└────────┬────────┘
         │
         │ 1. Get Stripe Config
         ▼
┌─────────────────┐
│  Stripe.js SDK  │ ◄──── Initialize with publishable key
└────────┬────────┘
         │
         │ 2. Collect Card Details (Stripe Elements)
         ▼
┌─────────────────┐
│  Stripe Server  │ ◄──── Create Payment Method Token
└────────┬────────┘
         │
         │ 3. Send Payment Method ID
         ▼
┌─────────────────┐
│  Backend API    │ ◄──── Save to Database + Attach to Customer
└────────┬────────┘
         │
         ▼
    [Saved Card]
```

### Database Schema

**PaymentMethod Model:**
```javascript
{
  _id: ObjectId,
  rider: ObjectId,              // Reference to Rider
  type: String,                 // "card", "paypal", "apple_pay", "google_pay"
  isDefault: Boolean,           // Is this the default payment method?
  
  // Card Details (masked for security)
  card: {
    last4: String,              // Last 4 digits (e.g., "4242")
    brand: String,              // "visa", "mastercard", "amex", "discover"
    expiryMonth: Number,        // 1-12
    expiryYear: Number,         // e.g., 2025
    cardholderName: String      // Name on card
  },
  
  // Stripe Integration
  stripePaymentMethodId: String,  // Stripe PM ID (e.g., "pm_1234...")
  stripeCustomerId: String,       // Stripe Customer ID
  fingerprint: String,            // Card fingerprint (for duplicate detection)
  
  provider: String,             // "stripe" (primary)
  status: String,               // "active", "expired", "failed"
  
  createdAt: Date,
  updatedAt: Date
}
```

---

## API Endpoints

### Base URL
```
Development: http://localhost:5000/api/v1/stripe
Production: https://api.go-caterham.com/api/v1/stripe
```

### Authentication
All endpoints (except `/config`) require JWT authentication:
```
Headers: {
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

---

### 1. Get Stripe Configuration
Get the Stripe publishable key to initialize Stripe.js

**Endpoint:** `GET /api/v1/stripe/config`  
**Auth Required:** No  
**Role:** Public

**Response:**
```json
{
  "success": true,
  "data": {
    "publishableKey": "pk_test_51SnGSj...",
    "environment": "development"
  }
}
```

---

### 2. Save Payment Method
Save a new payment method (card) for the rider

**Endpoint:** `POST /api/v1/stripe/save-payment-method`  
**Auth Required:** Yes  
**Role:** Rider

**Request Body:**
```json
{
  "paymentMethodId": "pm_1234567890abcdef",  // From Stripe.js
  "setAsDefault": true                        // Optional, default: false
}
```

**Response - Success (201):**
```json
{
  "success": true,
  "message": "Payment method saved successfully",
  "data": {
    "_id": "6943efec2ae629fba8370e8b",
    "type": "card",
    "isDefault": true,
    "provider": "stripe",
    "status": "active",
    "card": {
      "last4": "4242",
      "brand": "visa",
      "expiryMonth": 12,
      "expiryYear": 2025
    },
    "maskedCard": "**** **** **** 4242",
    "isExpired": false,
    "createdAt": "2025-01-08T10:30:00.000Z"
  }
}
```

**Response - Error (400):**
```json
{
  "success": false,
  "message": "This payment method is already saved"
}
```

---

### 3. List Payment Methods
Get all saved payment methods for the logged-in rider

**Endpoint:** `GET /api/v1/stripe/payment-methods`  
**Auth Required:** Yes  
**Role:** Rider

**Response - Success (200):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "6943efec2ae629fba8370e8b",
      "type": "card",
      "isDefault": true,
      "provider": "stripe",
      "status": "active",
      "card": {
        "last4": "4242",
        "brand": "visa",
        "expiryMonth": 12,
        "expiryYear": 2025
      },
      "maskedCard": "**** **** **** 4242",
      "isExpired": false,
      "createdAt": "2025-01-08T10:30:00.000Z"
    },
    {
      "_id": "6943efec2ae629fba8370e8c",
      "type": "card",
      "isDefault": false,
      "provider": "stripe",
      "status": "active",
      "card": {
        "last4": "5555",
        "brand": "mastercard",
        "expiryMonth": 6,
        "expiryYear": 2024
      },
      "maskedCard": "**** **** **** 5555",
      "isExpired": true,
      "createdAt": "2025-01-07T15:20:00.000Z"
    }
  ]
}
```

---

### 4. Delete Payment Method
Remove a saved payment method

**Endpoint:** `DELETE /api/v1/stripe/payment-methods/:id`  
**Auth Required:** Yes  
**Role:** Rider

**URL Parameters:**
- `id` - Payment method ID

**Response - Success (200):**
```json
{
  "success": true,
  "message": "Payment method deleted successfully"
}
```

**Response - Error (404):**
```json
{
  "success": false,
  "message": "Payment method not found"
}
```

---

### 5. Set Default Payment Method
Set a payment method as the default

**Endpoint:** `PUT /api/v1/stripe/payment-methods/:id/default`  
**Auth Required:** Yes  
**Role:** Rider

**URL Parameters:**
- `id` - Payment method ID

**Response - Success (200):**
```json
{
  "success": true,
  "message": "Default payment method updated successfully",
  "data": {
    "_id": "6943efec2ae629fba8370e8b",
    "type": "card",
    "isDefault": true,
    "provider": "stripe",
    "status": "active",
    "card": {
      "last4": "4242",
      "brand": "visa",
      "expiryMonth": 12,
      "expiryYear": 2025
    },
    "maskedCard": "**** **** **** 4242",
    "isExpired": false,
    "createdAt": "2025-01-08T10:30:00.000Z"
  }
}
```

---

## Implementation Guide

### Step 1: Install Stripe.js

**For React/React Native:**
```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

**For Vanilla JavaScript:**
```html
<script src="https://js.stripe.com/v3/"></script>
```

---

### Step 2: Initialize Stripe

**React Example:**
```jsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Get publishable key from your backend
const stripePromise = loadStripe('pk_test_51SnGSj...');

function App() {
  return (
    <Elements stripe={stripePromise}>
      <PaymentMethodForm />
    </Elements>
  );
}
```

**JavaScript Example:**
```javascript
// 1. Get Stripe config from backend
async function initializeStripe() {
  const response = await fetch('http://localhost:5000/api/v1/stripe/config');
  const { data } = await response.json();
  
  const stripe = Stripe(data.publishableKey);
  return stripe;
}
```

---

### Step 3: Create Card Input Form

**React with Stripe Elements:**
```jsx
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useState } from 'react';

function PaymentMethodForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create payment method with Stripe
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
        billing_details: {
          name: 'John Doe', // Get from user input
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // Step 2: Send payment method ID to backend
      const response = await fetch('http://localhost:5000/api/v1/stripe/save-payment-method', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          setAsDefault: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Payment method saved successfully!');
        // Navigate to payment methods list or close modal
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement 
        options={{
          style: {
            base: {
              fontSize: '16px',
              color: '#424770',
              '::placeholder': {
                color: '#aab7c4',
              },
            },
            invalid: {
              color: '#9e2146',
            },
          },
        }}
      />
      
      {error && <div className="error">{error}</div>}
      
      <button type="submit" disabled={!stripe || loading}>
        {loading ? 'Saving...' : 'Save Card'}
      </button>
    </form>
  );
}
```

---

### Step 4: Display Saved Payment Methods

**React Example:**
```jsx
import { useEffect, useState } from 'react';

function PaymentMethodsList() {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/v1/stripe/payment-methods', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const result = await response.json();
      
      if (result.success) {
        setPaymentMethods(result.data);
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this payment method?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/v1/stripe/payment-methods/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const result = await response.json();
      
      if (result.success) {
        // Remove from list
        setPaymentMethods(paymentMethods.filter(pm => pm._id !== id));
        alert('Payment method deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting payment method:', error);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      const response = await fetch(`http://localhost:5000/api/v1/stripe/payment-methods/${id}/default`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const result = await response.json();
      
      if (result.success) {
        // Update list to reflect new default
        fetchPaymentMethods();
        alert('Default payment method updated');
      }
    } catch (error) {
      console.error('Error setting default payment method:', error);
    }
  };

  const getCardIcon = (brand) => {
    const icons = {
      visa: '💳',
      mastercard: '💳',
      amex: '💳',
      discover: '💳',
    };
    return icons[brand] || '💳';
  };

  if (loading) {
    return <div>Loading payment methods...</div>;
  }

  return (
    <div className="payment-methods-list">
      <h2>Saved Payment Methods</h2>
      
      {paymentMethods.length === 0 ? (
        <div className="empty-state">
          <p>No payment methods saved yet.</p>
          <button onClick={() => {/* Open add card form */}}>
            Add Payment Method
          </button>
        </div>
      ) : (
        <div className="payment-methods">
          {paymentMethods.map((pm) => (
            <div 
              key={pm._id} 
              className={`payment-method-card ${pm.isDefault ? 'default' : ''} ${pm.isExpired ? 'expired' : ''}`}
            >
              <div className="card-info">
                <span className="card-icon">{getCardIcon(pm.card.brand)}</span>
                <div className="card-details">
                  <div className="card-brand">{pm.card.brand.toUpperCase()}</div>
                  <div className="card-number">{pm.maskedCard}</div>
                  <div className="card-expiry">
                    Expires: {pm.card.expiryMonth}/{pm.card.expiryYear}
                    {pm.isExpired && <span className="expired-badge">EXPIRED</span>}
                  </div>
                </div>
              </div>
              
              <div className="card-actions">
                {pm.isDefault ? (
                  <span className="default-badge">✓ Default</span>
                ) : (
                  <button onClick={() => handleSetDefault(pm._id)}>
                    Set as Default
                  </button>
                )}
                
                <button 
                  className="delete-btn" 
                  onClick={() => handleDelete(pm._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Code Examples

### Complete React Component with Context

**PaymentMethodContext.js:**
```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const PaymentMethodContext = createContext();

export function usePaymentMethods() {
  return useContext(PaymentMethodContext);
}

export function PaymentMethodProvider({ children }) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API_URL = 'http://localhost:5000/api/v1/stripe';

  // Get auth token
  const getToken = () => localStorage.getItem('token');

  // Fetch all payment methods
  const fetchPaymentMethods = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`${API_URL}/payment-methods`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      
      setPaymentMethods(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch payment methods');
    } finally {
      setLoading(false);
    }
  };

  // Save new payment method
  const savePaymentMethod = async (paymentMethodId, setAsDefault = false) => {
    try {
      const response = await axios.post(
        `${API_URL}/save-payment-method`,
        { paymentMethodId, setAsDefault },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      
      // Refresh list
      await fetchPaymentMethods();
      
      return { success: true, data: response.data.data };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.message || 'Failed to save payment method' 
      };
    }
  };

  // Delete payment method
  const deletePaymentMethod = async (id) => {
    try {
      await axios.delete(`${API_URL}/payment-methods/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      
      // Remove from local state
      setPaymentMethods(paymentMethods.filter(pm => pm._id !== id));
      
      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.message || 'Failed to delete payment method' 
      };
    }
  };

  // Set default payment method
  const setDefaultPaymentMethod = async (id) => {
    try {
      await axios.put(`${API_URL}/payment-methods/${id}/default`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      
      // Refresh list
      await fetchPaymentMethods();
      
      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.message || 'Failed to set default payment method' 
      };
    }
  };

  // Get default payment method
  const getDefaultPaymentMethod = () => {
    return paymentMethods.find(pm => pm.isDefault);
  };

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const value = {
    paymentMethods,
    loading,
    error,
    fetchPaymentMethods,
    savePaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    getDefaultPaymentMethod,
  };

  return (
    <PaymentMethodContext.Provider value={value}>
      {children}
    </PaymentMethodContext.Provider>
  );
}
```

---

### React Native Example

**AddPaymentMethodScreen.js:**
```jsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import axios from 'axios';

export default function AddPaymentMethodScreen({ navigation }) {
  const { createPaymentMethod } = useStripe();
  const [loading, setLoading] = useState(false);

  const handleSaveCard = async () => {
    setLoading(true);

    try {
      // Create payment method
      const { error, paymentMethod } = await createPaymentMethod({
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert('Error', error.message);
        setLoading(false);
        return;
      }

      // Save to backend
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:5000/api/v1/stripe/save-payment-method',
        {
          paymentMethodId: paymentMethod.id,
          setAsDefault: true,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        Alert.alert('Success', 'Payment method saved successfully!');
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to save card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Payment Method</Text>
      
      <CardField
        postalCodeEnabled={false}
        placeholder={{
          number: '4242 4242 4242 4242',
        }}
        cardStyle={styles.card}
        style={styles.cardContainer}
      />
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSaveCard}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Saving...' : 'Save Card'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  cardContainer: {
    height: 50,
    marginVertical: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
```

---

## Error Handling

### Common Errors and Solutions

| Error Code | Error Message | Solution |
|------------|--------------|----------|
| 400 | "Payment method ID is required" | Ensure `paymentMethodId` is included in request |
| 400 | "This payment method is already saved" | Card is already saved. Show message to user |
| 404 | "Rider profile not found" | User needs to complete rider registration |
| 404 | "Payment method not found" | Payment method ID is invalid or doesn't belong to user |
| 401 | "Unauthorized" | Token expired or invalid. Re-authenticate user |

### Error Handling Template

```javascript
async function handleApiCall(apiFunction) {
  try {
    const result = await apiFunction();
    return { success: true, data: result };
  } catch (error) {
    let errorMessage = 'An unexpected error occurred';
    
    if (error.response) {
      // Server responded with error
      const status = error.response.status;
      const message = error.response.data?.message;
      
      switch (status) {
        case 400:
          errorMessage = message || 'Invalid request';
          break;
        case 401:
          errorMessage = 'Session expired. Please login again';
          // Redirect to login
          break;
        case 404:
          errorMessage = message || 'Resource not found';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later';
          break;
        default:
          errorMessage = message || errorMessage;
      }
    } else if (error.request) {
      // No response received
      errorMessage = 'Network error. Please check your connection';
    }
    
    return { success: false, error: errorMessage };
  }
}
```

---

## Testing

### Test Cards (Stripe Test Mode)

Use these test cards in development:

| Card Number | Brand | Description |
|-------------|-------|-------------|
| 4242 4242 4242 4242 | Visa | Success |
| 5555 5555 5555 4444 | Mastercard | Success |
| 3782 822463 10005 | American Express | Success |
| 4000 0000 0000 9995 | Visa | Insufficient funds |
| 4000 0000 0000 0002 | Visa | Card declined |
| 4000 0000 0000 0069 | Visa | Expired card |

**Expiry Date:** Any future date (e.g., 12/25)  
**CVC:** Any 3 digits (e.g., 123)  
**Postal Code:** Any valid code

### Testing Checklist

- [ ] Save payment method with valid card
- [ ] Save payment method with invalid card
- [ ] Set payment method as default
- [ ] Delete payment method
- [ ] View list of payment methods
- [ ] Handle expired cards
- [ ] Handle network errors
- [ ] Handle authentication errors
- [ ] Display card icons correctly
- [ ] Show masked card numbers correctly

---

## Best Practices

### Security
1. **Never store raw card numbers** - Always use Stripe tokenization
2. **Use HTTPS** - All API calls must use HTTPS in production
3. **Validate on backend** - Never trust frontend validation alone
4. **PCI Compliance** - Use Stripe Elements to avoid handling card data directly

### UX Recommendations
1. **Show card brand icons** - Display Visa, Mastercard, etc. logos
2. **Highlight default card** - Make it clear which card is default
3. **Confirm deletions** - Ask user to confirm before deleting cards
4. **Show expiry warnings** - Alert users about expiring cards
5. **Loading states** - Show spinners during API calls
6. **Error messages** - Display clear, user-friendly error messages

### Performance
1. **Cache payment methods** - Store in local state/context
2. **Lazy load Stripe.js** - Load only when needed
3. **Debounce API calls** - Avoid excessive requests

---

## Support

### Need Help?
- **Backend Team:** Contact for API issues
- **Stripe Documentation:** https://stripe.com/docs
- **Stripe React Native:** https://github.com/stripe/stripe-react-native

### Environment Variables Required
```bash
# Backend .env file
STRIPE_TEST_SECRET_KEY=sk_test_xxxxx
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_TEST_WEBHOOK_SECRET=whsec_xxxxx
```

---

**Last Updated:** January 8, 2025  
**Version:** 1.0  
**Maintained By:** Backend Team
