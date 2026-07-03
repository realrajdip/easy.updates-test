const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallbacksecret');
    
    // Check if the user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    req.is2faPending = decoded.is2faPending;

    // If 2FA is enabled and pending, block access to secure routes
    if (decoded.is2faPending && !req.path.startsWith('/2fa/') && req.path !== '/me') {
      return res.status(403).json({ message: 'Two-factor authentication required', is2faPending: true });
    }

    // If user is not approved, block access to everything except /me and /2fa routes
    const isApproved = user.approvalStatus === 'approved' || user.get('isApproved') === true;
    if (!isApproved && !req.path.startsWith('/2fa/') && req.path !== '/me' && req.path !== '/request-access') {
      return res.status(403).json({ message: 'Account pending approval', isPendingApproval: true });
    }

    next();
  } catch (error) {
    console.error('Token authentication error:', error);
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_user')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

const superUserOnly = (req, res, next) => {
  if (req.user && req.user.role === 'super_user') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as a super user' });
  }
};

module.exports = { protect, adminOnly, superUserOnly };
