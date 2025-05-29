const admin = require('firebase-admin');

const auth = async (req, res, next) => {
    try {
        console.log('\n=== Auth Middleware ===');
        console.log('Headers:', req.headers);
        
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            console.log('No authorization header found');
            return res.status(401).json({ message: 'No authorization header' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('No token found in authorization header');
            return res.status(401).json({ message: 'No token provided' });
        }

        console.log('Verifying token...');
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('Token verified successfully');
        console.log('Decoded token:', decodedToken);
        
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
};

module.exports = auth; 