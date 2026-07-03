const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  twoFactorSecret: {
    type: String,
    default: null
  },
  isTwoFactorEnabled: {
    type: Boolean,
    default: false
  },
  backupCodes: {
    type: [String],
    default: []
  },
  avatarColor: {
    type: String,
    default: '#111111'
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  currentPage: {
    type: String,
    default: ''
  },
  currentAction: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'super_user'],
    default: 'user'
  },
  statusOverride: {
    type: String,
    enum: ['none', 'offline'],
    default: 'none'
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  actedBy: {
    type: String,
    default: null
  },
  actionDate: {
    type: Date,
    default: null
  },
  pushSubscription: {
    type: Object,
    default: null
  }
}, { timestamps: true });

UserSchema.set('toJSON', {
  transform: (doc, ret) => {
    // If username is an email address, strip the domain suffix for client-side rendering
    if (ret.username && ret.username.includes('@')) {
      ret.username = ret.username.split('@')[0];
    }
    delete ret.password;
    return ret;
  }
});

module.exports = mongoose.model('User', UserSchema);
