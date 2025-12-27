require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const initializeSignaling = require('./socket/signaling');

// Import routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const friendsRoutes = require('./routes/friends');

const app = express();
const server = http.createServer(app);

// CORS configuration - allow all origins for development/tunneling
const corsOptions = {
    origin: true, // Allow all origins (for Cloudflare tunnel, ngrok, etc.)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Initialize Socket.io
const io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket'], // Enforce WebSocket only (no polling)
    pingInterval: 25000,       // Optimize heartbeat for Cloudflare
    pingTimeout: 60000         // Extend timeout
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/friends', friendsRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    const { isDBConnected } = require('./config/db');
    res.json({
        status: 'ok',
        message: 'Encrypted VOIP Server is running',
        database: isDBConnected() ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.path} not found` });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err.stack);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Initialize Socket.io signaling
initializeSignaling(io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] API endpoints: http://localhost:${PORT}/api`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
    console.log(`[Socket.io] WebSocket server ready`);
    console.log('='.repeat(50));
});
