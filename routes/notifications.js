const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Basic test route
router.get('/test', (req, res) => {
    res.json({ message: 'Notifications route is working' });
});

// Get notifications for the current user
router.get('/', auth, async (req, res) => {
    try {
        console.log('\n=== GET /api/notifications ===');
        console.log('Fetching notifications for user:', req.user.uid);

        // Check database connection
        if (mongoose.connection.readyState !== 1) {
            console.error('Database connection not established. Current state:', mongoose.connection.readyState);
            return res.status(500).json({ 
                message: 'Database connection not established'
            });
        }

        const notifications = await Notification.find({ recipient: req.user.uid })
            .sort({ createdAt: -1 });

        console.log('Found notifications:', notifications.length);
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ 
            message: 'Failed to fetch notifications',
            error: error.message || 'Internal server error'
        });
    }
});

// Mark all as read for the current user
router.put('/mark-all-read', auth, (req, res) => {
    Notification.updateMany(
        { recipient: req.user.uid, read: false },
        { $set: { read: true } }
    )
    .then(() => res.json({ message: 'All notifications marked as read' }))
    .catch(error => {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ message: error.message });
    });
});

// Mark single as read
router.put('/:id/read', auth, (req, res) => {
    Notification.findOneAndUpdate(
        { _id: req.params.id, recipient: req.user.uid },
        { $set: { read: true } },
        { new: true }
    )
    .then(notification => {
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ message: 'Notification marked as read', notification });
    })
    .catch(error => {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: error.message });
    });
});

module.exports = router; 