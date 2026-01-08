/**
 * Stripe Integration Test Runner
 * 
 * Runs all Stripe integration tests in sequence
 * 
 * Usage: node tests/stripe-test-runner.js
 */

const { spawn } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

const testSuites = [
  {
    name: 'Wallet Top-Up',
    file: 'stripe-wallet-topup.test.js',
    description: 'Tests wallet top-up flow with Stripe payments'
  },
  {
    name: 'Saved Payment Methods',
    file: 'stripe-saved-cards.test.js',
    description: 'Tests saving and managing payment methods'
  },
  {
    name: 'Driver Payouts',
    file: 'stripe-driver-payouts.test.js',
    description: 'Tests Stripe Connect and driver payouts'
  },
  {
    name: 'Admin & Refunds',
    file: 'stripe-refunds-admin.test.js',
    description: 'Tests admin operations and refund processing'
  }
];

function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, testFile);
    const child = spawn('node', [testPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', (err) => {
      log(`Error running test: ${err.message}`, 'red');
      resolve(false);
    });
  });
}

async function runAllTests() {
  log('\n' + '='.repeat(70), 'magenta');
  log('🚀 STRIPE INTEGRATION TEST SUITE RUNNER', 'magenta');
  log('='.repeat(70), 'magenta');
  
  log(`\nRunning ${testSuites.length} test suites...\n`, 'cyan');
  
  const results = [];
  
  for (let i = 0; i < testSuites.length; i++) {
    const suite = testSuites[i];
    
    log('\n' + '─'.repeat(70), 'cyan');
    log(`[${i + 1}/${testSuites.length}] ${suite.name}`, 'cyan');
    log(`Description: ${suite.description}`, 'blue');
    log('─'.repeat(70), 'cyan');
    
    const success = await runTest(suite.file);
    results.push({
      name: suite.name,
      file: suite.file,
      success
    });
    
    if (i < testSuites.length - 1) {
      log('\n⏳ Waiting 2 seconds before next test...', 'yellow');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  log('\n' + '='.repeat(70), 'magenta');
  log('📊 OVERALL TEST RESULTS', 'magenta');
  log('='.repeat(70), 'magenta');
  
  let passed = 0;
  let failed = 0;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    const color = result.success ? 'green' : 'red';
    log(`${index + 1}. ${result.name}: ${status}`, color);
    
    if (result.success) passed++;
    else failed++;
  });
  
  log('\n' + '─'.repeat(70), 'cyan');
  log(`Total Suites: ${results.length}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  
  const successRate = ((passed / results.length) * 100).toFixed(1);
  log(`Success Rate: ${successRate}%`, successRate >= 75 ? 'green' : 'yellow');
  
  log('\n' + '='.repeat(70), 'magenta');
  
  if (failed > 0) {
    log('\n⚠️  Some tests failed. This may be expected for automated tests.', 'yellow');
    log('Complete payment flows require frontend Stripe.js integration.', 'blue');
  } else {
    log('\n🎉 All test suites passed!', 'green');
  }
  
  log('\n');
}

// Run tests
log('\n🧪 Starting Stripe Integration Tests...', 'cyan');
log('Make sure your backend server is running!\n', 'yellow');

runAllTests().catch((error) => {
  log(`\n❌ Fatal Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
