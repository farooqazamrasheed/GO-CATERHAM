const mongoose = require('mongoose');
const User = require('./models/User');
const Driver = require('./models/Driver');
const Rider = require('./models/Rider');
const Ride = require('./models/Ride');
const LiveLocation = require('./models/LiveLocation');
const Wallet = require('./models/Wallet');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

async function seedData() {
  try {
    // Clear existing data
    await User.deleteMany({});
    await Driver.deleteMany({});
    await Rider.deleteMany({});
    await Ride.deleteMany({});
    await LiveLocation.deleteMany({});
    await Wallet.deleteMany({});

    console.log('Cleared existing data');

    // Create driver user
    const driverUser = await User.create({
      username: 'testdriver',
      email: 'driver@test.com',
      password: 'password123',
      fullName: 'Test Driver',
      phone: '1234567890',
      role: 'driver'
    });

    // Create driver profile
    const driver = await Driver.create({
      user: driverUser._id,
      vehicle: 'Toyota Camry',
      vehicleModel: 'Camry',
      vehicleYear: 2020,
      vehicleColor: 'White',
      vehicleType: 'sedan',
      numberPlateOfVehicle: 'ABC123',
      licenseNumber: 'LIC123',
      status: 'online',
      isApproved: true,
      rating: 4.8
    });

    // Create driver wallet
    await Wallet.create({
      user: driverUser._id,
      balance: 100.00,
      currency: 'GBP'
    });

    // Create driver location
    await LiveLocation.create({
      driver: driver._id,
      latitude: 51.2437,
      longitude: -0.5895,
      heading: 0,
      speed: 0,
      timestamp: new Date()
    });

    console.log('Created test driver');

    // Create rider user
    const riderUser = await User.create({
      username: 'testrider',
      email: 'rider@test.com',
      password: 'password123',
      fullName: 'Test Rider',
      phone: '0987654321',
      role: 'rider'
    });

    // Create rider profile
    const rider = await Rider.create({
      user: riderUser._id,
      rating: 4.9
    });

    // Create rider wallet
    await Wallet.create({
      user: riderUser._id,
      balance: 50.00,
      currency: 'GBP'
    });

    console.log('Created test rider');

    // Create some completed rides
    const rides = [
      {
        rider: rider._id,
        driver: driver._id,
        pickup: {
          latitude: 51.2437,
          longitude: -0.5895,
          address: 'Guildford'
        },
        dropoff: {
          latitude: 51.2352,
          longitude: -0.5724,
          address: 'Woking'
        },
        fare: 15.00,
        driverEarnings: 12.00,
        status: 'completed',
        estimatedDistance: 5.2,
        actualDistance: 5.2,
        estimatedDuration: 15,
        actualDuration: 15,
        vehicleType: 'sedan',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000 + 20 * 60 * 1000)
      },
      {
        rider: rider._id,
        driver: driver._id,
        pickup: {
          latitude: 51.2352,
          longitude: -0.5724,
          address: 'Woking'
        },
        dropoff: {
          latitude: 51.2437,
          longitude: -0.5895,
          address: 'Guildford'
        },
        fare: 12.00,
        driverEarnings: 9.60,
        status: 'completed',
        estimatedDistance: 4.1,
        actualDistance: 4.1,
        estimatedDuration: 12,
        actualDuration: 12,
        vehicleType: 'sedan',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000)
      }
    ];

    await Ride.insertMany(rides);
    console.log('Created test rides');

    console.log('Seeding completed successfully!');
    console.log('Test accounts:');
    console.log('Driver: driver@test.com / password123');
    console.log('Rider: rider@test.com / password123');

  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    mongoose.connection.close();
  }
}

seedData();