const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

/**
 * Generate unique Personal Meeting Code (pmi-abc-def)
 */
const generatePMI = async () => {
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
        // Format: pmi-abc-def
        code = `pmi-${segment()}-${segment()}`;
        // Check DB for uniqueness
        const existing = await User.findOne({ personalJoinCode: code });
        if (!existing) {
            isUnique = true;
        }
        attempts++;
    }

    // Fallback if super unlucky
    if (!isUnique) {
        code = `pmi-${Date.now().toString(36).substr(-6)}`;
    }
    return code;
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
    try {
        console.log('[Auth] Registration attempt:', {
            username: req.body.username,
            email: req.body.email
        });

        const { username, email, password, publicKey } = req.body;

        // Validate required fields
        if (!username || !email || !password) {
            return res.status(400).json({
                message: 'Please provide username, email, and password'
            });
        }

        // Check if user exists
        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Generate PMI
        const personalJoinCode = await generatePMI();

        // Create user
        const user = await User.create({
            username,
            email,
            password,
            publicKey: publicKey || '',
            personalJoinCode
        });

        if (user) {
            console.log('[Auth] Registration successful:', user.username);
            res.status(201).json({
                _id: user._id,
                username: user.username,
                email: user.email,
                publicKey: user.publicKey,
                personalJoinCode: user.personalJoinCode,
                token: generateToken(user._id)
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('[Auth] Registration error:', error);

        if (error.code === 11000) {
            return res.status(400).json({ message: 'Username or email already exists' });
        }

        res.status(500).json({
            message: 'Server error during registration',
            error: error.message
        });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            console.log('[Auth] Login successful:', user.username);
            res.json({
                _id: user._id,
                username: user.username,
                email: user.email,
                publicKey: user.publicKey,
                personalJoinCode: user.personalJoinCode,
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('[Auth] Login error:', error.message);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        console.error('[Auth] Get profile error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/auth/publickey
// @desc    Update user's public key
// @access  Private
router.put('/publickey', protect, async (req, res) => {
    try {
        const { publicKey } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { publicKey },
            { new: true }
        ).select('-password');
        res.json(user);
    } catch (error) {
        console.error('[Auth] Update public key error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
