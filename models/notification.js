const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: String,
        required: true,
        ref: 'User'
    },
    sender: {
        type: String,
        required: true,
        ref: 'User'
    },
    type: {
        type: String,
        required: true,
        enum: ['upvote', 'comment', 'mention']
    },
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    read: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', notificationSchema); 