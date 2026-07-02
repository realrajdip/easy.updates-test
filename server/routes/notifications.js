const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// @route   GET api/notifications
// @desc    Get current user's notifications (sorted by unread and newest)
// @access  Private
router.get('/', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ isRead: 1, createdAt: -1 })
      .limit(50); // limit to last 50 alerts

    res.json(notifications);
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ message: 'Server error retrieving notifications' });
  }
});

// @route   PUT api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error updating notification status' });
  }
});

// @route   PUT api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ message: 'Server error updating all notifications status' });
  }
});

module.exports = router;
