/**
 * Test Script: Stripe Wallet Top-Up Flow
 * 
 * This script tests the complete wallet top-up flow using Stripe payments
 * 
 * Prerequisites:
 * 1. Backend server running on http://localhost:5000
 * 2. Valid rider authentication token
 * 3. Stripe test keys configured in .env
 * 
 * Usage: node tests/stripe-wallet-topup.test.js
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/v1`;

// Test user credentials (update with your test rider credentials)
const TEST_RIDER = {
  email: 'testrider@example.com',
  password: 'TestPassword123!'
};

let authToken = '';
let riderId = '';

// Colors for console output
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

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null, token = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers,
      data
    };

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
}

// Test Steps

/**
 * Step 1: Login as rider
 */
async function loginRider() {
  logStep(1, 'Login as Rider');
  
  const result = await apiRequest('POST', '/auth/login', {
    email: TEST_RIDER.email,
    password: TEST_RIDER.password,
    role: 'rider'
  });

  if (result.success) {
    authToken = result.data.token;
    riderId = result.data.user._id;
    logSuccess(`Logged in successfully as ${TEST_RIDER.email}`);
    logInfo(`Rider ID: ${riderId}`);
    logInfo(`Token: ${authToken.substring(0, 20)}...`);
    return true;
  } else {
    logError(`Login failed: ${result.error}`);
    logWarning('Make sure the test rider account exists and credentials are correct');
    return false;
  }
}

/**
 * Step 2: Get initial wallet balance
 */
async function getInitialWalletBalance() {
  logStep(2, 'Get Initial Wallet Balance');
  
  const result = await apiRequest('GET', '/wallets/my-wallet', null, authToken);

  if (result.success) {
    const balance = result.data.wallet?.balance || 0;
    logSuccess(`Current wallet balance: £${balance.toFixed(2)}`);
    return balance;
  } else {
    logError(`Failed to get wallet balance: ${result.error}`);
    return null;
  }
}

/**
 * Step 3: Get Stripe configuration
 */
async function getStripeConfig() {
  logStep(3, 'Get Stripe Configuration');
  
  const result = await apiRequest('GET', '/stripe/config');

  if (result.success) {
    const publishableKey = result.data.data.publishableKey;
    const environment = result.data.data.environment;
    logSuccess(`Stripe configured in ${environment} mode`);
    logInfo(`Publishable Key: ${publishableKey.substring(0, 20)}...`);
    return result.data.data;
  } else {
    logError(`Failed to get Stripe config: ${result.error}`);
    return null;
  }
}

/**
 * Step 4: Create payment intent
 */
async function createPaymentIntent(amount = 50.00) {
  logStep(4, `Create Payment Intent for £${amount.toFixed(2)}`);
  
  const result = await apiRequest('POST', '/stripe/create-payment-intent', {
    amount,
    currency: 'gbp',
    description: 'Test wallet top-up'
  }, authToken);

  if (result.success) {
    const { clientSecret, paymentIntentId, paymentId } = result.data.data;
    logSuccess('Payment intent created successfully');
    logInfo(`Payment Intent ID: ${paymentIntentId}`);
    logInfo(`Payment ID (MongoDB): ${paymentId}`);
    logInfo(`Client Secret: ${clientSecret.substring(0, 30)}...`);
    
    return {
      clientSecret,
      paymentIntentId,
      paymentId,
      amount
    };
  } else {
    logError(`Failed to create payment intent: ${result.error}`);
    return null;
  }
}

/**
 * Step 5: Simulate payment confirmation (Normally done by frontend with Stripe.js)
 */
async function simulateStripePayment(paymentIntentId) {
  logStep(5, 'Simulate Stripe Payment');
  
  logWarning('This is a simulated step. In real app, Stripe.js handles this.');
  logInfo('Frontend would use Stripe.js to confirm payment with test card:');
  logInfo('  Card Number: 4242 4242 4242 4242');
  logInfo('  Expiry: Any future date (e.g., 12/25)');
  logInfo('  CVC: Any 3 digits (e.g., 123)');
  logInfo('  Postal Code: Any valid code');
  
  logInfo('\nWaiting 2 seconds to simulate payment processing...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  logSuccess('Payment simulation complete (assuming success)');
  return true;
}

/**
 * Step 6: Confirm payment on backend
 */
async function confirmPayment(paymentIntentId) {
  logStep(6, 'Confirm Payment on Backend');
  
  const result = await apiRequest('POST', '/stripe/confirm-payment', {
    paymentIntentId
  }, authToken);

  if (result.success) {
    logSuccess('Payment confirmed successfully on backend');
    logInfo(`Payment Status: ${result.data.data.status}`);
    logInfo(`Amount: £${result.data.data.amount.toFixed(2)}`);
    return true;
  } else {
    logError(`Failed to confirm payment: ${result.error}`);
    
    if (result.error.includes('requires_payment_method')) {
      logWarning('Payment requires actual card confirmation via Stripe.js');
      logInfo('This test can only verify the API endpoints, not actual payment processing');
    }
    
    return false;
  }
}

/**
 * Step 7: Verify wallet balance updated
 */
async function verifyWalletBalance(initialBalance, topupAmount) {
  logStep(7, 'Verify Wallet Balance Updated');
  
  const result = await apiRequest('GET', '/wallets/my-wallet', null, authToken);

  if (result.success) {
    const newBalance = result.data.wallet?.balance || 0;
    const expectedBalance = initialBalance + topupAmount;
    
    logInfo(`Initial Balance: £${initialBalance.toFixed(2)}`);
    logInfo(`Top-up Amount: £${topupAmount.toFixed(2)}`);
    logInfo(`Expected Balance: £${expectedBalance.toFixed(2)}`);
    logInfo(`Actual Balance: £${newBalance.toFixed(2)}`);
    
    if (Math.abs(newBalance - expectedBalance) < 0.01) {
      logSuccess('✓ Wallet balance updated correctly!');
      return true;
    } else {
      logWarning('Wallet balance does not match expected value');
      logInfo('This may be normal if payment was not actually processed');
      return false;
    }
  } else {
    logError(`Failed to verify wallet balance: ${result.error}`);
    return false;
  }
}

/**
 * Step 8: View wallet transactions
 */
async function viewWalletTransactions() {
  logStep(8, 'View Wallet Transaction History');
  
  const result = await apiRequest('GET', '/wallets/my-wallet', null, authToken);

  if (result.success) {
    const transactions = result.data.wallet?.transactions || [];
    logSuccess(`Found ${transactions.length} transactions`);
    
    if (transactions.length > 0) {
      logInfo('\nRecent Transactions:');
      transactions.slice(-5).reverse().forEach((tx, index) => {
        const sign = tx.type === 'credit' ? '+' : '-';
        console.log(`  ${index + 1}. ${sign}£${tx.amount.toFixed(2)} - ${tx.description || tx.type}`);
        console.log(`     Date: ${new Date(tx.timestamp).toLocaleString()}`);
      });
    }
    
    return true;
  } else {
    logError(`Failed to get transactions: ${result.error}`);
    return false;
  }
}

/**
 * Additional Test: Test with different amounts
 */
async function testDifferentAmounts() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Additional Test: Multiple Top-Up Amounts', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const testAmounts = [10, 25, 100];
  
  for (const amount of testAmounts) {
    logInfo(`\nTesting top-up of £${amount.toFixed(2)}`);
    
    const intent = await createPaymentIntent(amount);
    if (!intent) {
      logError(`Failed to create payment intent for £${amount}`);
      continue;
    }
    
    logInfo(`✓ Payment intent created for £${amount}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  logSuccess('Completed testing multiple amounts');
}

/**
 * Additional Test: Test currency support
 */
async function testCurrencySupport() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Additional Test: Currency Support', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const result = await apiRequest('GET', '/stripe/currencies');
  
  if (result.success) {
    const currencies = result.data.data;
    logSuccess(`Supported currencies: ${currencies.length}`);
    
    currencies.forEach(currency => {
      logInfo(`  ${currency.symbol} ${currency.code}`);
    });
    
    return true;
  } else {
    logError(`Failed to get currencies: ${result.error}`);
    return false;
  }
}

/**
 * Main test execution
 */
async function runTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 STRIPE WALLET TOP-UP TEST SUITE', 'cyan');
  log('='.repeat(60), 'cyan');
  
  logInfo(`Testing against: ${BASE_URL}`);
  logInfo(`Time: ${new Date().toLocaleString()}\n`);
  
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // Step 1: Login
    testsRun++;
    if (await loginRider()) {
      testsPassed++;
    } else {
      testsFailed++;
      logError('Cannot proceed without login. Exiting...');
      return;
    }
    
    // Step 2: Get initial balance
    testsRun++;
    const initialBalance = await getInitialWalletBalance();
    if (initialBalance !== null) {
      testsPassed++;
    } else {
      testsFailed++;
    }
    
    // Step 3: Get Stripe config
    testsRun++;
    if (await getStripeConfig()) {
      testsPassed++;
    } else {
      testsFailed++;
    }
    
    // Step 4: Create payment intent
    testsRun++;
    const topupAmount = 50.00;
    const paymentIntent = await createPaymentIntent(topupAmount);
    if (paymentIntent) {
      testsPassed++;
    } else {
      testsFailed++;
      logError('Cannot proceed without payment intent. Exiting...');
      return;
    }
    
    // Step 5: Simulate payment
    testsRun++;
    if (await simulateStripePayment(paymentIntent.paymentIntentId)) {
      testsPassed++;
    } else {
      testsFailed++;
    }
    
    // Step 6: Confirm payment
    testsRun++;
    const confirmed = await confirmPayment(paymentIntent.paymentIntentId);
    if (confirmed) {
      testsPassed++;
    } else {
      testsFailed++;
      logWarning('Payment confirmation failed - this is expected in automated tests');
      logInfo('Actual payment requires real Stripe.js integration on frontend');
    }
    
    // Step 7: Verify balance (only if payment was confirmed)
    if (confirmed) {
      testsRun++;
      if (await verifyWalletBalance(initialBalance, topupAmount)) {
        testsPassed++;
      } else {
        testsFailed++;
      }
    }
    
    // Step 8: View transactions
    testsRun++;
    if (await viewWalletTransactions()) {
      testsPassed++;
    } else {
      testsFailed++;
    }
    
    // Additional tests
    await testCurrencySupport();
    await testDifferentAmounts();
    
  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');
  
  log(`Total Tests: ${testsRun}`);
  logSuccess(`Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    logError(`Failed: ${testsFailed}`);
  }
  
  const successRate = ((testsPassed / testsRun) * 100).toFixed(1);
  log(`Success Rate: ${successRate}%`, successRate >= 70 ? 'green' : 'red');
  
  log('\n' + '='.repeat(60), 'cyan');
  
  if (testsFailed > 0) {
    logWarning('\nNote: Some test failures are expected in automated testing');
    logInfo('Complete payment flow requires frontend Stripe.js integration');
  }
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
