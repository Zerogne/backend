const admin = require('firebase-admin');

const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ message: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    admin.auth().verifyIdToken(token)
        .then(decodedToken => {
            req.user = decodedToken;
            next();
        })
        .catch(error => {
            console.error('Error verifying token:', error);
            res.status(401).json({ message: 'Invalid token' });
        });
};

module.exports = auth; 