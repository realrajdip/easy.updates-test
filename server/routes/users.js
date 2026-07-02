const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { protect } = require('../middleware/auth');

// @route   GET api/users
// @desc    Get all users list (for assignee assignment, presence tracking, and @mentions auto-suggest)
// @access  Private
router.get('/', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA authentication pending' });
  }

  try {
    const users = await User.find({
      $or: [
        { approvalStatus: 'approved' },
        { isApproved: true }
      ]
    }).select('username avatarColor status lastSeen currentPage currentAction');
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ message: 'Server error retrieving users list' });
  }
});

// @route   PUT api/users/profile
// @desc    Update user profile settings (username, avatar, password)
// @access  Private
router.put('/profile', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA authentication pending' });
  }

  const { username, avatarColor, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update Username
    if (username && username.trim() !== '' && username.toLowerCase() !== user.username) {
      const existingUser = await User.findOne({ username: username.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: 'Username is already taken' });
      }
      user.username = username.toLowerCase();
    }

    // Update Avatar Color
    if (avatarColor && avatarColor.trim() !== '') {
      user.avatarColor = avatarColor;
    }

    // Update Password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to set a new password' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Incorrect current password' });
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      username: user.username,
      avatarColor: user.avatarColor,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      role: user.role
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

module.exports = router;
