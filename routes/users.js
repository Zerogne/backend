const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('firebase-admin');
const mongoose = require('mongoose');

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Email and password are required',
                error: 'MISSING_CREDENTIALS'
            });
        }

        // Try to sign in with Firebase
        try {
            const userCredential = await admin.auth().getUserByEmail(email);
            
            // Check if user exists in our database
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(404).json({ 
                    message: 'User not found. Please sign up first.',
                    error: 'USER_NOT_FOUND'
                });
            }

            // Return user data
            res.json({
                message: 'Login successful',
                user: {
                    uid: user.uid,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            console.error('Firebase auth error:', error);
            
            // Handle specific Firebase auth errors
            if (error.code === 'auth/user-not-found') {
                return res.status(404).json({ 
                    message: 'No account found with this email',
                    error: 'USER_NOT_FOUND'
                });
            } else if (error.code === 'auth/wrong-password') {
                return res.status(401).json({ 
                    message: 'Incorrect password',
                    error: 'INVALID_PASSWORD'
                });
            } else if (error.code === 'auth/invalid-email') {
                return res.status(400).json({ 
                    message: 'Invalid email format',
                    error: 'INVALID_EMAIL'
                });
            } else {
                return res.status(500).json({ 
                    message: 'Authentication failed',
                    error: 'AUTH_FAILED'
                });
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'An error occurred during login',
            error: 'SERVER_ERROR'
        });
    }
});

// Get all users
router.get('/', async (req, res) => {
    try {
        const users = await User.find({});
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get user by ID
router.get('/:userId', async (req, res) => {
    try {
        console.log('\n=== GET /api/users/:userId ===');
        console.log('Fetching user with ID:', req.params.userId);

        // Check database connection
        if (mongoose.connection.readyState !== 1) {
            console.error('Database connection not established. Current state:', mongoose.connection.readyState);
            return res.status(500).json({ 
                message: 'Database connection not established'
            });
        }

        const user = await User.findOne({ uid: req.params.userId });
        if (!user) {
            console.log('User not found with ID:', req.params.userId);
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('Found user:', JSON.stringify(user, null, 2));
        res.json({
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ 
            message: 'Failed to fetch user',
            error: error.message || 'Internal server error'
        });
    }
});

// Create new user
router.post('/', async (req, res) => {
    try {
        const { uid, firstName, lastName, email, role } = req.body;

        if (!uid || !email || !firstName || !lastName || !role) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingUser = await User.findOne({ uid });
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }

        const newUser = new User({
            uid,
            firstName,
            lastName,
            email,
            role
        });

        const savedUser = await newUser.save();
        res.status(201).json({ message: 'User created successfully', user: savedUser });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update user
router.put('/:userId', auth, async (req, res) => {
    try {
        console.log('\n=== PUT /api/users/:userId ===');
        console.log('Updating user with ID:', req.params.userId);
        console.log('Request body:', req.body);

        // Check database connection
        if (mongoose.connection.readyState !== 1) {
            console.error('Database connection not established. Current state:', mongoose.connection.readyState);
            return res.status(500).json({ 
                message: 'Database connection not established'
            });
        }

        // Verify user is updating their own profile
        if (req.user.uid !== req.params.userId) {
            console.log('Unauthorized: User trying to update another user\'s profile');
            return res.status(403).json({ message: 'Unauthorized to update this profile' });
        }

        const { firstName, lastName } = req.body;
        if (!firstName || !lastName) {
            return res.status(400).json({ message: 'First name and last name are required' });
        }

        const updatedUser = await User.findOneAndUpdate(
            { uid: req.params.userId },
            { 
                firstName: String(firstName),
                lastName: String(lastName),
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!updatedUser) {
            console.log('User not found with ID:', req.params.userId);
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('User updated successfully:', JSON.stringify(updatedUser, null, 2));
        res.json({
            message: 'Profile updated successfully',
            user: {
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                role: updatedUser.role
            }
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ 
            message: 'Failed to update profile',
            error: error.message || 'Internal server error'
        });
    }
});

module.exports = router; 