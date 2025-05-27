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

// Enable CORS for the frontend origin
const corsOptions = {
  origin: 'http://localhost:5173',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

// Make sure to add express.json() middleware to parse JSON request bodies
app.use(express.json());

// MongoDB connection URI
const uri = process.env.MONGODB_URI;

// Connect to MongoDB using Mongoose
mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    console.log('MongoDB URI:', uri);
    console.log('Using database:', mongoose.connection.db.databaseName);
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
    console.error('Connection URI:', uri);
  });

// Import the User model
const User = require('./models/User');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Register routes
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);

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

// Add a test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Define a POST endpoint for creating posts
app.post('/api/posts', async (req, res) => {
  try {
    // Check MongoDB connection
    if (!mongoose.connection.readyState) {
      console.error('MongoDB not connected');
      return res.status(500).json({ message: 'Database connection not established' });
    }

    console.log('\n=== POST /api/posts ===');
    console.log('Request headers:', req.headers);
    console.log('Raw request body:', req.body);
    console.log('Content-Type:', req.get('Content-Type'));

    // Get the post data from the request body
    const postData = {
      userId: req.body.userId, // Get userId from request body
      schoolName: String(req.body.schoolName || ''),
      title: String(req.body.title || ''),
      feedback: String(req.body.feedback || ''),
      rating: Number(req.body.rating || 0),
      postAnonymously: Boolean(req.body.postAnonymously),
      upvotes: 0, // Initialize upvotes
      comments: [], // Initialize comments array
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Validate required fields
    if (!postData.userId || !postData.schoolName || !postData.title || !postData.feedback || !postData.rating) {
      console.log('Missing required fields:', postData);
      return res.status(400).json({ 
        message: 'Missing required fields. User ID, school name, title, feedback, and rating are required.',
        receivedData: postData
      });
    }

    console.log('Attempting to insert post with data:', JSON.stringify(postData, null, 2));

    // Insert the data into the collection
    const result = await mongoose.connection.db.collection('posts').insertOne(postData);
    console.log('Insert result:', result);

    // Verify the insert by reading the document back
    const insertedPost = await mongoose.connection.db.collection('posts').findOne({ _id: result.insertedId });
    console.log('Verified inserted post:', JSON.stringify(insertedPost, null, 2));

    // Send a success response
    res.status(201).json({ 
      message: 'Post created successfully', 
      postId: result.insertedId,
      post: postData
    });

  } catch (error) {
    console.error('\n=== ERROR in POST /api/posts ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body was:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      message: 'Failed to create post',
      error: error.message,
      receivedData: req.body
    });
  }
});

// Add a PUT endpoint to update posts
app.put('/api/posts/:id', async (req, res) => {
  try {
    if (!mongoose.connection.readyState) {
      console.error('MongoDB not connected');
      return res.status(500).json({ message: 'Database connection not established' });
    }

    const postId = req.params.id;
    const updateData = req.body;
    console.log('DEBUG - Raw req.body in PUT /api/posts/:id:', req.body);
    console.log(`\n=== PUT /api/posts/${postId} ===`);
    console.log('Update data:', JSON.stringify(updateData, null, 2));

    // Handle different types of updates
    let updates = {};
    
    if (updateData.type === 'upvote') {
      try {
        console.log('\n=== Processing Upvote ===');
        console.log('Post ID:', postId);
        console.log('Update Data:', JSON.stringify(updateData, null, 2));

        
        if (!updateData.userId) {
          console.log('Error: User ID is missing');
          return res.status(400).json({ message: 'User ID is required' });
        }

        let postIdObj;
        try {
          postIdObj = new mongoose.Types.ObjectId(postId);
        } catch (error) {
          console.log('Error: Invalid post ID format');
          return res.status(400).json({ message: 'Invalid post ID format' });
        }

        // First check if the post exists
        const post = await mongoose.connection.db.collection('posts').findOne(
          { _id: postIdObj }
        );
        
        if (!post) {
          console.log('Error: Post not found:', postId);
          return res.status(404).json({ message: 'Post not found' });
        }

        console.log('Found post:', JSON.stringify(post, null, 2));

        // Initialize upvotedBy array if it doesn't exist
        if (!post.upvotedBy) {
          console.log('Initializing upvotedBy array');
          await mongoose.connection.db.collection('posts').updateOne(
            { _id: postIdObj },
            { $set: { upvotedBy: [] } }
          );
          post.upvotedBy = [];
        }

        // Check if user has already upvoted
        const hasUpvoted = post.upvotedBy?.includes(updateData.userId);
        console.log('Has upvoted:', hasUpvoted);
        console.log('Current upvotes:', post.upvotes);
        console.log('Current upvotedBy:', post.upvotedBy);

        let newUpvotes = post.upvotes || 0;
        let newUpvotedBy;

        if (hasUpvoted) {
          // Remove upvote
          newUpvotes = Math.max(0, newUpvotes - 1);
          newUpvotedBy = post.upvotedBy.filter(id => id !== updateData.userId);
          console.log('Removing upvote, new count:', newUpvotes);
        } else {
          // Add upvote
          newUpvotes++;
          newUpvotedBy = [...(post.upvotedBy || []), updateData.userId];
          console.log('Adding upvote, new count:', newUpvotes);

          // Create notification for upvote
          try {
            console.log('Attempting to create upvote notification...');
            const notificationData = {
              recipient: post.userId,
              sender: updateData.userId,
              type: 'upvote',
              postId: postIdObj,
              read: false
            };
            console.log('Upvote notification data:', notificationData);

            // Don't create notification if user is upvoting their own post
            if (post.userId === updateData.userId) {
              console.log('Skipping notification - user is upvoting their own post');
            } else {
              console.log('Recipient is not sender, proceeding with notification creation.');
              const notification = new Notification(notificationData);
              console.log('Upvote notification object before save:', notification);
              const savedNotification = await notification.save();
              console.log('Successfully created upvote notification:', savedNotification);
            }
          } catch (error) {
            console.error('Error creating upvote notification:', error);
            // Log more error details
            console.error('Upvote notification error details:', error.message, error.stack);
          }
        }

        // Update the post
        const result = await mongoose.connection.db.collection('posts').updateOne(
          { _id: postIdObj },
          { 
            $set: {
              upvotes: newUpvotes,
              upvotedBy: newUpvotedBy
            }
          }
        );

        console.log('Update result:', result);

        if (result.matchedCount === 0) {
          console.log('Error: No post found to update');
          return res.status(404).json({ message: 'Post not found' });
        }

        if (result.modifiedCount === 0) {
          console.log('Error: No changes made to post');
          return res.status(400).json({ message: 'Failed to update upvotes' });
        }

        // Verify the update
        const updatedPost = await mongoose.connection.db.collection('posts').findOne(
          { _id: postIdObj }
        );

        console.log('Updated post:', JSON.stringify(updatedPost, null, 2));

        return res.json({ 
          message: hasUpvoted ? 'Upvote removed' : 'Post upvoted successfully',
          upvotes: newUpvotes,
          hasUpvoted: !hasUpvoted,
          upvotedBy: newUpvotedBy
        });

      } catch (error) {
        console.error('\n=== Error in Upvote Operation ===');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({ 
          message: 'Failed to update post',
          error: error.message
        });
      }
    } else if (updateData.type === 'comment') {
      console.log('Processing comment update with data:', updateData);
      console.log('DEBUG - Received updateData in comment block:', updateData);
      console.log('DEBUG - About to validate commentText. Value:', updateData.commentText);
      console.log('DEBUG - Type of updateData.commentText:', typeof updateData.commentText);
      console.log('DEBUG - updateData object before validation:', updateData);
      
      try {
        // Create the comment object
        const comment = {
          _id: new mongoose.Types.ObjectId(),
          userId: updateData.userId,
          text: String(updateData.commentText).trim(), // Use commentText from request
          createdAt: new Date()
        };
        
        console.log('DEBUG - Creating comment with data:', {
          comment,
          originalText: updateData.commentText,
          trimmedText: String(updateData.commentText).trim()
        });

        // Validate comment data
        if (!updateData.commentText || !updateData.userId) {
          console.log('DEBUG - Validation failed. This block was hit.');
          console.error('Missing required comment data:', updateData);
          return res.status(400).json({ 
            message: 'Comment text and user ID are required',
            receivedData: updateData
          });
        }

        // Update the post with the new comment
        const result = await mongoose.connection.db.collection('posts').updateOne(
          { _id: new ObjectId(postId) },
          { $push: { comments: comment } }
        );

        if (result.matchedCount === 0) {
          console.error('Post not found for comment:', postId);
          return res.status(404).json({ message: 'Post not found' });
        }

        if (result.modifiedCount === 0) {
          console.error('Failed to add comment to post:', postId);
          return res.status(500).json({ message: 'Failed to add comment' });
        }

        // Fetch the updated post to get the new comment
        const updatedPost = await mongoose.connection.db.collection('posts').findOne(
          { _id: new ObjectId(postId) }
        );

        // Get the last comment (the one we just added)
        const newComment = updatedPost.comments[updatedPost.comments.length - 1];
        console.log('DEBUG - Saved comment in database:', newComment);

        // Create notification for comment
        try {
          console.log('Attempting to create comment notification...');
          const post = await mongoose.connection.db.collection('posts').findOne(
            { _id: new ObjectId(postId) }
          );
          
          if (post && post.userId !== updateData.userId) {
             const notificationData = {
              recipient: post.userId,
              sender: updateData.userId,
              type: 'comment',
              postId: new ObjectId(postId),
              read: false
            };
            console.log('Comment notification data:', notificationData);
            const notification = new Notification(notificationData);
            console.log('Comment notification object before save:', notification);
            await notification.save();
            console.log('Successfully created comment notification:', notification);
          } else if (!post) {
             console.log('Skipping comment notification - post not found');
          } else {
             console.log('Skipping comment notification - user commented on their own post');
          }
        } catch (error) {
          console.error('Error creating comment notification:', error);
           // Log more error details
          console.error('Comment notification error details:', error.message, error.stack);
        }

        return res.json({ 
          message: 'Comment added successfully', 
          comment: newComment 
        });

      } catch (error) {
        console.error('Error processing comment:', error);
        return res.status(500).json({ 
          message: 'Failed to process comment',
          error: error.message 
        });
      }
    } else {
      // Regular post update
      if (!updateData.schoolName || !updateData.title || !updateData.feedback || !updateData.rating) {
        console.log('Missing required fields in update data:', {
          schoolName: updateData.schoolName,
          title: updateData.title,
          feedback: updateData.feedback,
          rating: updateData.rating
        });
        return res.status(400).json({ 
          message: 'Missing required fields. School name, title, feedback, and rating are required.',
          receivedData: updateData
        });
      }

      updates = {
        $set: {
          schoolName: String(updateData.schoolName),
          title: String(updateData.title),
          feedback: String(updateData.feedback),
          rating: Number(updateData.rating),
          postAnonymously: Boolean(updateData.postAnonymously),
          updatedAt: new Date()
        }
      };
    }

    if (updateData.type !== 'upvote') {
      console.log('Final updates object:', JSON.stringify(updates, null, 2));

      // Use ObjectId for querying by ID
      const { ObjectId } = require('mongodb');
      const result = await mongoose.connection.db.collection('posts').updateOne(
        { _id: new ObjectId(postId) },
        updates,
        { upsert: false }
      );

      if (result.matchedCount === 0) {
        console.log('No post found with ID:', postId);
        return res.status(404).json({ message: 'Post not found' });
      }

      // If it's a comment, return the new comment
      if (updateData.type === 'comment') {
        const updatedPost = await mongoose.connection.db.collection('posts').findOne(
          { _id: new ObjectId(postId) }
        );
        const newComment = updatedPost.comments[updatedPost.comments.length - 1];
        return res.json({ message: 'Comment added successfully', comment: newComment });
      }

      console.log('Update result:', result);
      res.json({ message: 'Post updated successfully' });
    }

  } catch (error) {
    console.error(`\n=== ERROR in PUT /api/posts/:id ===`);
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Failed to update post', error: error.message });
  }
});

// Add a GET endpoint to verify posts
app.get('/api/posts', async (req, res) => {
  try {
    console.log('\n=== GET /api/posts ===');
    console.log('MongoDB connection status:', mongoose.connection.readyState);
    
    const posts = await mongoose.connection.db.collection('posts').find({}).toArray();
    console.log('Retrieved posts:', JSON.stringify(posts, null, 2));
    res.json(posts);
  } catch (error) {
    console.error('Error retrieving posts:', error);
    res.status(500).json({ message: 'Failed to retrieve posts' });
  }
});

// Add a GET endpoint to fetch a single post
app.get('/api/posts/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    console.log('\n=== GET /api/posts/:id ===');
    console.log('Fetching post with ID:', postId);

    // Validate MongoDB connection
    if (!mongoose.connection.readyState) {
      console.error('MongoDB not connected');
      return res.status(500).json({ message: 'Database connection not established' });
    }

    let post;
    try {
      // Try to convert the ID to ObjectId
      const postIdObj = new mongoose.Types.ObjectId(postId);
      post = await mongoose.connection.db.collection('posts').findOne(
        { _id: postIdObj }
      );
    } catch (error) {
      console.log('Invalid ObjectId format:', error);
      return res.status(400).json({ 
        message: 'Invalid post ID format',
        error: error.message
      });
    }

    if (!post) {
      console.log('Post not found with ID:', postId);
      return res.status(404).json({ message: 'Post not found' });
    }

    console.log('Found post:', JSON.stringify(post, null, 2));
    res.json(post);

  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ 
      message: 'Failed to fetch post',
      error: error.message
    });
  }
});

// Define a POST endpoint for creating new users
app.post('/api/users', async (req, res) => {
  console.log('\n=== POST /api/users ===');
  console.log('Request body:', req.body);
  try {
    // Extract user details from request body
    const { uid, firstName, lastName, email, role } = req.body;

    // Validate required fields
    if (!uid || !email || !firstName || !lastName || !role) {
      console.log('Missing required fields for user creation');
      return res.status(400).json({ message: 'Missing required fields for user creation' });
    }

    // Check if user with this uid already exists
    const existingUser = await User.findOne({ uid });
    if (existingUser) {
      console.log('User with UID already exists:', uid);
      return res.status(409).json({ message: 'User with this UID already exists' });
    }

    // Create a new user document
    const newUser = new User({
      uid,
      firstName,
      lastName,
      email,
      role
    });

    // Save the user document to the database
    const savedUser = await newUser.save();
    console.log('User saved to database:', savedUser);

    // Verify the save by reading the document back
    const verifiedUser = await User.findOne({ uid });
    console.log('Verified saved user:', verifiedUser);

    // List all users in the database
    const allUsers = await User.find({});
    console.log('All users in database after save:', allUsers);

    // Send a success response
    res.status(201).json({ message: 'User created successfully', user: savedUser });

  } catch (error) {
    console.error('Error creating user:', error);
    // Log more details about the error
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    console.error('Request body that caused error:', req.body);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Add a GET endpoint to get user information
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('\n=== GET /api/users/:userId ===');
    console.log('Fetching user info for userId:', userId);
    
    // Log the MongoDB connection state
    console.log('MongoDB connection state:', mongoose.connection.readyState);
    
    // First, let's check if the user exists in the database
    const allUsers = await User.find({});
    console.log('All users in database:', allUsers);
    
    // Log the query we're about to make
    console.log('Query:', { uid: userId });
    
    const user = await User.findOne({ uid: userId });
    console.log('Found user:', user);
    
    if (!user) {
      console.log('User not found for userId:', userId);
      // Let's check if there are any users in the database
      const userCount = await User.countDocuments();
      console.log('Total users in database:', userCount);
      return res.status(404).json({ message: 'User not found' });
    }

    // Only send necessary user information
    const userInfo = {
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    };
    console.log('Sending user info:', userInfo);
    res.json(userInfo);
  } catch (error) {
    console.error('Error fetching user:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Failed to fetch user information' });
  }
});

// Add a test endpoint to list all users
app.get('/api/users', async (req, res) => {
  try {
    console.log('\n=== GET /api/users ===');
    console.log('Fetching all users');
    
    const users = await User.find({});
    console.log('Found users:', users);
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});