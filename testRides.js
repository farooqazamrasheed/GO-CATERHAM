const axios = require("axios");

const BASE_URL = "http://localhost:5000/api/v1";

// Sample credentials
const ADMIN_CREDENTIALS = {
  identifier: "admin@example.com",
  password: "password123",
  role: "admin",
};

const RIDER_CREDENTIALS = {
  identifier: "rider@example.com",
  password: "password123",
  role: "rider",
};

const DRIVER_CREDENTIALS = {
  identifier: "driver@example.com",
  password: "password123",
  role: "driver",
};

let riderToken = "";
let driverToken = "";
let adminToken = "";

async function signup(data) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/signup`, data);
    return response.data.data;
  } catch (error) {
    console.error("Signup failed:", error.response?.data || error.message);
    throw error;
  }
}

async function login(credentials) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, credentials);
    return response.data.data.token;
  } catch (error) {
    console.error("Login failed:", error.response?.data || error.message);
    throw error;
  }
}

async function setDriverOnline() {
  try {
    await axios.put(
      `${BASE_URL}/drivers/status`,
      { status: "online" },
      {
        headers: { Authorization: `Bearer ${driverToken}` },
      }
    );
    console.log("Driver set to online");
  } catch (error) {
    console.error(
      "Set driver online failed:",
      error.response?.data || error.message
    );
  }
}

async function performRide(rideNumber) {
  console.log(`\n--- Performing Ride ${rideNumber} ---`);
  try {
    // Rider gets fare estimate
    const estimateResponse = await axios.post(
      `${BASE_URL}/rides/estimate`,
      {
        pickupLat: 51.2362,
        pickupLng: -0.5704,
        pickupAddress: "Guildford, Surrey",
        dropoffLat: 51.3188,
        dropoffLng: -0.5569,
        dropoffAddress: "Woking Station, Surrey",
        vehicleType: "sedan",
      },
      {
        headers: { Authorization: `Bearer ${riderToken}` },
      }
    );
    const estimateId = estimateResponse.data.data.estimateId;
    console.log(`Ride ${rideNumber}: Estimate obtained, ID: ${estimateId}`);

    // Rider books ride
    const bookResponse = await axios.post(
      `${BASE_URL}/rides/book`,
      {
        estimateId,
        paymentMethod: "wallet",
        scheduledTime: null,
      },
      {
        headers: { Authorization: `Bearer ${riderToken}` },
      }
    );
    const rideId = bookResponse.data.data.rideId;
    console.log(`Ride ${rideNumber}: Ride booked, ID: ${rideId}`);

    // Wait a bit for driver to accept
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Driver accepts ride
    await axios.put(
      `${BASE_URL}/rides/${rideId}/accept`,
      {},
      {
        headers: { Authorization: `Bearer ${driverToken}` },
      }
    );
    console.log(`Ride ${rideNumber}: Driver accepted ride`);

    // Driver starts ride
    await axios.put(
      `${BASE_URL}/rides/${rideId}/start`,
      {},
      {
        headers: { Authorization: `Bearer ${driverToken}` },
      }
    );
    console.log(`Ride ${rideNumber}: Ride started`);

    // Driver completes ride
    await axios.put(
      `${BASE_URL}/rides/${rideId}/complete`,
      {
        actualDistance: 12.5,
        actualDuration: 25,
      },
      {
        headers: { Authorization: `Bearer ${driverToken}` },
      }
    );
    console.log(`Ride ${rideNumber}: Ride completed`);

    // Check payment status
    const rideStatus = await axios.get(`${BASE_URL}/rides/${rideId}/status`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    console.log(
      `Ride ${rideNumber}: Payment status - ${rideStatus.data.data.paymentStatus}`
    );
    console.log(`Ride ${rideNumber}: Completed successfully`);
  } catch (error) {
    console.error(
      `Ride ${rideNumber} failed:`,
      error.response?.data || error.message
    );
  }
}

async function main() {
  try {
    console.log("Starting ride testing...");
    // Signup admin
    const adminData = {
      fullName: "Test Admin",
      email: "admin@example.com",
      phone: "07111222333",
      password: "password123",
      confirmPassword: "password123",
      role: "admin",
    };
    await signup(adminData);
    adminToken = await login(ADMIN_CREDENTIALS);
    console.log("Admin logged in");

    // Signup rider
    const riderData = {
      fullName: "Test Rider",
      email: "rider@example.com",
      phone: "07123456789",
      password: "password123",
      confirmPassword: "password123",
      role: "rider",
    };
    const rider = await signup(riderData);

    // Signup driver
    const driverData = {
      fullName: "Test Driver",
      email: "driver@example.com",
      phone: "07987654321",
      password: "password123",
      confirmPassword: "password123",
      role: "driver",
      vehicle: "Toyota Corolla",
      numberPlateOfVehicle: "ABC123",
      licenseNumber: "LIC123456",
      vehicleModel: "Corolla",
      vehicleYear: 2020,
      vehicleColor: "White",
      vehicleType: "sedan",
    };
    const driver = await signup(driverData);

    // Approve driver
    await axios.put(
      `${BASE_URL}/admin/drivers/${driver.profile.driverId}/approve`,
      {},
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    console.log("Driver approved");

    // Login rider
    riderToken = await login(RIDER_CREDENTIALS);
    console.log("Rider logged in");

    // Top up rider wallet
    await axios.post(
      `${BASE_URL}/wallet/topup`,
      { amount: 100 },
      {
        headers: { Authorization: `Bearer ${riderToken}` },
      }
    );
    console.log("Rider wallet topped up");

    // Login driver
    driverToken = await login(DRIVER_CREDENTIALS);
    console.log("Driver logged in");

    // Set driver online
    await setDriverOnline();

    // Perform 3 rides
    for (let i = 1; i <= 3; i++) {
      await performRide(i);
      // Wait between rides
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("\nAll rides completed. Testing finished.");
  } catch (error) {
    console.error("Testing failed:", error.message);
  }
}

main();
