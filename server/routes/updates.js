const express = require('express');
const router = express.Router();
const Update = require('../models/Update');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

/* ── helpers ───────────────────────────────────────────────────────────── */

/**
 * Normalise assignedTo from the request body into an array of string IDs.
 * Accepts: array, single string, null/undefined → always returns string[].
 */
function normaliseAssignedTo(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

/**
 * Parse @username mentions from text, resolve to user IDs.
 * Excludes the current user. Handles @everyone.
 * Returns string[] of ObjectId strings.
 */
async function resolveMentions(text, currentUserId) {
  const mentionRegex = /@(\w+)/g;
  let match;
  const mentionedUsernames = [];
  while ((match = mentionRegex.exec(text)) !== null) {
    mentionedUsernames.push(match[1].toLowerCase());
  }
  if (mentionedUsernames.length === 0) return [];

  let mentionUserIds = [];
  if (mentionedUsernames.includes('everyone')) {
    const allUsers = await User.find({ _id: { $ne: currentUserId } });
    mentionUserIds = allUsers.map(u => u._id.toString());
  } else {
    const users = await User.find({ username: { $in: mentionedUsernames } });
    mentionUserIds = users
      .map(u => u._id.toString())
      .filter(id => id !== currentUserId.toString());
  }
  return mentionUserIds;
}

/**
 * Fire notifications for a set of recipient IDs.
 * Deduplicates within the call.
 */
async function sendNotifications(io, recipientIds, message, { updateId }) {
  const pushService = require('../services/pushService');
  const unique = [...new Set(recipientIds.map(String))];
  for (const recipientId of unique) {
    const notification = new Notification({
      recipient: recipientId,
      message,
      updateId,
    });
    await notification.save();
    if (io) {
      io.to(recipientId).emit('notification:new', {
        _id: notification._id,
        message: notification.message,
        updateId,
        isRead: false,
        createdAt: notification.createdAt,
      });
    }

    try {
      const recipientUser = await User.findById(recipientId);
      if (recipientUser && recipientUser.pushSubscription) {
        const payload = {
          title: 'Easy Updates',
          body: message,
          data: {
            url: '/',
            notificationId: notification._id,
            updateId
          }
        };
        const success = await pushService.sendPush(recipientUser.pushSubscription, payload);
        if (!success) {
          recipientUser.pushSubscription = null;
          await recipientUser.save();
        }
      }
    } catch (pushErr) {
      console.error('Failed to dispatch web push in updates route:', pushErr);
    }
  }
}

// @route   POST api/updates
// @desc    Create a new key update/point
// @access  Private
router.post('/', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { description, isRecurring, recurrenceRule, eta, isPinned } = req.body;
  const assignedTo = normaliseAssignedTo(req.body.assignedTo); // [] = whole team

  try {
    if (!description) {
      return res.status(400).json({ message: 'Description is required' });
    }

    const newUpdate = new Update({
      description,
      creator: req.user.id,
      assignedTo,
      isRecurring: isRecurring || false,
      recurrenceRule: recurrenceRule || 'none',
      eta: eta || null,
      isPinned: isPinned || false,
      acknowledgedBy: [req.user.id],
    });

    const savedUpdate = await newUpdate.save();
    const populatedUpdate = await Update.findById(savedUpdate._id)
      .populate('creator', 'username avatarColor status statusOverride lastSeen')
      .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
      .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');
    if (io) io.emit('update:new', populatedUpdate);

    // Parse @mentions from description
    const mentionUserIds = await resolveMentions(description, req.user.id);

    // Determine base recipients (assigned members or whole team)
    let baseRecipients = [];
    if (assignedTo.length > 0) {
      baseRecipients = assignedTo.filter(id => id.toString() !== req.user.id.toString());
    } else {
      const allUsers = await User.find({ _id: { $ne: req.user.id } });
      baseRecipients = allUsers.map(u => u._id.toString());
    }

    // Send notifications — mention gets a different message, both deduped
    const mentionSet = new Set(mentionUserIds.map(String));
    const baseSet = new Set(baseRecipients.map(String));

    // Intersection: in both base AND mention → use mention message
    // Only in base → assignment message
    // Only in mention (not assigned) → mention message; also add to assignedTo
    const onlyMentioned = mentionUserIds.filter(id => !baseSet.has(id));
    if (onlyMentioned.length > 0) {
      await Update.findByIdAndUpdate(savedUpdate._id, {
        $addToSet: { assignedTo: { $each: onlyMentioned } },
      });
    }

    for (const recipientId of new Set([...baseSet, ...mentionSet])) {
      const isMention = mentionSet.has(recipientId);
      const msg = isMention
        ? `@${req.user.username} mentioned you in a new update.`
        : `@${req.user.username} posted a new shift update.`;
      await sendNotifications(io, [recipientId], msg, { updateId: savedUpdate._id });
    }

    res.status(201).json(populatedUpdate);
  } catch (error) {
    console.error('Create update error:', error);
    res.status(500).json({ message: 'Server error creating update' });
  }
});

// @route   GET api/updates
// @desc    Get all updates (pinned first, then descending chronological order)
// @access  Private
router.get('/', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const updates = await Update.find()
      .populate('creator', 'username avatarColor status statusOverride lastSeen')
      .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
      .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen')
      .sort({ isPinned: -1, createdAt: -1 });

    res.json(updates);
  } catch (error) {
    console.error('Fetch updates error:', error);
    res.status(500).json({ message: 'Server error fetching updates' });
  }
});

// @route   GET api/updates/:id
// @desc    Get a single update detail
// @access  Private
router.get('/:id', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const update = await Update.findById(req.params.id)
      .populate('creator', 'username avatarColor status statusOverride lastSeen')
      .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
      .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen');

    if (!update) {
      return res.status(404).json({ message: 'Update not found' });
    }

    res.json(update);
  } catch (error) {
    console.error('Fetch update detail error:', error);
    res.status(500).json({ message: 'Server error fetching update detail' });
  }
});

// @route   PUT api/updates/:id
// @desc    Edit an update
// @access  Private
router.put('/:id', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { description, isRecurring, recurrenceRule, eta, isPinned } = req.body;
  const newAssignedTo = normaliseAssignedTo(req.body.assignedTo);

  if (!description) {
    return res.status(400).json({ message: 'Description is required' });
  }

  try {
    const update = await Update.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: 'Update not found' });
    }

    if (update.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to edit this update' });
    }

    const oldAssignees = update.assignedTo.map(id => id.toString());

    update.description = description;
    update.assignedTo = newAssignedTo;
    if (isRecurring !== undefined) update.isRecurring = isRecurring;
    if (recurrenceRule !== undefined) update.recurrenceRule = recurrenceRule === 'none' ? 'none' : recurrenceRule;
    if (eta !== undefined) {
      const oldEtaStr = update.eta ? new Date(update.eta).toISOString() : '';
      const newEtaStr = eta ? new Date(eta).toISOString() : '';
      if (oldEtaStr !== newEtaStr) {
        update.etaNotificationSent = false;
      }
      update.eta = eta || null;
    }
    if (isPinned !== undefined) update.isPinned = isPinned;

    await update.save();

    const populatedUpdate = await Update.findById(req.params.id)
      .populate('creator', 'username avatarColor status statusOverride lastSeen')
      .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
      .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');

    // Notify only newly-added assignees
    const addedAssignees = newAssignedTo
      .filter(id => id.toString() !== req.user.id.toString())
      .filter(id => !oldAssignees.includes(id.toString()));

    if (addedAssignees.length > 0) {
      await sendNotifications(io, addedAssignees, `@${req.user.username} assigned you to an update.`, {
        updateId: update._id,
      });
    }

    // Notify for new @mentions in edited description
    const mentionUserIds = await resolveMentions(description, req.user.id);
    if (mentionUserIds.length > 0) {
      await sendNotifications(io, mentionUserIds, `@${req.user.username} mentioned you in an edited update.`, {
        updateId: update._id,
      });
    }

    if (io) io.emit('update:edited', populatedUpdate);

    res.json(populatedUpdate);
  } catch (error) {
    console.error('Edit update error:', error);
    res.status(500).json({ message: 'Server error editing update' });
  }
});

// @route   DELETE api/updates/:id
// @desc    Delete an update
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const update = await Update.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: 'Update not found' });
    }

    if (update.creator.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this update' });
    }

    await Update.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ updateId: req.params.id });
    await Notification.deleteMany({ updateId: req.params.id });

    const io = req.app.get('socketio');
    if (io) io.emit('update:deleted', { id: req.params.id });

    res.json({ message: 'Update deleted successfully' });
  } catch (error) {
    console.error('Delete update error:', error);
    res.status(500).json({ message: 'Server error deleting update' });
  }
});

// @route   PUT api/updates/:id/pin
// @desc    Toggle pin status of an update
// @access  Private
router.put('/:id/pin', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const update = await Update.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: 'Update not found' });
    }

    update.isPinned = !update.isPinned;
    await update.save();

    const populatedUpdate = await Update.findById(req.params.id)
      .populate('creator', 'username avatarColor status statusOverride lastSeen')
      .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
      .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');
    if (io) io.emit('update:edited', populatedUpdate);

    res.json(populatedUpdate);
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ message: 'Server error toggling pin' });
  }
});

// @route   POST api/updates/:id/acknowledge
// @desc    Acknowledge an update
// @access  Private
router.post('/:id/acknowledge', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const update = await Update.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: 'Update not found' });
    }

    if (!update.acknowledgedBy.includes(req.user.id)) {
      update.acknowledgedBy.push(req.user.id);
      await update.save();
    }

    const populatedUpdate = await Update.findById(req.params.id)
      .populate('creator', 'username avatarColor status statusOverride lastSeen')
      .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
      .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');
    if (io) io.emit('update:acknowledged', populatedUpdate);

    res.json(populatedUpdate);
  } catch (error) {
    console.error('Acknowledge update error:', error);
    res.status(500).json({ message: 'Server error acknowledging update' });
  }
});

// @route   GET api/updates/:id/comments
// @desc    Get all comments for an update
// @access  Private
router.get('/:id/comments', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const comments = await Comment.find({ updateId: req.params.id })
      .populate('author', 'username avatarColor status statusOverride lastSeen')
      .populate('reactions.user', 'username avatarColor status statusOverride lastSeen')
      .populate('readBy', 'username avatarColor status statusOverride lastSeen')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (error) {
    console.error('Fetch comments error:', error);
    res.status(500).json({ message: 'Server error fetching comments' });
  }
});

// @route   POST api/updates/:id/comments
// @desc    Add a comment; @mentions auto-add users to assignees
// @access  Private
router.post('/:id/comments', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { content } = req.body;

  try {
    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const update = await Update.findById(req.params.id);
    if (!update) {
      return res.status(404).json({ message: 'Update not found' });
    }

    const mentionUserIds = await resolveMentions(content, req.user.id);

    const comment = new Comment({
      content,
      author: req.user.id,
      updateId: req.params.id,
      parentId: req.body.parentId || null,
      mentions: mentionUserIds,
      readBy: [req.user.id],
    });

    await comment.save();

    const populatedComment = await Comment.findById(comment._id)
      .populate('author', 'username avatarColor status statusOverride lastSeen')
      .populate('mentions', 'username')
      .populate('reactions.user', 'username avatarColor status statusOverride lastSeen')
      .populate('readBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');

    // ── Mention-to-assign: add mentioned users not already in assignedTo ──
    const currentAssignees = update.assignedTo.map(id => id.toString());
    const newlyAdded = mentionUserIds.filter(id => !currentAssignees.includes(id));

    if (newlyAdded.length > 0) {
      await Update.findByIdAndUpdate(update._id, {
        $addToSet: { assignedTo: { $each: newlyAdded } },
      });

      // Emit updated update so all clients refresh the assignee list live
      const updatedUpdate = await Update.findById(update._id)
        .populate('creator', 'username avatarColor status statusOverride lastSeen')
        .populate('assignedTo', 'username avatarColor status statusOverride lastSeen')
        .populate('acknowledgedBy', 'username avatarColor status statusOverride lastSeen');
      if (io) io.emit('update:edited', updatedUpdate);

      // Notify newly-added members
      await sendNotifications(
        io,
        newlyAdded,
        `@${req.user.username} mentioned you and added you to an update thread.`,
        { updateId: update._id }
      );
    }

    // Notify already-assigned mentioned members
    const alreadyAssignedMentioned = mentionUserIds.filter(id => currentAssignees.includes(id));
    await sendNotifications(
      io,
      alreadyAssignedMentioned,
      `@${req.user.username} mentioned you in an update thread.`,
      { updateId: update._id }
    );

    // Broadcast new comment to thread listeners
    if (io) io.emit(`update:${req.params.id}:comment`, populatedComment);

    res.status(201).json(populatedComment);
  } catch (error) {
    console.error('Post comment error:', error);
    res.status(500).json({ message: 'Server error posting comment' });
  }
});

// @route   POST api/updates/comments/read
// @desc    Batch mark comments as read by the current user
// @access  Private
router.post('/comments/read', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { commentIds } = req.body;
  if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({ message: 'Invalid commentIds list' });
  }

  try {
    await Comment.updateMany(
      { _id: { $in: commentIds }, readBy: { $ne: req.user.id } },
      { $addToSet: { readBy: req.user.id } }
    );

    const io = req.app.get('socketio');
    if (io) {
      io.emit('comments:read', {
        commentIds,
        user: {
          _id: req.user.id,
          username: req.user.username,
          avatarColor: req.user.avatarColor,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Batch read comments error:', error);
    res.status(500).json({ message: 'Server error marking comments as read' });
  }
});

// @route   PUT api/updates/comments/:commentId
// @desc    Edit a comment
// @access  Private
router.put('/comments/:commentId', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to edit this comment' });
    }

    comment.content = content;
    comment.editedAt = new Date();
    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate('author', 'username avatarColor status statusOverride lastSeen')
      .populate('mentions', 'username')
      .populate('reactions.user', 'username avatarColor status statusOverride lastSeen')
      .populate('readBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');
    if (io) {
      const channel = comment.updateId
        ? `update:${comment.updateId}:comment:update`
        : `task:${comment.taskId}:comment:update`;
      io.emit(channel, populated);
    }

    res.json(populated);
  } catch (error) {
    console.error('Edit comment error:', error);
    res.status(500).json({ message: 'Server error editing comment' });
  }
});

// @route   DELETE api/updates/comments/:commentId
// @desc    Soft-delete a comment
// @access  Private
router.delete('/comments/:commentId', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    comment.isDeleted = true;
    comment.content = 'This message was deleted';
    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate('author', 'username avatarColor status statusOverride lastSeen')
      .populate('mentions', 'username')
      .populate('reactions.user', 'username avatarColor status statusOverride lastSeen')
      .populate('readBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');
    if (io) {
      const channel = comment.updateId
        ? `update:${comment.updateId}:comment:update`
        : `task:${comment.taskId}:comment:update`;
      io.emit(channel, populated);
    }

    res.json(populated);
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Server error deleting comment' });
  }
});

// @route   POST api/updates/comments/:commentId/react
// @desc    Toggle reaction (emoji) on a comment
// @access  Private
router.post('/comments/:commentId/react', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { emoji } = req.body;
  if (!emoji) {
    return res.status(400).json({ message: 'Emoji is required' });
  }

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const existingIndex = comment.reactions.findIndex(
      r => r.user.toString() === req.user.id && r.emoji === emoji
    );

    if (existingIndex > -1) {
      comment.reactions.splice(existingIndex, 1);
    } else {
      comment.reactions.push({ user: req.user.id, emoji });
    }

    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate('author', 'username avatarColor status statusOverride lastSeen')
      .populate('mentions', 'username')
      .populate('reactions.user', 'username avatarColor status statusOverride lastSeen')
      .populate('readBy', 'username avatarColor status statusOverride lastSeen');

    const io = req.app.get('socketio');
    if (io) {
      const channel = comment.updateId
        ? `update:${comment.updateId}:comment:update`
        : `task:${comment.taskId}:comment:update`;
      io.emit(channel, populated);
    }

    res.json(populated);
  } catch (error) {
    console.error('Toggle reaction error:', error);
    res.status(500).json({ message: 'Server error toggling reaction' });
  }
});

module.exports = router;
