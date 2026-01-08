# Stripe Production Deployment Guide

Complete guide for deploying Stripe payment integration to production for GO-CATERHAM.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Stripe Account Setup](#stripe-account-setup)
3. [Environment Configuration](#environment-configuration)
4. [Webhook Setup](#webhook-setup)
5. [SSL/HTTPS Configuration](#ssl-https-configuration)
6. [Database Migration](#database-migration)
7. [Testing in Production](#testing-in-production)
8. [Monitoring & Alerts](#monitoring--alerts)
9. [Go-Live Checklist](#go-live-checklist)
10. [Post-Deployment](#post-deployment)
11. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

Before deploying to production, ensure:

### ✅ Development Testing Complete

- [ ] All test scripts pass successfully
- [ ] Wallet top-up flow tested with test cards
- [ ] Saved payment methods working correctly
- [ ] Driver Connect onboarding tested
- [ ] Refund processing verified
- [ ] Webhook events received and processed correctly

### ✅ Code Review

- [ ] Security review completed
- [ ] No test keys or credentials in code
- [ ] Error handling implemented for all payment flows
- [ ] Logging configured for production
- [ ] HTTPS enforced for all payment endpoints

### ✅ Infrastructure Ready

- [ ] Production server configured
- [ ] Database backup strategy in place
- [ ] SSL certificate installed and valid
- [ ] Domain name configured
- [ ] Load balancer configured (if applicable)

---

## Stripe Account Setup

### Step 1: Activate Your Stripe Account

1. **Complete Business Profile**
   - Go to: https://dashboard.stripe.com/settings/account
   - Fill in business details:
     - Legal business name: GO-CATERHAM
     - Business address: Surrey, UK
     - Business type: Private Company
     - Industry: Transportation/Taxi Services
     - Website: Your production URL
     - Support email and phone

2. **Verify Business Information**
   - Upload required documents (if requested)
   - Verify bank account details
   - Complete identity verification

3. **Enable Payment Methods**
   - Go to: https://dashboard.stripe.com/settings/payment_methods
   - Enable:
     - ✅ Cards (Visa, Mastercard, Amex)
     - ✅ 3D Secure (required in UK/EU)
     - ✅ Apple Pay (optional)
     - ✅ Google Pay (optional)

### Step 2: Set Up Stripe Connect (for Driver Payouts)

1. **Configure Connect Settings**
   - Go to: https://dashboard.stripe.com/settings/connect
   - Platform Name: GO-CATERHAM
   - Brand Color: Your app's primary color
   - Logo: Upload your logo
   - Support URL: https://yourdomain.com/support

2. **Complete Connect Application**
   - Business details
   - Terms of service URL
   - Privacy policy URL
   - OAuth settings (if using)

3. **Set Payout Schedule**
   - Go to: https://dashboard.stripe.com/settings/payouts
   - Recommended: Daily automatic payouts
   - Minimum payout amount: £10.00

### Step 3: Get Production API Keys

1. **Navigate to API Keys**
   - Go to: https://dashboard.stripe.com/apikeys
   - Switch from "Test mode" to "Live mode" (toggle in top-right)

2. **Copy Keys**
   ```
   Publishable key: pk_live_xxxxxxxxxxxxxxxxxxxxx
   Secret key: sk_live_xxxxxxxxxxxxxxxxxxxxx (click "Reveal live key")
   ```

3. **Store Securely**
   - Never commit to version control
   - Use environment variables or secret management service
   - Rotate keys if compromised

---

## Environment Configuration

### Step 1: Update Production Environment Variables

Create/update your production `.env` file:

```bash
# ============================================
# PRODUCTION ENVIRONMENT VARIABLES
# ============================================

# Server
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/go-caterham-prod

# JWT
JWT_SECRET=your_super_secure_production_jwt_secret_min_32_chars
JWT_EXPIRE=30d

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@go-caterham.com
EMAIL_PASSWORD=your_secure_app_password
EMAIL_FROM=GO-CATERHAM <noreply@go-caterham.com>

# Frontend URL
FRONTEND_URL=https://app.go-caterham.com

# ============================================
# STRIPE PRODUCTION KEYS
# ============================================

# Use LIVE keys (NOT test keys)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Keep test keys for staging/testing
STRIPE_TEST_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_TEST_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

### Step 2: Verify Environment Loading

Test that production environment loads correctly:

```javascript
// Add temporary verification endpoint (remove after testing)
app.get('/api/v1/health/stripe', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    keyType: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'
  });
});
```

### Step 3: Security Best Practices

```bash
# Restrict file permissions
chmod 600 .env

# Use secret management (recommended)
# AWS Secrets Manager
# Azure Key Vault
# Google Cloud Secret Manager
# HashiCorp Vault
```

---

## Webhook Setup

### Step 1: Determine Webhook URL

Your webhook endpoint will be:
```
https://api.go-caterham.com/api/v1/stripe/webhook
```

**Requirements:**
- Must use HTTPS (not HTTP)
- Must be publicly accessible
- Must return responses quickly (< 5 seconds)

### Step 2: Create Webhook Endpoint in Stripe

1. **Go to Webhooks Page**
   - URL: https://dashboard.stripe.com/webhooks
   - Switch to "Live mode"
   - Click "Add endpoint"

2. **Configure Endpoint**
   ```
   Endpoint URL: https://api.go-caterham.com/api/v1/stripe/webhook
   Description: GO-CATERHAM Production Webhook
   ```

3. **Select Events to Listen To**
   
   Select these events:
   
   **Payment Events:**
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
   - ✅ `payment_intent.canceled`
   
   **Payment Method Events:**
   - ✅ `payment_method.attached`
   - ✅ `payment_method.detached`
   
   **Charge Events:**
   - ✅ `charge.succeeded`
   - ✅ `charge.failed`
   - ✅ `charge.refunded`
   
   **Connect Events (for driver payouts):**
   - ✅ `account.updated`
   - ✅ `account.application.authorized`
   - ✅ `account.application.deauthorized`
   
   **Payout Events:**
   - ✅ `payout.paid`
   - ✅ `payout.failed`
   - ✅ `payout.canceled`
   
   **Dispute Events:**
   - ✅ `charge.dispute.created`
   - ✅ `charge.dispute.updated`

4. **Get Webhook Secret**
   - After creating, click on the webhook
   - Find "Signing secret" section
   - Click "Reveal"
   - Copy the secret (starts with `whsec_`)
   - Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_xxxxx`

### Step 3: Test Webhook Endpoint

#### Using Stripe CLI (Development/Staging)

```bash
# Install Stripe CLI
brew install stripe/stripe-brew/stripe

# Login
stripe login

# Test webhook forwarding
stripe listen --forward-to https://api.go-caterham.com/api/v1/stripe/webhook

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```

#### Using Stripe Dashboard

1. Go to webhook endpoint page
2. Click "Send test webhook"
3. Select event type
4. Click "Send test webhook"
5. Verify response is 200 OK

### Step 4: Webhook Verification Implementation

Your webhook handler already verifies signatures:

```javascript
// controllers/stripeController.js - handleWebhook
const signature = req.headers["stripe-signature"];
const event = stripeService.constructWebhookEvent(req.rawBody, signature);
```

**Important:** Ensure raw body is available in `app.js`:

```javascript
// app.js - Special handling for webhooks
app.use("/api/v1/stripe/webhook", express.raw({ type: "application/json" }));
```

### Step 5: Monitor Webhook Delivery

- Go to: https://dashboard.stripe.com/webhooks
- Click on your webhook endpoint
- Monitor "Recent deliveries"
- Check success/failure rates
- Review failed webhook attempts

---

## SSL/HTTPS Configuration

### Why HTTPS is Required

- Stripe requires HTTPS for webhooks
- PCI compliance requirement
- Protects sensitive payment data
- Required for 3D Secure

### Option 1: Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.go-caterham.com

# Auto-renewal (certbot handles this automatically)
sudo certbot renew --dry-run
```

### Option 2: Cloud Provider SSL

**AWS (ALB/CloudFront):**
- Use AWS Certificate Manager (ACM)
- Free SSL certificates
- Auto-renewal

**Azure:**
- Azure App Service Certificates
- Automatic binding

**Google Cloud:**
- Google-managed SSL certificates
- Cloud Load Balancing

### Option 3: Cloudflare (Proxy + SSL)

- Free SSL with Cloudflare proxy
- Additional DDoS protection
- CDN benefits

### Verify SSL Configuration

```bash
# Test SSL
curl -I https://api.go-caterham.com/api/v1/stripe/config

# Check SSL certificate
openssl s_client -connect api.go-caterham.com:443 -servername api.go-caterham.com

# Verify with Stripe
stripe webhooks create \
  --url https://api.go-caterham.com/api/v1/stripe/webhook \
  --enabled-events payment_intent.succeeded
```

---

## Database Migration

### Step 1: Backup Production Database

```bash
# MongoDB backup
mongodump --uri="mongodb+srv://..." --out=/backup/pre-stripe-migration

# Or use MongoDB Atlas automated backups
```

### Step 2: Run Migration Script

Create migration script:

```javascript
// scripts/migrate-stripe-fields.js
const mongoose = require('mongoose');
const Rider = require('./models/Rider');
const Driver = require('./models/Driver');
const Payment = require('./models/Payment');

async function migrateStripeFields() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('Starting Stripe fields migration...');
  
  // Update Riders
  const ridersUpdated = await Rider.updateMany(
    { stripeCustomerId: { $exists: false } },
    { 
      $set: { 
        stripeCustomerId: null,
        stripeCustomerCreatedAt: null
      } 
    }
  );
  console.log(`Updated ${ridersUpdated.modifiedCount} riders`);
  
  // Update Drivers
  const driversUpdated = await Driver.updateMany(
    { stripeConnectAccountId: { $exists: false } },
    { 
      $set: { 
        stripeConnectAccountId: null,
        stripeAccountStatus: 'pending',
        stripeOnboardingCompleted: false,
        earnings: {
          totalEarned: 0,
          availableBalance: 0,
          pendingBalance: 0,
          totalPaidOut: 0,
          currency: 'gbp'
        }
      } 
    }
  );
  console.log(`Updated ${driversUpdated.modifiedCount} drivers`);
  
  // Update Payments
  const paymentsUpdated = await Payment.updateMany(
    { currency: { $exists: false } },
    { 
      $set: { 
        currency: 'gbp',
        stripePaymentIntentId: null,
        stripeCustomerId: null
      } 
    }
  );
  console.log(`Updated ${paymentsUpdated.modifiedCount} payments`);
  
  console.log('Migration complete!');
  await mongoose.disconnect();
}

migrateStripeFields().catch(console.error);
```

Run migration:

```bash
NODE_ENV=production node scripts/migrate-stripe-fields.js
```

### Step 3: Verify Migration

```javascript
// Verify all models have new fields
db.riders.findOne({}, { stripeCustomerId: 1 });
db.drivers.findOne({}, { stripeConnectAccountId: 1, earnings: 1 });
db.payments.findOne({}, { currency: 1, stripePaymentIntentId: 1 });
```

---

## Testing in Production

### Phase 1: Smoke Tests

Test with real Stripe in live mode but small amounts:

```bash
# 1. Create small wallet top-up (£1)
curl -X POST https://api.go-caterham.com/api/v1/stripe/create-payment-intent \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1.00, "currency": "gbp"}'

# 2. Test payment method saving
# (Use frontend with Stripe.js)

# 3. Test webhook delivery
# Check Stripe Dashboard → Webhooks → Recent deliveries
```

### Phase 2: End-to-End Test

1. **Rider Flow:**
   - Register new rider account
   - Add £10 to wallet via Stripe
   - Book a ride
   - Complete ride
   - Verify payment processed

2. **Driver Flow:**
   - Register new driver account
   - Complete Stripe Connect onboarding
   - Complete a ride
   - Verify earnings tracked
   - Request small payout (£10)
   - Verify payout received

3. **Admin Flow:**
   - Process a small refund
   - Verify refund appears in Stripe dashboard
   - Test manual driver payout

### Phase 3: Load Testing

Use a tool like Apache Bench or k6:

```bash
# Test payment intent creation
ab -n 100 -c 10 -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -p payment-data.json \
  https://api.go-caterham.com/api/v1/stripe/create-payment-intent
```

---

## Monitoring & Alerts

### Stripe Dashboard Monitoring

1. **Payment Activity**
   - Dashboard → Home
   - Monitor successful/failed payments
   - Track payment volume and amounts

2. **Disputes and Chargebacks**
   - Dashboard → Payments → Disputes
   - Set up email alerts for disputes

3. **Webhook Monitoring**
   - Dashboard → Developers → Webhooks
   - Monitor delivery success rate
   - Review failed webhooks

### Application Monitoring

#### Set Up Error Logging

```javascript
// Add to stripeService.js
const logger = require('winston');

// Log all Stripe API calls
stripe.on('request', (request) => {
  logger.info('Stripe API Request', {
    method: request.method,
    path: request.path
  });
});

// Log all Stripe errors
stripe.on('response', (response) => {
  if (response.status >= 400) {
    logger.error('Stripe API Error', {
      status: response.status,
      message: response.body
    });
  }
});
```

#### Set Up Alerts

**CloudWatch (AWS):**
```javascript
// Alert on payment failures
// Metric: payment_intent_failed
// Threshold: > 5 in 5 minutes

// Alert on webhook failures
// Metric: webhook_signature_verification_failed
// Threshold: > 3 in 10 minutes
```

**Custom Email Alerts:**

```javascript
// Add to stripeController.js
async function handlePaymentIntentFailed(paymentIntent) {
  // ... existing code ...
  
  // Send alert for failed payment
  if (paymentIntent.amount > 10000) { // £100+
    await sendAdminAlert({
      type: 'HIGH_VALUE_PAYMENT_FAILED',
      amount: paymentIntent.amount / 100,
      customer: paymentIntent.customer,
      reason: paymentIntent.last_payment_error?.message
    });
  }
}
```

### Dashboard Integration

Consider integrating with:
- **Grafana** - Payment metrics visualization
- **Datadog** - Full-stack monitoring
- **New Relic** - APM and error tracking
- **Sentry** - Error tracking

---

## Go-Live Checklist

### Final Verification (Day Before Launch)

- [ ] All production keys configured
- [ ] Webhook endpoint verified and receiving events
- [ ] SSL certificate valid and not expiring soon
- [ ] Database migrations completed
- [ ] Backup strategy tested
- [ ] Monitoring and alerts configured
- [ ] Support email configured in Stripe
- [ ] Terms of service and privacy policy published
- [ ] Test transactions in production successful
- [ ] Team trained on Stripe dashboard
- [ ] Incident response plan documented

### Launch Day

1. **Morning (Before Launch)**
   - [ ] Final backup of database
   - [ ] Verify all services running
   - [ ] Check webhook health
   - [ ] Test one transaction end-to-end

2. **During Launch**
   - [ ] Monitor Stripe dashboard continuously
   - [ ] Watch application logs
   - [ ] Monitor webhook delivery
   - [ ] Be ready for quick rollback if needed

3. **First Hour Post-Launch**
   - [ ] Verify first real payments successful
   - [ ] Check webhook events processing
   - [ ] Monitor error rates
   - [ ] Verify customer emails sent

### First Week Post-Launch

- [ ] Daily review of Stripe dashboard
- [ ] Monitor dispute rate
- [ ] Check webhook failure rate
- [ ] Review payment success rate
- [ ] Analyze payment method usage
- [ ] Review driver payout success
- [ ] Check refund requests

---

## Post-Deployment

### Week 1 Tasks

1. **Monitor Key Metrics**
   - Payment success rate (target: >95%)
   - Webhook delivery rate (target: >99%)
   - Average payment amount
   - Refund rate (target: <5%)
   - Driver payout success rate

2. **Customer Support**
   - Train support team on payment issues
   - Document common problems and solutions
   - Set up escalation path for payment disputes

3. **Optimization**
   - Review slow payment flows
   - Optimize webhook processing
   - Review error logs for patterns

### Ongoing Maintenance

**Weekly:**
- Review Stripe dashboard for unusual activity
- Check webhook failure log
- Monitor dispute rate

**Monthly:**
- Review payment fees and reconciliation
- Analyze payment method preferences
- Review and optimize driver payout schedule
- Check for Stripe API updates

**Quarterly:**
- Review and rotate API keys (if needed)
- Update Stripe SDK to latest version
- Review PCI compliance
- Conduct security audit

---

## Troubleshooting

### Common Production Issues

#### Issue 1: Webhooks Not Being Received

**Symptoms:**
- Payments successful but not reflected in app
- Driver earnings not updating

**Diagnosis:**
```bash
# Check webhook endpoint is accessible
curl -X POST https://api.go-caterham.com/api/v1/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check Stripe webhook logs
# Dashboard → Webhooks → Select endpoint → Recent deliveries
```

**Solutions:**
1. Verify webhook URL is correct in Stripe dashboard
2. Check server is accepting requests on webhook endpoint
3. Verify webhook secret is correct in `.env`
4. Check firewall/security group allows Stripe IPs
5. Review application logs for webhook errors

#### Issue 2: Payment Intent Creation Fails

**Symptoms:**
- "Customer not found" errors
- "Invalid API key" errors

**Diagnosis:**
```javascript
// Add temporary logging
console.log('Stripe Key Type:', process.env.STRIPE_SECRET_KEY?.substring(0, 7));
console.log('Environment:', process.env.NODE_ENV);
```

**Solutions:**
1. Verify using live keys (`sk_live_`) in production
2. Check `NODE_ENV=production` is set
3. Verify Stripe customer ID format
4. Check network connectivity to Stripe API

#### Issue 3: 3D Secure Failures

**Symptoms:**
- Payments failing with "authentication required"
- Cards declining when they shouldn't

**Solutions:**
1. Ensure frontend properly handles 3D Secure redirects
2. Update to latest Stripe.js version
3. Test with 3D Secure test cards
4. Check `return_url` is properly configured

#### Issue 4: Driver Payouts Failing

**Symptoms:**
- Payout requests fail
- "Account not found" errors

**Diagnosis:**
```bash
# Check Connect account status
curl -X GET https://api.go-caterham.com/api/v1/stripe/connect/account-status \
  -H "Authorization: Bearer $DRIVER_TOKEN"
```

**Solutions:**
1. Verify driver completed Connect onboarding
2. Check Connect account is in "enabled" status
3. Verify sufficient available balance
4. Check bank account details are correct
5. Review Stripe Connect dashboard for errors

#### Issue 5: High Refund Rate

**Investigation:**
1. Review refund reasons in Stripe dashboard
2. Check for patterns (specific riders, drivers, times)
3. Analyze ride completion vs payment success
4. Review customer complaints

**Actions:**
1. Improve ride completion flow
2. Add payment confirmation before ride
3. Better fare estimation
4. Improve driver-rider communication

### Emergency Procedures

#### Emergency Rollback

If critical issues arise:

1. **Disable Stripe Payments Temporarily**
   ```javascript
   // Add feature flag
   const STRIPE_ENABLED = process.env.STRIPE_ENABLED === 'true';
   
   if (!STRIPE_ENABLED) {
     return res.status(503).json({
       message: 'Card payments temporarily unavailable. Please use cash or wallet.'
     });
   }
   ```

2. **Switch to Wallet/Cash Only**
   - Notify users via app notification
   - Update payment method selection UI
   - Process refunds for failed transactions

3. **Emergency Contact**
   - Stripe Support: https://support.stripe.com
   - Phone: Available in dashboard

---

## Support Resources

### Stripe Support

- **Dashboard**: https://dashboard.stripe.com
- **Documentation**: https://stripe.com/docs
- **Support**: https://support.stripe.com
- **Status Page**: https://status.stripe.com
- **API Changelog**: https://stripe.com/docs/upgrades

### Internal Resources

- **Runbook**: `docs/STRIPE_INTEGRATION.md`
- **Test Scripts**: `tests/stripe-*.test.js`
- **Architecture**: `docs/STRIPE_IMPLEMENTATION_SUMMARY.md`

### Emergency Contacts

```
Stripe Support: [from dashboard]
DevOps Team: [your team]
Database Admin: [your DBA]
Security Team: [your security contact]
```

---

## Compliance & Legal

### PCI Compliance

✅ Your implementation is PCI compliant because:
- No card data stored on your servers
- All card data handled by Stripe (PCI Level 1)
- Using Stripe.js for card collection
- HTTPS for all payment communications

### Data Protection (GDPR)

Ensure:
- [ ] Privacy policy mentions Stripe
- [ ] Users can delete payment methods
- [ ] Data retention policy defined
- [ ] Stripe customer data can be deleted on request

### Terms of Service

Include in your ToS:
- Payment processing by Stripe
- Refund policy
- Driver payout terms
- Platform commission structure (20%)

---

## Summary

You've successfully deployed Stripe to production! 🎉

**Key Points:**
✅ Live API keys configured
✅ Webhooks set up and verified  
✅ SSL/HTTPS enabled  
✅ Database migrated  
✅ Monitoring in place  
✅ Team trained  

**Next Steps:**
1. Monitor closely for first 24-48 hours
2. Gather user feedback
3. Optimize based on real usage patterns
4. Plan for scaling (if needed)

**Remember:**
- Always test in Stripe test mode first
- Monitor webhooks continuously
- Keep API keys secure
- Review Stripe dashboard daily
- Respond to disputes quickly

Good luck with your launch! 🚀
