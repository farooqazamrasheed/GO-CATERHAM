require("dotenv").config();
const app = require("./app");
const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const socketService = require("./services/socketService");

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with proper configuration for stable connections
const io = socketIo(server, {
  cors: {
    origin: "*", // Configure this for production
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
  // Ping/Pong settings to keep connections alive
  pingTimeout: 60000,      // How long to wait for pong response (60 seconds)
  pingInterval: 25000,     // How often to send ping (25 seconds)
  // Connection settings
  transports: ["websocket", "polling"], // Prefer WebSocket, fallback to polling
  allowUpgrades: true,
  // Reconnection is handled client-side, but we set reasonable timeouts
  connectTimeout: 45000,
});

// Initialize socket service
socketService.initialize(io);
console.log("\n" + "=".repeat(60));
console.log("🚀 [WEBSOCKET SERVER INITIALIZED]");
console.log("   Ping Interval: 25 seconds");
console.log("   Ping Timeout: 60 seconds");
console.log("   Transports: websocket, polling");
console.log("=".repeat(60) + "\n");

// Make io accessible in routes/controllers
app.set("io", io);

// Socket.io connection handling is now managed by socketService

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
