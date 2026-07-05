const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Array of assignees — empty array means "whole team"
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },
  eta: {
    type: Date,
    default: null
  },
  etaNotificationSent: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ etaNotificationSent: 1, status: 1, eta: 1 });

module.exports = mongoose.model('Task', TaskSchema);
