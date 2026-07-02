const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly, superUserOnly } = require('../middleware/auth');

// Get all users (Admin/Super User only)
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// Approve a user (Admin/Super User only)
router.put('/users/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.approvalStatus = 'approved';
    user.actedBy = req.user.username;
    user.actionDate = new Date();
    await user.save();
    
    const io = req.app.get('socketio');
    if (io) io.to(user._id.toString()).emit('auth:update', { approvalStatus: user.approvalStatus, role: user.role });

    res.json({ message: 'User approved', user: { _id: user._id, username: user.username, approvalStatus: user.approvalStatus } });
  } catch (error) {
    res.status(500).json({ message: 'Server error approving user' });
  }
});

// Reject a pending user (Admin/Super User only)
router.put('/users/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.role === 'super_user') {
       return res.status(403).json({ message: 'Cannot reject a super user' });
    }

    // Admins cannot reject other admins
    if (req.user.role === 'admin' && user.role !== 'user') {
       return res.status(403).json({ message: 'Admins can only reject regular users' });
    }

    user.approvalStatus = 'rejected';
    user.actedBy = req.user.username;
    user.actionDate = new Date();
    await user.save();

    const io = req.app.get('socketio');
    if (io) io.to(user._id.toString()).emit('auth:update', { approvalStatus: user.approvalStatus, role: user.role });

    res.json({ message: 'User rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Server error rejecting user' });
  }
});

// Change a user's role (Super User only)
router.put('/users/:id/role', protect, superUserOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
       return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.role === 'super_user') {
       return res.status(403).json({ message: 'Cannot modify a super user role' });
    }
    
    user.role = role;
    await user.save();
    
    const io = req.app.get('socketio');
    if (io) io.to(user._id.toString()).emit('auth:update', { approvalStatus: user.approvalStatus, role: user.role });

    res.json({ message: 'Role updated successfully', user: { _id: user._id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating user role' });
  }
});

module.exports = router;
