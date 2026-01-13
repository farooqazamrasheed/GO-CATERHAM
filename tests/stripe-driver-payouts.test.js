/**
 * Test Script: Stripe Driver Payouts & Connect
 * 
 * Tests driver Stripe Connect account setup and payout functionality
 * 
 * Prerequisites:
 * 1. Backend server running
 * 2. Valid driver authentication token
 * 3. Stripe test keys configured
 * 
 * Usage: node tests/stripe-driver-payouts.test.js
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/v1`;

const TEST_DRIVER = {
  email: 'testdriver@example.com',
  password: 'TestPassword123!'
};

let authToken = '';
let driverId = '';

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

async function loginDriver() {
  logStep(1, 'Login as Driver');
  
  const result = await apiRequest('POST', '/auth/login', {
    email: TEST_DRIVER.email,
    password: TEST_DRIVER.password,
    role: 'driver'
  });

  if (result.success) {
    authToken = result.data.token;
    driverId = result.data.user._id;
    logSuccess(`Logged in as ${TEST_DRIVER.email}`);
    return true;
  } else {
    logError(`Login failed: ${result.error}`);
    return false;
  }
}

async function getEarningsSummary() {
  logStep(2, 'Get Driver Earnings Summary');
  
  const result = await apiRequest('GET', '/drivers/earnings/summary', null, authToken);

  if (result.success) {
    const earnings = result.data.data;
    logSuccess('Earnings summary retrieved');
    logInfo(`Total Earnings: £${earnings.totalEarnings.amount.toFixed(2)}`);
    logInfo(`Available Balance: £${earnings.availableBalance.toFixed(2)}`);
    logInfo(`Pending Balance: £${earnings.pendingBalance.toFixed(2)}`);
    logInfo(`Total Paid Out: £${earnings.totalPaidOut.toFixed(2)}`);
    logInfo(`Total Rides: ${earnings.totalRides}`);
    logInfo(`Stripe Account Status: ${earnings.stripeAccountStatus}`);
    logInfo(`Onboarding Complete: ${earnings.stripeOnboardingCompleted}`);
    
    return earnings;
  } else {
    logError(`Failed to get earnings: ${result.error}`);
    return null;
  }
}

async function createConnectAccount() {
  logStep(3, 'Create Stripe Connect Account');
  
  const result = await apiRequest('POST', '/stripe/connect/create-account', null, authToken);

  if (result.success) {
    logSuccess('Connect account created');
    logInfo(`Account ID: ${result.data.data.accountId}`);
    return result.data.data.accountId;
  } else {
    if (result.error.includes('already has')) {
      logWarning('Driver already has a Connect account');
      return 'existing';
    }
    logError(`Failed to create account: ${result.error}`);
    return null;
  }
}

async function getOnboardingLink() {
  logStep(4, 'Get Onboarding Link');
  
  const result = await apiRequest('GET', '/stripe/connect/onboarding-link', null, authToken);

  if (result.success) {
    logSuccess('Onboarding link generated');
    logInfo(`URL: ${result.data.data.url}`);
    logWarning('Driver should visit this URL to complete bank account setup');
    return result.data.data.url;
  } else {
    logError(`Failed to get onboarding link: ${result.error}`);
    return null;
  }
}

async function getConnectAccountStatus() {
  logStep(5, 'Get Connect Account Status');
  
  const result = await apiRequest('GET', '/stripe/connect/account-status', null, authToken);

  if (result.success) {
    const status = result.data.data;
    logSuccess('Account status retrieved');
    logInfo(`Charges Enabled: ${status.chargesEnabled}`);
    logInfo(`Payouts Enabled: ${status.payoutsEnabled}`);
    logInfo(`Onboarding Complete: ${status.onboardingComplete}`);
    logInfo(`Status: ${status.status}`);
    return status;
  } else {
    logError(`Failed to get status: ${result.error}`);
    return null;
  }
}

async function requestPayout(amount) {
  logStep(6, `Request Payout of £${amount.toFixed(2)}`);
  
  const result = await apiRequest('POST', '/drivers/earnings/payout', {
    amount
  }, authToken);

  if (result.success) {
    logSuccess('Payout requested successfully');
    logInfo(`Payout ID: ${result.data.data.payoutId}`);
    logInfo(`Amount: £${result.data.data.amount.toFixed(2)}`);
    logInfo(`Status: ${result.data.data.status}`);
    return true;
  } else {
    logError(`Payout failed: ${result.error}`);
    return false;
  }
}

async function runTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 STRIPE DRIVER PAYOUTS TEST SUITE', 'cyan');
  log('='.repeat(60), 'cyan');
  
  let passed = 0;
  let total = 0;
  
  try {
    total++;
    if (await loginDriver()) passed++;
    else return;
    
    total++;
    const earnings = await getEarningsSummary();
    if (earnings) passed++;
    
    total++;
    const accountId = await createConnectAccount();
    if (accountId) passed++;
    
    if (accountId && accountId !== 'existing') {
      total++;
      if (await getOnboardingLink()) passed++;
    }
    
    total++;
    const status = await getConnectAccountStatus();
    if (status) passed++;
    
    if (earnings && earnings.availableBalance > 0) {
      total++;
      const payoutAmount = Math.min(10, earnings.availableBalance);
      if (await requestPayout(payoutAmount)) passed++;
    } else {
      logWarning('\nNo available balance to test payout');
    }
    
  } catch (error) {
    logError(`Error: ${error.message}`);
  }
  
  log('\n' + '='.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`Tests: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  log(`Success Rate: ${((passed/total)*100).toFixed(1)}%`, passed === total ? 'green' : 'yellow');
}

runTests().catch(console.error);
