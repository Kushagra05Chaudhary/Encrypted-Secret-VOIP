const {
    getRooms,
    getRoom,
    addParticipant,
    removeParticipant,
    removeParticipantBySocket,
    getParticipants
} = require('../routes/rooms');
const User = require('../models/User');

/**
 * Initialize Socket.io signaling for WebRTC
 * Optimized for handling multiple rooms simultaneously
 */
const initializeSignaling = (io) => {
    // Track connected users with their metadata
    const connectedUsers = new Map();

    // Rate limiting for security events
    const rateLimits = new Map();
    const RATE_LIMIT_WINDOW = 1000; // 1 second
    const RATE_LIMIT_MAX = 50; // Max events per window

    /**
     * Check rate limit for a socket
     */
    const checkRateLimit = (socketId) => {
        const now = Date.now();
        const limit = rateLimits.get(socketId) || { count: 0, windowStart: now };

        if (now - limit.windowStart > RATE_LIMIT_WINDOW) {
            // Reset window
            limit.count = 1;
            limit.windowStart = now;
        } else {
            limit.count++;
        }

        rateLimits.set(socketId, limit);
        return limit.count <= RATE_LIMIT_MAX;
    };

    /**
     * Log with room context
     */
    const logRoom = (roomId, message) => {
        console.log(`[Room:${roomId?.substring(0, 8)}] ${message}`);
    };

    io.on('connection', (socket) => {
        console.log(`[Socket] Connected: ${socket.id}`);

        // Handle user authentication
        socket.on('authenticate', async (userData) => {
            try {
                // Fetch user's public key from database
                const user = await User.findById(userData.userId).select('publicKey');

                const userInfo = {
                    id: userData.userId,
                    username: userData.username,
                    socketId: socket.id,
                    publicKey: user?.publicKey || null,
                    connectedAt: new Date(),
                    currentRoom: null
                };

                connectedUsers.set(socket.id, userInfo);
                console.log(`[Auth] User authenticated: ${userData.username}`);

                // Send confirmation
                socket.emit('authenticated', { success: true });
            } catch (error) {
                console.error('[Auth] Authentication error:', error);
                socket.emit('authenticated', { success: false, error: 'Authentication failed' });
            }
        });

        // Handle joining a room
        socket.on('join-room', async ({ roomId, userId, username, publicKey }) => {
            if (!checkRateLimit(socket.id)) {
                socket.emit('error', { message: 'Rate limit exceeded' });
                return;
            }

            try {
                // Leave current room if in one
                const user = connectedUsers.get(socket.id);
                if (user?.currentRoom) {
                    await handleLeaveRoom(socket, user.currentRoom, userId, username);
                }

                // Join the Socket.io room
                socket.join(roomId);

                // Add participant to room manager
                const participant = {
                    id: userId,
                    username,
                    socketId: socket.id,
                    publicKey: publicKey || user?.publicKey || null
                };

                addParticipant(roomId, participant);

                // Update connected user's state
                if (user) {
                    user.currentRoom = roomId;
                    user.publicKey = publicKey || user.publicKey;
                    connectedUsers.set(socket.id, user);
                }

                // Get existing participants for the new user
                const existingParticipants = getParticipants(roomId)
                    .filter(p => p.socketId !== socket.id);

                // Send existing participants to new user
                socket.emit('room-participants', {
                    participants: existingParticipants.map(p => ({
                        id: p.id,
                        username: p.username,
                        socketId: p.socketId,
                        publicKey: p.publicKey
                    }))
                });

                // Notify others in the room
                socket.to(roomId).emit('user-joined', {
                    userId,
                    username,
                    socketId: socket.id,
                    publicKey: publicKey || null
                });

                logRoom(roomId, `${username} joined (${existingParticipants.length} others)`);
            } catch (error) {
                console.error('[Join] Error joining room:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // Handle leaving a room
        socket.on('leave-room', ({ roomId, userId, username }) => {
            handleLeaveRoom(socket, roomId, userId, username);
        });

        /**
         * Handle leave room logic (reusable)
         */
        const handleLeaveRoom = (socket, roomId, userId, username) => {
            socket.leave(roomId);
            removeParticipant(roomId, userId);

            const user = connectedUsers.get(socket.id);
            if (user) {
                user.currentRoom = null;
                connectedUsers.set(socket.id, user);
            }

            socket.to(roomId).emit('user-left', {
                userId,
                username,
                socketId: socket.id
            });

            logRoom(roomId, `${username} left`);
        };

        // Handle WebRTC offer
        socket.on('offer', ({ roomId, targetSocketId, offer, from }) => {
            if (!checkRateLimit(socket.id)) return;

            const user = connectedUsers.get(socket.id);
            socket.to(targetSocketId).emit('offer', {
                offer,
                from: socket.id,
                fromUser: {
                    ...from,
                    publicKey: user?.publicKey || null
                }
            });

            logRoom(roomId, `Offer: ${socket.id.substring(0, 6)} -> ${targetSocketId.substring(0, 6)}`);
        });

        // Handle WebRTC answer
        socket.on('answer', ({ roomId, targetSocketId, answer, from }) => {
            if (!checkRateLimit(socket.id)) return;

            const user = connectedUsers.get(socket.id);
            socket.to(targetSocketId).emit('answer', {
                answer,
                from: socket.id,
                fromUser: {
                    ...from,
                    publicKey: user?.publicKey || null
                }
            });

            logRoom(roomId, `Answer: ${socket.id.substring(0, 6)} -> ${targetSocketId.substring(0, 6)}`);
        });

        // Handle ICE candidates
        socket.on('ice-candidate', ({ roomId, targetSocketId, candidate }) => {
            if (!checkRateLimit(socket.id)) return;

            socket.to(targetSocketId).emit('ice-candidate', {
                candidate,
                from: socket.id
            });
        });

        // Handle AES Session Key exchange
        socket.on('session-key', ({ roomId, targetSocketId, encryptedSessionKey }) => {
            if (!checkRateLimit(socket.id)) return;

            console.log(`[Signaling] Relaying session key from ${socket.id} to ${targetSocketId}`);

            socket.to(targetSocketId).emit('session-key', {
                encryptedSessionKey,
                from: socket.id
            });
        });

        // Handle mute status change
        socket.on('mute-status', ({ roomId, isMuted }) => {
            if (!checkRateLimit(socket.id)) return;

            socket.to(roomId).emit('peer-mute-status', {
                socketId: socket.id,
                isMuted
            });
        });

        // Handle calling a user
        socket.on('call-user', ({ targetUserId, roomId, roomName }) => {
            if (!checkRateLimit(socket.id)) return;

            // Find target user
            let targetSocketId = null;
            let targetUser = null;

            for (const [sId, u] of connectedUsers.entries()) {
                if (u.id === targetUserId) {
                    targetSocketId = sId;
                    targetUser = u;
                    break;
                }
            }

            const caller = connectedUsers.get(socket.id);

            if (targetSocketId) {
                console.log(`[Signaling] Call from ${caller?.username} to ${targetUser?.username}`);
                io.to(targetSocketId).emit('incoming-call', {
                    from: {
                        id: caller?.id,
                        username: caller?.username,
                        socketId: socket.id
                    },
                    roomId,
                    roomName
                });
            } else {
                // User offline
                socket.emit('call-error', { message: 'User is offline' });
            }
        });


        // Handle request for user's public key
        socket.on('get-public-key', async ({ targetUserId }, callback) => {
            try {
                const user = await User.findById(targetUserId).select('publicKey');
                callback({ publicKey: user?.publicKey || null });
            } catch (error) {
                console.error('[PublicKey] Error fetching public key:', error);
                callback({ publicKey: null, error: 'Failed to fetch public key' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            const user = connectedUsers.get(socket.id);

            if (user) {
                console.log(`[Socket] Disconnected: ${user.username} (${reason})`);

                // Remove from all rooms
                const removedFrom = removeParticipantBySocket(socket.id);

                for (const { roomId, participant } of removedFrom) {
                    socket.to(roomId).emit('user-left', {
                        userId: participant.id,
                        username: participant.username,
                        socketId: socket.id
                    });
                    logRoom(roomId, `${participant.username} disconnected`);
                }

                connectedUsers.delete(socket.id);
            } else {
                console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
            }

            // Clean up rate limits
            rateLimits.delete(socket.id);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`[Socket] Error for ${socket.id}:`, error);
        });
    });

    // Periodic cleanup of stale rate limit entries
    setInterval(() => {
        const now = Date.now();
        for (const [socketId, limit] of rateLimits) {
            if (now - limit.windowStart > RATE_LIMIT_WINDOW * 10) {
                rateLimits.delete(socketId);
            }
        }
    }, 60000); // Every minute

    console.log('[Signaling] Socket.io signaling initialized');
};

module.exports = initializeSignaling;
