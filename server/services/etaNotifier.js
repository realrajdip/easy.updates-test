const Update = require('../models/Update');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const User = require('../models/User');

const startEtaNotifier = (io) => {
  console.log('Background ETA notification service started.');
  
  // Run checks every 1 minute
  setInterval(async () => {
    try {
      const now = new Date();
      // Near window: 30 minutes in the future
      const in30Minutes = new Date(now.getTime() + 30 * 60 * 1000);

      // ─── 1. Check Shift Updates ───
      const nearUpdates = await Update.find({
        eta: { $gt: now, $lte: in30Minutes },
        etaNotificationSent: { $ne: true }
      });

      for (const update of nearUpdates) {
        // Mark as sent immediately to avoid race conditions or double notifications
        update.etaNotificationSent = true;
        await update.save();

        // Determine recipient list
        let recipients = [];
        if (update.assignedTo && update.assignedTo.length > 0) {
          recipients = update.assignedTo.map(id => id.toString());
        } else {
          // Empty assignedTo means "whole team"
          const allUsers = await User.find({ approvalStatus: 'approved' });
          recipients = allUsers.map(u => u._id.toString());
        }

        // Construct notification message
        const preview = update.description.length > 40 ? `${update.description.slice(0, 40)}...` : update.description;
        const message = `Shift update target closure is approaching (due in under 30 mins): "${preview}"`;

        const uniqueRecipients = [...new Set(recipients)];
        for (const recipientId of uniqueRecipients) {
          const notification = new Notification({
            recipient: recipientId,
            message,
            updateId: update._id
          });
          await notification.save();

          if (io) {
            io.to(recipientId).emit('notification:new', {
              _id: notification._id,
              message: notification.message,
              updateId: update._id,
              isRead: false,
              createdAt: notification.createdAt
            });
          }
        }
        console.log(`Sent ETA warnings for update ${update._id} to ${uniqueRecipients.length} user(s).`);
      }

      // ─── 2. Check Tasks ───
      const nearTasks = await Task.find({
        eta: { $gt: now, $lte: in30Minutes },
        status: { $ne: 'completed' },
        etaNotificationSent: { $ne: true }
      });

      for (const task of nearTasks) {
        // Mark as sent
        task.etaNotificationSent = true;
        await task.save();

        // Determine recipient list
        let recipients = [];
        if (task.assignedTo && task.assignedTo.length > 0) {
          recipients = task.assignedTo.map(id => id.toString());
        } else {
          // Empty assignedTo means "whole team"
          const allUsers = await User.find({ approvalStatus: 'approved' });
          recipients = allUsers.map(u => u._id.toString());
        }

        // Construct notification message
        const message = `Task deadline is approaching (due in under 30 mins): "${task.title}"`;

        const uniqueRecipients = [...new Set(recipients)];
        for (const recipientId of uniqueRecipients) {
          const notification = new Notification({
            recipient: recipientId,
            message,
            taskId: task._id
          });
          await notification.save();

          if (io) {
            io.to(recipientId).emit('notification:new', {
              _id: notification._id,
              message: notification.message,
              taskId: task._id,
              isRead: false,
              createdAt: notification.createdAt
            });
          }
        }
        console.log(`Sent ETA warnings for task ${task._id} to ${uniqueRecipients.length} user(s).`);
      }
    } catch (err) {
      console.error('Error running ETA background notifier check:', err);
    }
  }, 60 * 1000); // 1 minute
};

module.exports = { startEtaNotifier };
