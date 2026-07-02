const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  updateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Update',
    default: null
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
