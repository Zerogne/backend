const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth'); // Import auth middleware
const Post = require('../models/post'); // Import Post model

console.log('\n=== Registering Post Routes ===');

// Add connection check middleware
const checkDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error('Database connection not established. Current state:', mongoose.connection.readyState);
    return res.status(500).json({ message: 'Database connection not established' });
  }
  next();
};

// Apply the middleware to all routes
router.use(checkDbConnection);

// Add route logging middleware
router.use((req, res, next) => {
    console.log('\n=== Post Route Request ===');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('Original URL:', req.originalUrl);
    console.log('Params:', req.params);
    next();
});

// Define route handlers
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

        // Try to find post by ID or Firebase UID
        let post;
        if (mongoose.Types.ObjectId.isValid(postId)) {
            post = await Post.findById(postId);
        } else {
            // If not a valid ObjectId, try to find by userId
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
            error: error.message 
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
            postAnonymously: Boolean(req.body.postAnonymously)
        };

        const post = new Post(postData);
        const savedPost = await post.save();
        
        res.status(201).json({ 
            message: 'Post created successfully', 
            postId: savedPost._id,
            post: savedPost
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
                    upvotedBy: newUpvotedBy
                },
                { new: true }
            );

            res.json({
                message: hasUpvoted ? 'Upvote removed' : 'Post upvoted successfully',
                upvotes: updatedPost.upvotes,
                hasUpvoted: !hasUpvoted,
                upvotedBy: updatedPost.upvotedBy
            });

        } else if (updateData.type === 'comment') {
            const comment = {
                id: new mongoose.Types.ObjectId(),
                userId: updateData.userId,
                text: updateData.text,
                createdAt: new Date()
            };

            const updatedPost = await Post.findByIdAndUpdate(
                postId,
                { $push: { comments: comment } },
                { new: true }
            );

            res.json({ 
                message: 'Comment added successfully', 
                comment: updatedPost.comments.slice(-1)[0] 
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
                    updatedAt: new Date()
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
                { feedback: searchRegex }
            ]
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
            console.log('Error: School type is missing');
            return res.status(400).json({ message: 'School type is required' });
        }

        let query = {};
        if (schoolType !== 'All Schools') {
            const schools = await mongoose.connection.db.collection('schools')
                .find({ type: schoolType })
                .toArray();
            
            if (schools.length === 0) {
                console.log(`No schools found for type: ${schoolType}`);
                return res.json([]);
            }

            const schoolNames = schools.map(school => school.name);
            query = { schoolName: { $in: schoolNames } };
        }

        const posts = await Post.find(query);
        console.log('Found posts:', posts.length);
        res.json(posts);
    } catch (error) {
        console.error('Error in filterPostsBySchoolType:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getAllSchools = async (req, res) => {
    try {
        console.log('\n=== GET /api/posts/schools ===');
        
        const schools = await mongoose.connection.db.collection('schools').find({}).toArray();
        console.log('Found schools:', schools.length);
        
        if (!schools || schools.length === 0) {
            console.log('No schools found in database');
            return res.json([]);
        }

        res.json(schools);
    } catch (error) {
        console.error('Error fetching schools:', error);
        res.status(500).json({ 
            message: 'Failed to fetch schools',
            error: error.message 
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
            postAnonymously: false 
        }).sort({ createdAt: -1 });

        console.log('Found posts:', posts.length);
        res.json(posts);
    } catch (error) {
        console.error('Error fetching user posts:', error);
        res.status(500).json({ 
            message: 'Failed to fetch user posts',
            error: error.message 
        });
    }
};

// Register routes in order of specificity (most specific first)
// Test route
router.get('/test', (req, res) => {
    console.log('Test route hit');
    res.json({ message: 'Test route working' });
});

// User posts route
router.get('/user/:userId', auth, getUserPosts);

// Search route
router.get('/search', searchPosts);

// Filter by school type route
router.get('/filter', filterPostsBySchoolType);

// Schools route
router.get('/schools', getAllSchools);

// Generic routes (least specific last)
router.get('/', getAllPosts);
router.get('/:id', getPostById);
router.post('/', auth, createPost);
router.put('/:id', auth, updatePost);
router.delete('/:id', auth, deletePost);

console.log('Post routes registered successfully');

module.exports = router; 