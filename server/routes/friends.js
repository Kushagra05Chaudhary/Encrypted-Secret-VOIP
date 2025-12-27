const express = require('express');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Room = require('../models/Room');
const { roomManager } = require('./rooms'); // To check active rooms

const router = express.Router();

// @route   GET /api/friends
// @desc    Get friends list and pending requests
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('friends', 'username email _id publicKey')
            .populate('friendRequests.from', 'username _id');

        // Check active rooms for friends
        const friendsWithStatus = await Promise.all(user.friends.map(async (friend) => {
            // Check if friend is currently IN a room (either created or joined)
            // Note: RoomManager in-memory check is best for "Real-time" status

            // Search all active rooms in RoomManager
            let activeRoom = null;
            // Access activeRooms Map from roomManager instance
            for (const room of roomManager.activeRooms.values()) {
                if (room.participants.has(friend._id.toString())) {
                    const roomDetails = await roomManager.getRoom(room.id);
                    if (roomDetails) {
                        activeRoom = {
                            id: room.id,
                            name: roomDetails.name,
                            joinCode: roomDetails.joinCode
                        };
                    }
                    break;
                }
            }

            return {
                ...friend.toJSON(),
                activeRoom
            };
        }));

        res.json({
            friends: friendsWithStatus,
            friendRequests: user.friendRequests.filter(req => req.status === 'pending')
        });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/friends/request
// @desc    Send friend request by PMI
// @access  Private
router.post('/request', protect, async (req, res) => {
    try {
        const { pmi } = req.body;

        if (!pmi) {
            return res.status(400).json({ message: 'Personal Meeting ID is required' });
        }

        // Find user by Personal Meeting Code
        const recipient = await User.findOne({ personalJoinCode: pmi });

        if (!recipient) {
            return res.status(404).json({ message: 'User not found with this PMI' });
        }

        if (recipient._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'Cannot add yourself' });
        }

        // Check existing friendship
        if (recipient.friends.includes(req.user._id)) {
            return res.status(400).json({ message: 'Already friends' });
        }

        // Check pending request
        const existingReq = recipient.friendRequests.find(
            r => r.from.toString() === req.user._id.toString() && r.status === 'pending'
        );

        if (existingReq) {
            return res.status(400).json({ message: 'Request already sent' });
        }

        // Send request
        recipient.friendRequests.push({
            from: req.user._id,
            username: req.user.username,
            status: 'pending'
        });

        await recipient.save();
        res.json({ message: `Friend request sent to ${recipient.username}` });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/friends/respond
// @desc    Accept/Reject friend request
// @access  Private
router.post('/respond', protect, async (req, res) => {
    try {
        const { requestId, action } = req.body; // action: 'accept' or 'reject'
        const user = await User.findById(req.user._id);

        const request = user.friendRequests.id(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (action === 'accept') {
            // Add to both users' friend lists
            user.friends.push(request.from);
            await User.findByIdAndUpdate(request.from, {
                $addToSet: { friends: user._id }
            });

            request.status = 'accepted';
            // Also remove from pending requests list if we want to clean up, 
            // but keeping it as 'accepted' is fine or we can pull it.
            // Let's remove it from the array to keep document size small
            user.friendRequests.pull(requestId);
        } else {
            request.status = 'rejected';
            user.friendRequests.pull(requestId);
        }

        await user.save();
        res.json({ message: `Request ${action}ed` });
    } catch (error) {
        console.error('Respond friend request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
