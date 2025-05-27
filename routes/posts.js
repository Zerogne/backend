const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth'); // Import auth middleware

// Define route handlers
const getAllPosts = async (req, res) => {
    try {
        const posts = await mongoose.connection.db.collection('posts').find({}).toArray();
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
            upvotes: 0,
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await mongoose.connection.db.collection('posts').insertOne(postData);
        res.status(201).json({ 
            message: 'Post created successfully', 
            postId: result.insertedId,
            post: postData
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const updateData = req.body;
        
        // Ensure the user is the author or an admin if needed for general edits
        // For upvotes/comments, we might allow any logged-in user, but the update logic handles userId

        if (updateData.type === 'upvote') {
            const post = await mongoose.connection.db.collection('posts').findOne(
                { _id: new mongoose.Types.ObjectId(postId) }
            );
            
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

            await mongoose.connection.db.collection('posts').updateOne(
                { _id: new mongoose.Types.ObjectId(postId) },
                { 
                    $set: {
                        upvotes: newUpvotes,
                        upvotedBy: newUpvotedBy
                    }
                }
            );

            // Fetch the updated post to return in the response
            const updatedPost = await mongoose.connection.db.collection('posts').findOne(
                 { _id: new mongoose.Types.ObjectId(postId) }
            );

            res.json({
                message: hasUpvoted ? 'Upvote removed' : 'Post upvoted successfully',
                upvotes: updatedPost.upvotes,
                hasUpvoted: !hasUpvoted,
                upvotedBy: updatedPost.upvotedBy // Return updated list
            });

        } else if (updateData.type === 'comment') {
            console.log('Received comment data:', updateData);
            
            if (!updateData.text) {
                console.error('Comment text is missing:', updateData);
                return res.status(400).json({ message: 'Comment text is required' });
            }

            const comment = {
                id: new mongoose.Types.ObjectId(),
                userId: updateData.userId,
                text: updateData.text,
                createdAt: new Date()
            };

            console.log('Creating comment with data:', comment);

            await mongoose.connection.db.collection('posts').updateOne(
                { _id: new mongoose.Types.ObjectId(postId) },
                { $push: { comments: comment } }
            );

            // Fetch the updated post to return in the response
            const updatedPost = await mongoose.connection.db.collection('posts').findOne(
                { _id: new mongoose.Types.ObjectId(postId) }
            );

            console.log('Updated post with new comment:', updatedPost);

            res.json({ 
                message: 'Comment added successfully', 
                comment: updatedPost.comments.slice(-1)[0] 
            });

        } else { // Handle general post update (from edit modal)
             // Add a check to ensure the user is the author before allowing the edit
            const post = await mongoose.connection.db.collection('posts').findOne(
                 { _id: new mongoose.Types.ObjectId(postId) }
            );

            if (!post) {
                 return res.status(404).json({ message: 'Post not found' });
            }
            // Assuming req.user is populated by the auth middleware
            if (!req.user || post.userId !== req.user.uid) {
                 return res.status(403).json({ message: 'Unauthorized to edit this post' });
            }

            await mongoose.connection.db.collection('posts').updateOne(
                { _id: new mongoose.Types.ObjectId(postId) },
                {
                    $set: {
                        schoolName: String(updateData.schoolName),
                        title: String(updateData.title),
                        feedback: String(updateData.feedback),
                        rating: Number(updateData.rating),
                        postAnonymously: Boolean(updateData.postAnonymously),
                        updatedAt: new Date()
                    }
                }
            );

            // Fetch the updated post to return in the response
             const updatedPost = await mongoose.connection.db.collection('posts').findOne(
                 { _id: new mongoose.Types.ObjectId(postId) }
            );

            res.json({ message: 'Post updated successfully', post: updatedPost });
        }
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({ message: error.message });
    }
};

// Delete a post
const deletePost = async (req, res) => {
    try {
        const postId = req.params.id;

        // Add a check to ensure the user is the author before allowing deletion
         const post = await mongoose.connection.db.collection('posts').findOne(
             { _id: new mongoose.Types.ObjectId(postId) }
         );

         if (!post) {
             return res.status(404).json({ message: 'Post not found' });
         }
         // Assuming req.user is populated by the auth middleware
         if (!req.user || post.userId !== req.user.uid) {
             return res.status(403).json({ message: 'Unauthorized to delete this post' });
         }

        const result = await mongoose.connection.db.collection('posts').deleteOne({ _id: new mongoose.Types.ObjectId(postId) });

        if (result.deletedCount === 0) {
             // This case should ideally be caught by the post existence check above
            return res.status(404).json({ message: 'Post not found' });
        }

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
        const posts = await mongoose.connection.db.collection('posts').find({
            $or: [
                { title: searchRegex },
                { schoolName: searchRegex },
                { feedback: searchRegex }
            ]
        }).toArray();

        res.json(posts);
    } catch (error) {
        console.error('Error searching posts:', error);
        res.status(500).json({ message: error.message });
    }
};

// Register routes with auth middleware where needed
router.get('/search', searchPosts);
router.get('/:id', getPostById);
router.get('/', getAllPosts); // GET /api/posts is public
router.post('/', auth, createPost); // POST /api/posts requires auth
router.put('/:id', auth, updatePost); // PUT /api/posts/:id requires auth
router.delete('/:id', auth, deletePost); // DELETE /api/posts/:id requires auth

module.exports = router; 