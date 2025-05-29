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

// Configure CORS
const corsOptions = {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));

// Make sure to add express.json() middleware to parse JSON request bodies
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
    console.log('\n=== Incoming Request ===');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('URL:', req.url);
    console.log('Base URL:', req.baseUrl);
    console.log('Original URL:', req.originalUrl);
    console.log('Headers:', req.headers);
    console.log('Query:', req.query);
    console.log('Params:', req.params);
    next();
});

// Add route logging middleware
app.use((req, res, next) => {
    console.log('\n=== Route Registration Check ===');
    console.log('Available routes:');
    app._router.stack.forEach((r) => {
        if (r.route && r.route.path) {
            console.log(`${Object.keys(r.route.methods)} ${r.route.path}`);
        }
    });
    next();
});

// Register routes
console.log('\n=== Registering Routes ===');
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
console.log('Routes registered successfully');

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Add 404 handler - MUST be after all routes
app.use((req, res) => {
    console.log('404 Not Found:', req.originalUrl);
    res.status(404).json({
        message: 'Route not found',
        path: req.originalUrl
    });
});

// MongoDB connection URI
const uri = process.env.MONGODB_URI;

// Add connection state checking
const checkConnection = () => {
  if (mongoose.connection.readyState !== 1) {
    console.error('Database connection not established. Current state:', mongoose.connection.readyState);
    return false;
  }
  return true;
};

// Connect to MongoDB using Mongoose
mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    console.log('MongoDB URI:', uri);
    console.log('Using database:', mongoose.connection.db.databaseName);
    console.log('Connection state:', mongoose.connection.readyState);

    // Add connection error handler
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    // Add disconnection handler
    mongoose.connection.on('disconnected', () => {
      console.error('MongoDB disconnected');
    });

    // Add reconnection handler
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

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
    mongoose.connection.db.collection('schools').deleteMany({})
      .then(() => {
        console.log('Cleared existing schools');
        return mongoose.connection.db.collection('schools').insertMany(schools);
      })
      .then(() => {
        console.log('Successfully initialized schools collection');
      })
      .catch(error => {
        console.error('Error initializing schools:', error);
      });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Import the User model
const User = require('./models/User');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Add Firebase Admin initialization check
console.log('\n=== Firebase Admin Initialization ===');
console.log('Firebase Admin initialized:', admin.apps.length > 0);
console.log('Service account loaded:', !!serviceAccount);

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Test notification endpoint
app.post('/api/test-notification', auth, (req, res) => {
    const testNotification = new Notification({
        recipient: req.user.uid,
        sender: 'test-sender',
        type: 'upvote',
        postId: new mongoose.Types.ObjectId(req.body.postId),
        read: false
    });

    testNotification.save()
        .then(savedNotification => {
            console.log('Test notification saved:', savedNotification);
            return Notification.find({ recipient: req.user.uid });
        })
        .then(allNotifications => {
            res.json({
                message: 'Test notification created and verified',
                notifications: allNotifications
            });
        })
        .catch(error => {
            console.error('Error in test notification:', error);
            res.status(500).json({ message: error.message });
        });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});