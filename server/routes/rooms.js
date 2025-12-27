const express = require('express');
const { protect } = require('../middleware/auth');
const Room = require('../models/Room');

const router = express.Router();

/**
 * RoomManager - Hybrid state management
 * - MongoDB: Persistent storage for room existence, settings, and history
 * - In-Memory: Real-time tracking of active participants and signaling
 */
class RoomManager {
    constructor() {
        // Active rooms in memory (roomId -> roomData with active participants)
        this.activeRooms = new Map();

        // Map joinCode -> roomId (cache for fast lookup)
        this.codeCache = new Map();

        // Statistics
        this.stats = {
            peakConcurrentRooms: 0,
            peakConcurrentUsers: 0
        };
    }

    /**
     * Generate a unique join code (abc-def-ghi)
     */
    async generateUniqueJoinCode() {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const segment = () => {
            let s = '';
            for (let i = 0; i < 3; i++) {
                s += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return s;
        };

        let code;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            code = `${segment()}-${segment()}-${segment()}`;
            // Check DB for uniqueness
            const existing = await Room.findOne({ joinCode: code });
            if (!existing) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) throw new Error('Failed to generate unique join code');
        return code;
    }

    /**
     * Create a new room (Persistent)
     */
    async createRoom(name, createdBy, createdByUsername) {
        try {
            const joinCode = await this.generateUniqueJoinCode();

            const newRoom = await Room.create({
                name,
                joinCode,
                createdBy,
                createdByUsername,
                members: [createdBy] // Creator is first member
            });

            // Initialize in-memory state
            this.activateRoomInMemory(newRoom);

            console.log(`[RoomManager] Room created: ${name} (${newRoom._id}) Code: ${joinCode}`);
            return { room: this.serializeRoom(newRoom, this.getActiveParticipants(newRoom.id)) };
        } catch (error) {
            console.error('Create room error:', error);
            return { error: 'Failed to create room' };
        }
    }

    /**
     * Helper: Load room into memory if active
     */
    activateRoomInMemory(roomDoc) {
        const roomId = roomDoc._id.toString();
        if (!this.activeRooms.has(roomId)) {
            this.activeRooms.set(roomId, {
                id: roomId,
                participants: new Map(), // socketId -> participant
                lastActivity: new Date()
            });
            this.codeCache.set(roomDoc.joinCode, roomId);
        }
    }

    /**
     * Get active participants for a room
     */
    getActiveParticipants(roomId) {
        const activeRoom = this.activeRooms.get(roomId.toString());
        return activeRoom ? Array.from(activeRoom.participants.values()) : [];
    }

    /**
     * Get a room by ID (DB + Memory)
     */
    async getRoom(roomId) {
        try {
            let room = await Room.findById(roomId);
            if (!room) return null;

            // Ensure it's in memory if valid
            this.activateRoomInMemory(room);

            return this.serializeRoom(room, this.getActiveParticipants(roomId));
        } catch (err) {
            console.error('Get room error:', err);
            return null;
        }
    }

    /**
     * Get a room by Join Code (DB + Memory)
     */
    async getRoomByCode(joinCode) {
        try {
            // Check cache first
            if (this.codeCache.has(joinCode)) {
                const roomId = this.codeCache.get(joinCode);
                return this.getRoom(roomId);
            }

            // DB lookup
            const room = await Room.findOne({ joinCode });
            if (!room) return null;

            this.activateRoomInMemory(room);
            return this.serializeRoom(room, this.getActiveParticipants(room._id));
        } catch (err) {
            console.error('Get room by code error:', err);
            return null;
        }
    }

    /**
     * Get rooms history for user
     */
    async getUserRoomsList(userId) {
        try {
            // Find rooms created by user OR where user is a member
            const rooms = await Room.find({
                $or: [
                    { createdBy: userId },
                    { members: userId }
                ]
            }).sort({ lastActiveAt: -1 });

            // Combine with real-time participant counts
            return rooms.map(room =>
                this.serializeRoom(room, this.getActiveParticipants(room._id))
            );
        } catch (err) {
            console.error('Get user rooms error:', err);
            return [];
        }
    }

    /**
     * Add participant to room (Memory + DB History)
     */
    async addParticipant(roomId, participant) {
        // 1. Update In-Memory State (Synchronous-like for speed)
        let activeRoom = this.activeRooms.get(roomId);

        // Fallback: Try to fetch (this makes function async)
        if (!activeRoom) {
            const roomDoc = await Room.findById(roomId);
            if (!roomDoc) return null;
            this.activateRoomInMemory(roomDoc);
            activeRoom = this.activeRooms.get(roomId);
        }

        activeRoom.participants.set(participant.id, {
            ...participant,
            joinedAt: new Date()
        });
        activeRoom.lastActivity = new Date();

        // 2. Update DB History
        Room.findByIdAndUpdate(roomId, {
            $addToSet: { members: participant.id },
            lastActiveAt: new Date()
        }).catch(err => console.error('Failed to update room history:', err));

        this.updatePeakStats();
        console.log(`[RoomManager] ${participant.username} joined ${roomId}`);

        return {
            id: roomId,
            participants: Array.from(activeRoom.participants.values()),
            participantCount: activeRoom.participants.size
        };
    }

    /**
     * Remove participant from room (Memory only)
     */
    removeParticipant(roomId, participantId) {
        const activeRoom = this.activeRooms.get(roomId);
        if (!activeRoom) return null;

        const participant = activeRoom.participants.get(participantId);
        activeRoom.participants.delete(participantId);
        activeRoom.lastActivity = new Date();

        if (participant) {
            console.log(`[RoomManager] ${participant.username} left active session ${roomId}`);
        }

        return {
            id: roomId,
            participants: Array.from(activeRoom.participants.values()),
            participantCount: activeRoom.participants.size
        };
    }

    /**
     * Remove participant by socket ID
     */
    removeParticipantBySocket(socketId) {
        const results = [];

        for (const [roomId, room] of this.activeRooms) {
            for (const [participantId, participant] of room.participants) {
                if (participant.socketId === socketId) {
                    this.removeParticipant(roomId, participantId);
                    results.push({ roomId, participant });
                }
            }
        }

        return results;
    }

    /**
     * Get participants in a room
     */
    getParticipants(roomId) {
        const activeRoom = this.activeRooms.get(roomId);
        if (!activeRoom) return [];
        return Array.from(activeRoom.participants.values());
    }

    /**
     * Delete a room (DB + Memory)
     */
    async deleteRoom(roomId) {
        try {
            const room = await Room.findById(roomId);
            if (!room) return false;

            // Remove from memory
            this.activeRooms.delete(roomId);
            this.codeCache.delete(room.joinCode);

            // Remove from DB
            await Room.findByIdAndDelete(roomId);

            console.log(`[RoomManager] Room deleted: ${room.name}`);
            return true;
        } catch (err) {
            console.error('Delete room error:', err);
            return false;
        }
    }

    /**
     * Serialize room for API response
     */
    serializeRoom(roomDoc, activeParticipants = []) {
        return {
            id: roomDoc._id,
            name: roomDoc.name,
            joinCode: roomDoc.joinCode,
            createdBy: roomDoc.createdBy,
            createdByUsername: roomDoc.createdByUsername,
            participants: activeParticipants, // Only show ACTIVE participants
            createdAt: roomDoc.createdAt,
            lastActivity: roomDoc.lastActiveAt,
            participantCount: activeParticipants.length
        };
    }

    /**
     * Update peak statistics
     */
    updatePeakStats() {
        const currentRooms = this.activeRooms.size;
        // Calculate active users
        let currentUsers = 0;
        for (const room of this.activeRooms.values()) {
            currentUsers += room.participants.size;
        }

        if (currentRooms > this.stats.peakConcurrentRooms) {
            this.stats.peakConcurrentRooms = currentRooms;
        }
        if (currentUsers > this.stats.peakConcurrentUsers) {
            this.stats.peakConcurrentUsers = currentUsers;
        }
    }

    getStats() {
        let activeUsers = 0;
        for (const room of this.activeRooms.values()) {
            activeUsers += room.participants.size;
        }

        return {
            ...this.stats,
            activeRooms: this.activeRooms.size,
            activeUsers: activeUsers
        };
    }
}

// Create singleton instance
const roomManager = new RoomManager();

// @route   GET /api/rooms
// @desc    Get user's room history
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const rooms = await roomManager.getUserRoomsList(req.user._id);
        res.json(rooms);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/rooms
// @desc    Create a new room
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const { name, personal } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Room name is required' });
        }

        let customJoinCode = null;
        if (personal) {
            // Check if user has a personal room already
            const existingRoom = await Room.findOne({ joinCode: req.user.personalJoinCode });
            if (existingRoom) {
                // Return existing room if found
                return res.status(200).json(roomManager.serializeRoom(existingRoom, roomManager.getActiveParticipants(existingRoom._id)));
            }
            customJoinCode = req.user.personalJoinCode;
        }

        const result = await roomManager.createRoom(name, req.user._id, req.user.username, customJoinCode);

        if (result.error) {
            return res.status(400).json({ message: result.error });
        }

        res.status(201).json(result.room);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/rooms/join
// @desc    Join a room by code
// @access  Private
router.post('/join', protect, async (req, res) => {
    try {
        const { joinCode } = req.body;

        if (!joinCode) {
            return res.status(400).json({ message: 'Join code is required' });
        }

        const normalizedCode = joinCode.toLowerCase().trim();
        const room = await roomManager.getRoomByCode(normalizedCode);

        if (!room) {
            return res.status(404).json({ message: 'Room not found or code invalid' });
        }

        // Add user to room history
        await Room.findByIdAndUpdate(room.id, {
            $addToSet: { members: req.user._id },
            lastActiveAt: new Date()
        });

        res.json(room);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/rooms/stats
// @desc    Get room statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
    try {
        const stats = roomManager.getStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/rooms/:id
// @desc    Get room by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const room = await roomManager.getRoom(req.params.id);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        res.json(room);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE /api/rooms/:id
// @desc    Delete a room
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const room = await roomManager.getRoom(req.params.id);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Only creator can delete
        if (room.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this room' });
        }

        const success = await roomManager.deleteRoom(req.params.id);
        if (!success) {
            return res.status(404).json({ message: 'Room not found' });
        }
        res.json({ message: 'Room deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
module.exports.roomManager = roomManager;
module.exports.getRooms = () => Array.from(roomManager.activeRooms.values());
module.exports.getRoom = (id) => roomManager.getRoom(id);
module.exports.addParticipant = (roomId, participant) => roomManager.addParticipant(roomId, participant);
module.exports.removeParticipant = (roomId, participantId) => roomManager.removeParticipant(roomId, participantId);
module.exports.removeParticipantBySocket = (socketId) => roomManager.removeParticipantBySocket(socketId);
module.exports.getParticipants = (roomId) => roomManager.getParticipants(roomId);
module.exports.updateRoom = async (roomId, updates) => {
    await Room.findByIdAndUpdate(roomId, updates);
    return roomManager.getRoom(roomId);
};
