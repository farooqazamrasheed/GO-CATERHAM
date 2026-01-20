/**
 * Test Script for Ride Timeout Fix
 * 
 * This script tests the following scenario:
 * 1. Rider books ride → Timeout starts (30s)
 * 2. Driver accepts ride within 30s → Timeout gets cleared
 * 3. Wait 30s after accept → Timeout should NOT fire
 * 4. Rider should see: "Driver Found" (NOT cancelled)
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Ride = require('./models/Ride');
const Driver = require('./models/Driver');
const Rider = require('./models/Rider');
const rideRequestManager = require('./utils/rideRequestManager');

async function testTimeoutFix() {
  try {
    console.log('\n========================================');
    console.log('🧪 TESTING RIDE TIMEOUT FIX');
    console.log('========================================\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');

    // Find a test rider and driver
    const testRider = await Rider.findOne().populate('user');
    const testDriver = await Driver.findOne({ status: 'online', isApproved: 'approved' }).populate('user');

    if (!testRider || !testDriver) {
      console.log('❌ ERROR: Need at least one rider and one online driver for testing');
      process.exit(1);
    }

    console.log(`👤 Test Rider: ${testRider.user?.fullName || 'Unknown'}`);
    console.log(`🚗 Test Driver: ${testDriver.user?.fullName || 'Unknown'}\n`);

    // Step 1: Create a test ride
    console.log('📝 STEP 1: Creating test ride...');
    const testRide = await Ride.create({
      rider: testRider._id,
      status: 'searching',
      pickup: {
        lat: 51.3148,
        lng: -0.5600,
        address: 'Test Pickup Location'
      },
      dropoff: {
        lat: 51.3200,
        lng: -0.5700,
        address: 'Test Dropoff Location'
      },
      vehicleType: testDriver.vehicleType || 'sedan',
      estimatedFare: 15.50,
      paymentMethod: 'wallet'
    });

    console.log(`✅ Ride created: ${testRide._id}`);
    console.log(`📊 Initial status: ${testRide.status}\n`);

    // Step 2: Start timeout (30 seconds)
    console.log('⏱️  STEP 2: Starting 30-second timeout...');
    rideRequestManager.startRideRequest(testRide._id.toString(), [testDriver.user._id.toString()]);
    console.log('✅ Timeout started\n');

    // Step 3: Wait 5 seconds then driver accepts
    console.log('⏳ STEP 3: Waiting 5 seconds before driver accepts...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🚗 Driver accepting ride...');
    await rideRequestManager.acceptRide(testRide._id.toString(), testDriver.user._id.toString());
    
    // Check ride status after acceptance
    const rideAfterAccept = await Ride.findById(testRide._id);
    console.log(`✅ Ride accepted!`);
    console.log(`📊 Status after accept: ${rideAfterAccept.status}`);
    console.log(`🚫 Timeout should be cleared now\n`);

    // Step 4: Wait 35 seconds (longer than 30s timeout)
    console.log('⏳ STEP 4: Waiting 35 seconds to verify timeout does NOT fire...');
    console.log('   (If timeout fires, you will see cancellation logs)\n');
    
    for (let i = 35; i > 0; i--) {
      process.stdout.write(`\r   ⏲️  ${i} seconds remaining...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\n');

    // Step 5: Check final ride status
    console.log('🔍 STEP 5: Checking final ride status...');
    const finalRide = await Ride.findById(testRide._id);
    
    console.log('\n========================================');
    console.log('📊 FINAL RESULTS');
    console.log('========================================');
    console.log(`Ride ID: ${finalRide._id}`);
    console.log(`Status: ${finalRide.status}`);
    console.log(`Driver: ${finalRide.driver ? 'Assigned' : 'None'}`);
    console.log(`Accepted At: ${finalRide.acceptedAt || 'N/A'}`);
    console.log(`Cancelled At: ${finalRide.cancelledAt || 'N/A'}`);
    console.log(`Cancellation Reason: ${finalRide.cancellationReason || 'N/A'}`);
    console.log('========================================\n');

    // Validate results
    if (finalRide.status === 'accepted' && !finalRide.cancelledAt) {
      console.log('✅ ✅ ✅ TEST PASSED! ✅ ✅ ✅');
      console.log('   Ride remained "accepted" and was NOT cancelled after timeout!');
    } else if (finalRide.status === 'cancelled') {
      console.log('❌ ❌ ❌ TEST FAILED! ❌ ❌ ❌');
      console.log('   Ride was cancelled even though driver accepted it!');
      console.log('   This means the timeout was NOT properly cleared.');
    } else {
      console.log('⚠️  UNEXPECTED STATUS:', finalRide.status);
    }

    console.log('\n🧹 Cleaning up test ride...');
    await Ride.findByIdAndDelete(testRide._id);
    console.log('✅ Test ride deleted\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from database\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testTimeoutFix().then(() => {
  console.log('🎉 Test completed successfully!\n');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});
