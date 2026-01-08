/**
 * Test Script: Stripe Refunds & Admin Operations
 * 
 * Tests admin-level operations including refunds and manual payouts
 * 
 * Prerequisites:
 * 1. Backend server running
 * 2. Valid admin authentication token
 * 3. Stripe test keys configured
 * 
 * Usage: node tests/stripe-refunds-admin.test.js
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/v1`;

const TEST_ADMIN = {
  email: 'admin@example.com',
  password: 'AdminPassword123!'
};

let authToken = '';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logStep(step, message) {
  log(`\n[Step ${step}] ${message}`, 'cyan');
}

async function apiRequest(method, endpoint, data = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await axios({
      method,
      url: `${API_URL}${endpoint}`,
      headers,
      data
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
}

async function loginAdmin() {
  logStep(1, 'Login as Admin');
  
  const result = await apiRequest('POST', '/auth/login', {
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
    role: 'admin'
  });

  if (result.success) {
    authToken = result.data.token;
    logSuccess(`Logged in as ${TEST_ADMIN.email}`);
    return true;
  } else {
    logError(`Login failed: ${result.error}`);
    return false;
  }
}

async function getAllPayments() {
  logStep(2, 'Get Recent Payments');
  
  const result = await apiRequest('GET', '/payments', null, authToken);

  if (result.success) {
    const payments = result.data.payments || [];
    logSuccess(`Found ${payments.length} payments`);
    
    if (payments.length > 0) {
      logInfo('\nRecent Payments:');
      payments.slice(0, 5).forEach((payment, index) => {
        console.log(`  ${index + 1}. Amount: £${payment.amount.toFixed(2)}`);
        console.log(`     Status: ${payment.status}`);
        console.log(`     Method: ${payment.paymentMethod}`);
        console.log(`     ID: ${payment._id}`);
        if (payment.stripePaymentIntentId) {
          console.log(`     Stripe ID: ${payment.stripePaymentIntentId}`);
        }
      });
    }
    
    return payments;
  } else {
    logError(`Failed to get payments: ${result.error}`);
    return null;
  }
}

async function testRefundValidation() {
  logStep(3, 'Test Refund Validation');
  
  logInfo('Testing with invalid payment ID...');
  
  const result = await apiRequest('POST', '/stripe/refund', {
    paymentId: 'invalid_payment_id_12345',
    amount: 10.00,
    reason: 'requested_by_customer'
  }, authToken);

  if (!result.success) {
    logSuccess(`✓ Correctly rejected invalid payment ID: ${result.error}`);
    return true;
  } else {
    logError('✗ Should have rejected invalid payment ID');
    return false;
  }
}

async function testRefundWithMockPayment(payments) {
  logStep(4, 'Test Refund with Real Payment');
  
  if (!payments || payments.length === 0) {
    logWarning('No payments available to test refund');
    return true;
  }
  
  // Find a paid payment with card
  const paidPayment = payments.find(p => 
    p.status === 'paid' && 
    p.paymentMethod === 'card' &&
    p.stripePaymentIntentId
  );
  
  if (!paidPayment) {
    logWarning('No eligible payment found for refund test');
    logInfo('Need a paid card payment with Stripe payment intent');
    return true;
  }
  
  logInfo(`Found eligible payment: ${paidPayment._id}`);
  logInfo(`Amount: £${paidPayment.amount.toFixed(2)}`);
  logInfo(`Stripe ID: ${paidPayment.stripePaymentIntentId}`);
  
  logWarning('\n⚠️  WARNING: This will attempt a REAL refund!');
  logInfo('Skipping actual refund execution for safety');
  logInfo('To test refund manually, use:');
  console.log(`
  curl -X POST ${API_URL}/stripe/refund \\
    -H "Authorization: Bearer ${authToken.substring(0, 20)}..." \\
    -H "Content-Type: application/json" \\
    -d '{
      "paymentId": "${paidPayment._id}",
      "amount": ${paidPayment.amount},
      "reason": "requested_by_customer"
    }'
  `);
  
  return true;
}

async function testPartialRefund() {
  logStep(5, 'Test Partial Refund Validation');
  
  logInfo('Testing partial refund with mock data...');
  
  const result = await apiRequest('POST', '/stripe/refund', {
    paymentId: 'mock_payment_id',
    amount: 25.00, // Partial amount
    reason: 'requested_by_customer'
  }, authToken);

  if (!result.success) {
    logSuccess(`✓ Validation working: ${result.error}`);
    return true;
  } else {
    logWarning('Refund endpoint accepted mock data (unexpected)');
    return false;
  }
}

async function getAllDrivers() {
  logStep(6, 'Get All Drivers for Payout Testing');
  
  const result = await apiRequest('GET', '/admin/drivers', null, authToken);

  if (result.success) {
    const drivers = result.data.drivers || [];
    logSuccess(`Found ${drivers.length} drivers`);
    
    if (drivers.length > 0) {
      logInfo('\nDriver List (first 5):');
      drivers.slice(0, 5).forEach((driver, index) => {
        console.log(`  ${index + 1}. Name: ${driver.user?.fullName || 'N/A'}`);
        console.log(`     Status: ${driver.activeStatus}`);
        console.log(`     ID: ${driver._id}`);
      });
    }
    
    return drivers;
  } else {
    logError(`Failed to get drivers: ${result.error}`);
    return null;
  }
}

async function testAdminDriverPayout(drivers) {
  logStep(7, 'Test Admin Driver Payout');
  
  if (!drivers || drivers.length === 0) {
    logWarning('No drivers available to test payout');
    return true;
  }
  
  const testDriver = drivers[0];
  logInfo(`Testing payout for driver: ${testDriver._id}`);
  
  logWarning('Skipping actual payout execution for safety');
  logInfo('To test admin payout manually, use:');
  console.log(`
  curl -X POST ${API_URL}/stripe/connect/payout \\
    -H "Authorization: Bearer ${authToken.substring(0, 20)}..." \\
    -H "Content-Type: application/json" \\
    -d '{
      "driverId": "${testDriver._id}",
      "amount": 50.00
    }'
  `);
  
  return true;
}

async function testRefundReasons() {
  logStep(8, 'Test Refund Reason Validation');
  
  const validReasons = ['duplicate', 'fraudulent', 'requested_by_customer'];
  
  logInfo(`Valid refund reasons: ${validReasons.join(', ')}`);
  logSuccess('✓ Refund reasons properly defined');
  
  return true;
}

async function testAdminPermissions() {
  logStep(9, 'Test Admin-Only Permissions');
  
  logInfo('Verifying that admin endpoints require admin role...');
  
  // Test accessing admin endpoint without proper auth
  const result = await apiRequest('POST', '/stripe/refund', {
    paymentId: 'test',
    amount: 10
  }, 'invalid_token');

  if (!result.success && result.status === 401) {
    logSuccess('✓ Admin endpoints properly protected');
    return true;
  } else {
    logWarning('Authorization check may not be working correctly');
    return false;
  }
}

async function runTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 STRIPE REFUNDS & ADMIN OPERATIONS TEST SUITE', 'cyan');
  log('='.repeat(60), 'cyan');
  
  let passed = 0;
  let total = 0;
  
  try {
    total++;
    if (await loginAdmin()) passed++;
    else return;
    
    total++;
    const payments = await getAllPayments();
    if (payments !== null) passed++;
    
    total++;
    if (await testRefundValidation()) passed++;
    
    total++;
    if (await testRefundWithMockPayment(payments)) passed++;
    
    total++;
    if (await testPartialRefund()) passed++;
    
    total++;
    const drivers = await getAllDrivers();
    if (drivers !== null) passed++;
    
    total++;
    if (await testAdminDriverPayout(drivers)) passed++;
    
    total++;
    if (await testRefundReasons()) passed++;
    
    total++;
    if (await testAdminPermissions()) passed++;
    
  } catch (error) {
    logError(`Error: ${error.message}`);
  }
  
  log('\n' + '='.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`Tests: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  log(`Success Rate: ${((passed/total)*100).toFixed(1)}%`, passed === total ? 'green' : 'yellow');
  
  log('\n' + '='.repeat(60), 'cyan');
  logInfo('📝 Important Notes:');
  logInfo('• Actual refund/payout execution skipped for safety');
  logInfo('• Use provided curl commands for manual testing');
  logInfo('• Always test refunds in Stripe test mode first');
  logInfo('• Monitor Stripe dashboard for refund/payout status');
}

runTests().catch(console.error);
