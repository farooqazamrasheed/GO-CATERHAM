/**
 * Utility to clear ongoing/stuck rides from database
 * 
 * Usage: node utils/clearOngoingRides.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Rider = require('../models/Rider');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function clearOngoingRides() {
  try {
    log('\n='.repeat(60), 'cyan');
    log('CLEAR ONGOING RIDES UTILITY', 'cyan');
    log('='.repeat(60), 'cyan');

    // Connect to database
    log('\n▶ Connecting to database...', 'yellow');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tapaxi');
    log('✓ Connected to database', 'green');

    // Find all ongoing rides (not completed or cancelled)
    log('\n▶ Finding ongoing rides...', 'yellow');
    const ongoingStatuses = ['requested', 'searching', 'assigned', 'accepted', 'in_progress', 'scheduled'];
    
    const ongoingRides = await Ride.find({
      status: { $in: ongoingStatuses }
    }).populate('rider', 'fullName email')
      .populate('driver', 'user');

    log(`✓ Found ${ongoingRides.length} ongoing rides`, ongoingRides.length > 0 ? 'yellow' : 'green');

    if (ongoingRides.length === 0) {
      log('\n✓ No ongoing rides to clear!', 'green');
      await mongoose.disconnect();
      return;
    }

    // Show details of rides to be cleared
    log('\n📋 Ongoing Rides to Clear:', 'cyan');
    ongoingRides.forEach((ride, index) => {
      log(`\n${index + 1}. Ride ID: ${ride._id}`, 'blue');
      log(`   Status: ${ride.status}`, 'yellow');
      log(`   Rider: ${ride.rider?.fullName || ride.rider?.email || 'Unknown'}`, 'white');
      log(`   Driver: ${ride.driver ? (ride.driver.user?.fullName || 'Assigned') : 'Not assigned'}`, 'white');
      log(`   Pickup: ${ride.pickup?.address || 'N/A'}`, 'white');
      log(`   Dropoff: ${ride.dropoff?.address || 'N/A'}`, 'white');
      log(`   Created: ${ride.createdAt}`, 'white');
    });

    // Ask for confirmation (in production)
    log('\n⚠ WARNING: This will cancel all ongoing rides!', 'yellow');
    log('Press Ctrl+C to abort, or wait 3 seconds to continue...', 'yellow');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Cancel all ongoing rides
    log('\n▶ Cancelling ongoing rides...', 'yellow');
    
    const result = await Ride.updateMany(
      { status: { $in: ongoingStatuses } },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Cleared by admin - System cleanup',
          endTime: new Date()
        }
      }
    );

    log(`✓ Cancelled ${result.modifiedCount} rides`, 'green');

    // Summary
    log('\n='.repeat(60), 'cyan');
    log('CLEANUP SUMMARY', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`Total Rides Found: ${ongoingRides.length}`, 'blue');
    log(`Rides Cancelled: ${result.modifiedCount}`, 'green');
    log('Status: Complete', 'green');
    log('='.repeat(60) + '\n', 'cyan');

    await mongoose.disconnect();
    log('✓ Database connection closed\n', 'green');

  } catch (error) {
    log('\n✗ Error:', 'red');
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Additional option: Clear rides for specific rider
async function clearRidesForRider(riderEmail) {
  try {
    log('\n='.repeat(60), 'cyan');
    log(`CLEAR RIDES FOR RIDER: ${riderEmail}`, 'cyan');
    log('='.repeat(60), 'cyan');

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tapaxi');
    log('✓ Connected to database', 'green');

    // Find rider
    const user = await User.findOne({ email: riderEmail, role: 'rider' });
    if (!user) {
      log('✗ Rider not found', 'red');
      await mongoose.disconnect();
      return;
    }

    log(`✓ Found rider: ${user.fullName}`, 'green');

    // Find and cancel ongoing rides
    const ongoingStatuses = ['requested', 'searching', 'assigned', 'accepted', 'in_progress', 'scheduled'];
    
    const result = await Ride.updateMany(
      { 
        rider: user._id,
        status: { $in: ongoingStatuses }
      },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Cleared by rider - Manual cleanup',
          endTime: new Date()
        }
      }
    );

    log(`✓ Cancelled ${result.modifiedCount} rides for ${user.fullName}`, 'green');

    await mongoose.disconnect();
    log('✓ Cleanup complete\n', 'green');

  } catch (error) {
    log('\n✗ Error:', 'red');
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the appropriate function based on command line arguments
const args = process.argv.slice(2);

if (args.length > 0 && args[0] === '--rider') {
  const riderEmail = args[1];
  if (!riderEmail) {
    log('Usage: node utils/clearOngoingRides.js --rider <rider_email>', 'red');
    process.exit(1);
  }
  clearRidesForRider(riderEmail);
} else {
  clearOngoingRides();
}
