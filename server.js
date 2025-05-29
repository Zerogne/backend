const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const auth = require('./middleware/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const Notification = require('./models/notification');

const app = express();
const port = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log('\n=== Incoming Request ===');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('URL:', req.url);
  console.log('Original URL:', req.originalUrl);
  console.log('Query:', req.query);
  console.log('Params:', req.params);
  next();
});

// MongoDB connection
const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB successfully');
    console.log('Using database:', mongoose.connection.db.databaseName);

    mongoose.connection.on('error', err => console.error('MongoDB connection error:', err));
    mongoose.connection.on('disconnected', () => console.error('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

    // Initialize schools collection
    const schools = [
      {
        name: 'School No. 1',
        type: 'Public',
        location: 'Ulaanbaatar',
        description: 'One of the oldest and most prestigious public schools'
      },
      {
        name: 'School No. 2',
        type: 'Public',
        location: 'Ulaanbaatar',
        description: 'Known for strong academic programs'
      },
      {
        name: 'School No. 3',
        type: 'Public',
        location: 'Ulaanbaatar',
        description: 'Focus on science and mathematics'
      },
      {
        name: 'School No. 4',
        type: 'Public',
        location: 'Ulaanbaatar',
        description: 'Comprehensive education programs'
      },
      {
        name: 'School No. 5',
        type: 'Public',
        location: 'Ulaanbaatar',
        description: 'Modern facilities and diverse programs'
      },
      {
        name: 'Amjilt Cyber',
        type: 'Private',
        location: 'Ulaanbaatar',
        description: 'Specialized in technology and computer science'
      },
      {
        name: 'Tsonjin Boarding',
        type: 'Private',
        location: 'Ulaanbaatar',
        description: 'Boarding school with comprehensive education'
      }
    ];

    // Clear existing schools and insert new ones
    try {
      await mongoose.connection.db.collection('schools').deleteMany({});
      console.log('Cleared existing schools');
      
      if (schools.length > 0) {
        await mongoose.connection.db.collection('schools').insertMany(schools);
        console.log('Successfully initialized schools collection');
      } else {
        console.log('No schools to initialize');
      }
    } catch (error) {
      console.error('Error initializing schools:', error);
      // Don't throw the error, just log it and continue
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err?.stack || err?.message || err);
    process.exit(1);
  });

// Register routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/notifications', notificationRoutes);

// Global error handler
app.use((err, req, res, next) => {
  // Safely log the error
  console.error(err?.stack || err?.message || err);

  const status = err?.status || 500;
  const message = err instanceof Error ? err.message : String(err || 'Internal server error');

  res.status(status).json({
    message: 'Internal server error',
    error: {
      name:    err?.name    || 'UnknownError',
      message: message,
      stack:   err?.stack   || 'No stack trace'
    }
  });
});

// 404 handler (after all routes)
app.use((req, res) => {
  console.log('404 Not Found:', req.originalUrl);
  res.status(404).json({ message: 'Route not found', path: req.originalUrl });
});

// Firebase Admin init
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('Firebase Admin initialized:', admin.apps.length > 0);

// Test endpoints\app.get('/api/test', (req, res) => res.json({ message: 'Server is working!' }));
app.post('/api/test-notification', auth, async (req, res) => {
  try {
    const notif = new Notification({
      recipient: req.user.uid,
      sender: 'test-sender',
      type: 'upvote',
      postId: new mongoose.Types.ObjectId(req.body.postId),
      read: false
    });
    await notif.save();
    const allNotifs = await Notification.find({ recipient: req.user.uid });
    res.json({ message: 'Notification saved', notifications: allNotifs });
  } catch (err) {
    console.error('Error in test notification:', err?.stack || err?.message || err);
    res.status(500).json({ message: err?.message || 'Internal server error' });
  }
});

// Start server
app.listen(port, () => console.log(`Server running on port ${port}`));
