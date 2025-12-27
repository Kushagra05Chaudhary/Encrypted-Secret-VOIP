const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/encrypted-voip';

        console.log('[MongoDB] Attempting to connect...');
        console.log('[MongoDB] URI:', mongoURI.replace(/\/\/.*@/, '//<credentials>@'));

        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
            socketTimeoutMS: 45000,
        });

        isConnected = true;
        console.log(`[MongoDB] Connected: ${conn.connection.host}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('[MongoDB] Connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('[MongoDB] Disconnected');
            isConnected = false;
        });

        mongoose.connection.on('reconnected', () => {
            console.log('[MongoDB] Reconnected');
            isConnected = true;
        });

    } catch (error) {
        console.error('[MongoDB] Connection failed:', error.message);
        console.error('[MongoDB] Make sure MongoDB is running locally or update MONGODB_URI in .env');
        console.error('[MongoDB] For local MongoDB: run "mongod" or start MongoDB service');
        console.error('[MongoDB] For MongoDB Atlas: update MONGODB_URI with your connection string');

        // Don't exit, allow server to start without DB for debugging
        isConnected = false;
    }
};

const isDBConnected = () => isConnected;

module.exports = {
    connectDB,
    isDBConnected
};
