const app = require("./app");
const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const socketService = require("./services/socketService");
require("dotenv").config();

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*", // Configure this for production
    methods: ["GET", "POST"],
  },
});

// Initialize socket service
socketService.initialize(io);

// Make io accessible in routes/controllers
app.set("io", io);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join user-specific room
  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  // Handle ride-related events
  socket.on("ride_request", (data) => {
    // Handle ride request events
    console.log("Ride request event:", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

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
