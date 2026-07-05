const mongoose = require('mongoose');

const UpdateSchema = new mongoose.Schema({
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
  acknowledgedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrenceRule: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'shift'],
    default: 'none'
  },
  eta: {
    type: Date,
    default: null
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  etaNotificationSent: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

UpdateSchema.index({ isPinned: -1, createdAt: -1 });
UpdateSchema.index({ etaNotificationSent: 1, eta: 1 });

module.exports = mongoose.model('Update', UpdateSchema);
