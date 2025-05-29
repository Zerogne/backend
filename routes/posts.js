const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Post = require('../models/post');

console.log('\n=== Registering Post Routes ===');

const checkDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error('Database connection not established. Current state:', mongoose.connection.readyState);
    return res.status(500).json({ message: 'Database connection not established' });
  }
  next();
};

router.use(checkDbConnection);

router.use((req, res, next) => {
  console.log('\n=== Post Route Request ===');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Original URL:', req.originalUrl);
  console.log('Params:', req.params);
  next();
});

const getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find({});
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPostById = async (req, res) => {
  try {
    const postId = req.params.id;
    console.log('\n=== GET /api/posts/:id ===');
    console.log('Fetching post with ID:', postId);

    let post;
    if (mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId);
    } else {
      post = await Post.findOne({ userId: postId });
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
      error: error.message || 'Internal server error',
    });
  }
};

const createPost = async (req, res) => {
  try {
    const postData = {
      userId: req.body.userId,
      schoolName: String(req.body.schoolName || ''),
      title: String(req.body.title || ''),
      feedback: String(req.body.feedback || ''),
      rating: Number(req.body.rating || 0),
      postAnonymously: Boolean(req.body.postAnonymously),
    };

    const post = new Post(postData);
    const savedPost = await post.save();

    res.status(201).json({
      message: 'Post created successfully',
      postId: savedPost._id,
      post: savedPost,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const updateData = req.body;

    if (updateData.type === 'upvote') {
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      const hasUpvoted = post.upvotedBy?.includes(updateData.userId);
      let newUpvotes = post.upvotes || 0;
      let newUpvotedBy;

      if (hasUpvoted) {
        newUpvotes = Math.max(0, newUpvotes - 1);
        newUpvotedBy = post.upvotedBy.filter(id => id !== updateData.userId);
      } else {
        newUpvotes++;
        newUpvotedBy = [...(post.upvotedBy || []), updateData.userId];
      }

      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          upvotes: newUpvotes,
          upvotedBy: newUpvotedBy,
        },
        { new: true }
      );

      res.json({
        message: hasUpvoted ? 'Upvote removed' : 'Post upvoted successfully',
        upvotes: updatedPost.upvotes,
        hasUpvoted: !hasUpvoted,
        upvotedBy: updatedPost.upvotedBy,
      });

    } else if (updateData.type === 'comment') {
      const comment = {
        id: new mongoose.Types.ObjectId(),
        userId: updateData.userId,
        text: updateData.text,
        createdAt: new Date(),
      };

      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $push: { comments: comment } },
        { new: true }
      );

      res.json({
        message: 'Comment added successfully',
        comment: updatedPost.comments.slice(-1)[0],
      });

    } else {
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      if (!req.user || post.userId !== req.user.uid) {
        return res.status(403).json({ message: 'Unauthorized to edit this post' });
      }

      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          schoolName: String(updateData.schoolName),
          title: String(updateData.title),
          feedback: String(updateData.feedback),
          rating: Number(updateData.rating),
          postAnonymously: Boolean(updateData.postAnonymously),
          updatedAt: new Date(),
        },
        { new: true }
      );

      res.json({ message: 'Post updated successfully', post: updatedPost });
    }
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ message: error.message });
  }
};

const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (!req.user || post.userId !== req.user.uid) {
      return res.status(403).json({ message: 'Unauthorized to delete this post' });
    }

    await Post.findByIdAndDelete(postId);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: error.message });
  }
};

const searchPosts = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i');
    const posts = await Post.find({
      $or: [
        { title: searchRegex },
        { schoolName: searchRegex },
        { feedback: searchRegex },
      ],
    });

    res.json(posts);
  } catch (error) {
    console.error('Error searching posts:', error);
    res.status(500).json({ message: error.message });
  }
};

const filterPostsBySchoolType = async (req, res) => {
  try {
    const { schoolType } = req.query;
    console.log('\n=== Filter Posts By School Type ===');
    console.log('School Type:', schoolType);
    
    if (!schoolType) {
      return res.status(400).json({ 
        message: 'School type is required'
      });
    }

    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ 
        message: 'Database connection not established'
      });
    }

    let query = {};
    if (schoolType !== 'All Schools') {
      const schools = await mongoose.connection.db.collection('schools')
        .find({ type: schoolType })
        .toArray();
      
      if (schools.length === 0) {
        return res.json([]);
      }

      const schoolNames = schools.map(school => school.name);
      query = { schoolName: { $in: schoolNames } };
    }

    const posts = await Post.find(query).sort({ createdAt: -1 });
    
    if (!Array.isArray(posts)) {
      return res.status(500).json({ 
        message: 'Invalid response from database'
      });
    }
    
    res.json(posts);
  } catch (error) {
    console.error('Error in filterPostsBySchoolType:', error?.message || error);
    res.status(500).json({ 
      message: error?.message || 'Failed to fetch filtered posts'
    });
  }
};

const getAllSchools = async (req, res) => {
  try {
    console.log('\n=== GET /api/posts/schools ===');

    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection not established' });
    }

    const schools = await mongoose.connection.db.collection('schools').find({}).toArray();
    if (!schools || schools.length === 0) {
      return res.json([]);
    }

    res.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({
      message: 'Failed to fetch schools',
      error: error.message || 'Internal server error',
    });
  }
};

const getSchoolRatings = async (req, res) => {
  try {
    const { schoolName } = req.params;
    console.log('\n=== GET /api/posts/school-ratings/:schoolName ===');
    console.log('School Name:', schoolName);
    console.log('Decoded School Name:', decodeURIComponent(schoolName));

    if (!schoolName) {
      console.log('No school name provided');
      return res.status(400).json({ message: 'School name is required' });
    }

    // Find all posts for this school
    const posts = await Post.find({ schoolName: decodeURIComponent(schoolName) });
    console.log(`Found ${posts.length} posts for school: ${schoolName}`);
    
    if (!posts || posts.length === 0) {
      console.log(`No posts found for school: ${schoolName}`);
      return res.json({
        averageRating: 0,
        totalReviews: 0
      });
    }

    // Calculate average rating
    const totalRating = posts.reduce((sum, post) => {
      console.log(`Post rating for ${schoolName}:`, post.rating);
      return sum + (post.rating || 0);
    }, 0);
    const averageRating = totalRating / posts.length;
    
    console.log(`Calculated ratings for ${schoolName}:`, {
      totalRating,
      averageRating,
      totalReviews: posts.length
    });

    res.json({
      averageRating: averageRating,
      totalReviews: posts.length
    });
  } catch (error) {
    console.error('Error fetching school ratings:', error);
    res.status(500).json({
      message: 'Failed to fetch school ratings',
      error: error.message || 'Internal server error'
    });
  }
};

const getUserPosts = async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('\n=== GET /api/posts/user/:userId ===');
    console.log('Fetching posts for user:', userId);

    const posts = await Post.find({
      userId: userId,
      postAnonymously: false,
    }).sort({ createdAt: -1 });

    res.json(posts);
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      message: 'Failed to fetch user posts',
      error: error.message,
    });
  }
};

// Register routes
router.get('/test', (req, res) => {
  res.json({ message: 'Test route working' });
});
router.get('/user/:userId', auth, getUserPosts);
router.get('/search', searchPosts);
router.get('/filter', filterPostsBySchoolType);
router.get('/schools', getAllSchools);
router.get('/school-ratings/:schoolName', getSchoolRatings);
router.get('/', getAllPosts);
router.post('/', auth, createPost);
router.put('/:id', auth, updatePost);
router.delete('/:id', auth, deletePost);
router.get('/:id', getPostById);

console.log('Post routes registered successfully');

module.exports = router;
