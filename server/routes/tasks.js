const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
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
 * Skips duplicates within the call.
 */
async function sendNotifications(io, recipientIds, message, { taskId }) {
  const pushService = require('../services/pushService');
  const unique = [...new Set(recipientIds.map(String))];
  for (const recipientId of unique) {
    const notification = new Notification({
      recipient: recipientId,
      message,
      taskId,
    });
    await notification.save();
    if (io) {
      io.to(recipientId).emit('notification:new', {
        _id: notification._id,
        message: notification.message,
        taskId,
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
            taskId
          }
        };
        const success = await pushService.sendPush(recipientUser.pushSubscription, payload);
        if (!success) {
          recipientUser.pushSubscription = null;
          await recipientUser.save();
        }
      }
    } catch (pushErr) {
      console.error('Failed to dispatch web push in tasks route:', pushErr);
    }
  }
}

// @route   POST api/tasks
// @desc    Create a new task
// @access  Private
router.post('/', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { title, description, eta } = req.body;
  const assignedTo = normaliseAssignedTo(req.body.assignedTo); // [] = whole team

  try {
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const newTask = new Task({
      title,
      description,
      creator: req.user.id,
      assignedTo,
      eta: eta || null,
      status: 'pending',
    });

    const savedTask = await newTask.save();
    const populatedTask = await Task.findById(savedTask._id)
      .populate('creator', 'username avatarColor status lastSeen')
      .populate('assignedTo', 'username avatarColor status lastSeen');

    const io = req.app.get('socketio');
    if (io) io.emit('task:new', populatedTask);

    // Notify assigned members (or whole team)
    let recipients = [];
    if (assignedTo.length > 0) {
      recipients = assignedTo.filter(id => id.toString() !== req.user.id.toString());
    } else {
      const allUsers = await User.find({ _id: { $ne: req.user.id } });
      recipients = allUsers.map(u => u._id);
    }

    await sendNotifications(io, recipients, `@${req.user.username} assigned you a new task: "${title}"`, {
      taskId: savedTask._id,
    });

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Server error creating task' });
  }
});

// @route   GET api/tasks
// @desc    Get all tasks
// @access  Private
router.get('/', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const tasks = await Task.find()
      .populate('creator', 'username avatarColor status lastSeen')
      .populate('assignedTo', 'username avatarColor status lastSeen')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ message: 'Server error fetching tasks' });
  }
});

// @route   GET api/tasks/:id
// @desc    Get details for a single task
// @access  Private
router.get('/:id', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const task = await Task.findById(req.params.id)
      .populate('creator', 'username avatarColor status lastSeen')
      .populate('assignedTo', 'username avatarColor status lastSeen');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Fetch task detail error:', error);
    res.status(500).json({ message: 'Server error fetching task detail' });
  }
});

// @route   PUT api/tasks/:id/status
// @desc    Update status of a task
// @access  Private
router.put('/:id/status', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { status } = req.body;

  try {
    const validStatuses = ['pending', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.status = status;
    await task.save();

    const populatedTask = await Task.findById(req.params.id)
      .populate('creator', 'username avatarColor status lastSeen')
      .populate('assignedTo', 'username avatarColor status lastSeen');

    const io = req.app.get('socketio');
    if (io) io.emit('task:status_changed', populatedTask);

    res.json(populatedTask);
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ message: 'Server error updating task status' });
  }
});

// @route   GET api/tasks/:id/comments
// @desc    Get comments for a task
// @access  Private
router.get('/:id/comments', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const comments = await Comment.find({ taskId: req.params.id })
      .populate('author', 'username avatarColor status lastSeen')
      .populate('reactions.user', 'username avatarColor status lastSeen')
      .populate('readBy', 'username avatarColor status lastSeen')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (error) {
    console.error('Fetch task comments error:', error);
    res.status(500).json({ message: 'Server error fetching comments' });
  }
});

// @route   POST api/tasks/:id/comments
// @desc    Post a comment on a task; @mentions add user to assignees
// @access  Private
router.post('/:id/comments', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { content } = req.body;

  try {
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const mentionUserIds = await resolveMentions(content, req.user.id);

    const comment = new Comment({
      content,
      author: req.user.id,
      taskId: req.params.id,
      parentId: req.body.parentId || null,
      mentions: mentionUserIds,
      readBy: [req.user.id],
    });

    await comment.save();

    const populatedComment = await Comment.findById(comment._id)
      .populate('author', 'username avatarColor status lastSeen')
      .populate('mentions', 'username')
      .populate('reactions.user', 'username avatarColor status lastSeen')
      .populate('readBy', 'username avatarColor status lastSeen');

    const io = req.app.get('socketio');

    // ── Mention-to-assign: add mentioned users not already in assignedTo ──
    const currentAssignees = task.assignedTo.map(id => id.toString());
    const newlyAdded = mentionUserIds.filter(id => !currentAssignees.includes(id));

    if (newlyAdded.length > 0) {
      await Task.findByIdAndUpdate(task._id, {
        $addToSet: { assignedTo: { $each: newlyAdded } },
      });

      // Emit updated task so all clients refresh the assignee list live
      const updatedTask = await Task.findById(task._id)
        .populate('creator', 'username avatarColor status lastSeen')
        .populate('assignedTo', 'username avatarColor status lastSeen');
      if (io) io.emit('task:updated', updatedTask);

      // Notify newly-added members
      await sendNotifications(
        io,
        newlyAdded,
        `@${req.user.username} mentioned you and added you to the task: "${task.title}"`,
        { taskId: task._id }
      );
    }

    // Notify already-assigned mentioned members (they weren't added but were pinged)
    const alreadyAssignedMentioned = mentionUserIds.filter(id => currentAssignees.includes(id));
    await sendNotifications(
      io,
      alreadyAssignedMentioned,
      `@${req.user.username} mentioned you in a task thread: "${task.title}"`,
      { taskId: task._id }
    );

    // Broadcast comment to thread listeners
    if (io) io.emit(`task:${req.params.id}:comment`, populatedComment);

    res.status(201).json(populatedComment);
  } catch (error) {
    console.error('Post task comment error:', error);
    res.status(500).json({ message: 'Server error posting task comment' });
  }
});

// @route   PUT api/tasks/:id
// @desc    Update task details
// @access  Private
router.put('/:id', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  const { title, description, eta } = req.body;
  const newAssignedTo = normaliseAssignedTo(req.body.assignedTo);

  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Permissions: creator or admin/super_user
    const isCreator = task.creator.toString() === req.user.id;
    const isPrivileged = ['admin', 'super_user'].includes(req.user.role);
    if (!isCreator && !isPrivileged) {
      return res.status(403).json({ message: 'Not authorized to edit this task' });
    }

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const oldAssignees = task.assignedTo.map(id => id.toString());

    task.title = title;
    task.description = description;
    task.assignedTo = newAssignedTo;
    const oldEtaStr = task.eta ? new Date(task.eta).toISOString() : '';
    const newEtaStr = eta ? new Date(eta).toISOString() : '';
    if (oldEtaStr !== newEtaStr) {
      task.etaNotificationSent = false;
    }
    task.eta = eta || null;

    const savedTask = await task.save();
    const populatedTask = await Task.findById(savedTask._id)
      .populate('creator', 'username avatarColor status lastSeen')
      .populate('assignedTo', 'username avatarColor status lastSeen');

    const io = req.app.get('socketio');

    // Notify only newly-added assignees (not those already assigned)
    const addedAssignees = newAssignedTo
      .filter(id => id.toString() !== req.user.id.toString())
      .filter(id => !oldAssignees.includes(id.toString()));

    if (addedAssignees.length > 0) {
      await sendNotifications(io, addedAssignees, `@${req.user.username} assigned you to a task: "${title}"`, {
        taskId: task._id,
      });
    }

    if (io) io.emit('task:updated', populatedTask);

    res.json(populatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Server error updating task' });
  }
});

// @route   DELETE api/tasks/:id
// @desc    Delete a task and its comments
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  if (req.is2faPending) {
    return res.status(403).json({ message: '2FA verification pending' });
  }

  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Permissions
    const isCreator = task.creator.toString() === req.user.id;
    const isPrivileged = ['admin', 'super_user'].includes(req.user.role);
    if (!isCreator && !isPrivileged) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    await Task.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ taskId: req.params.id });
    await Notification.deleteMany({ taskId: req.params.id });

    const io = req.app.get('socketio');
    if (io) io.emit('task:deleted', req.params.id);

    res.json({ message: 'Task removed' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Server error deleting task' });
  }
});

module.exports = router;
