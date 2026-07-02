const mongoose = require('mongoose');

const ResponseSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
  text: { type: String, default: '' },
  choiceIndex: { type: Number, default: null },
  isCorrect: { type: Boolean, default: null },               // quiz only
  attempts: { type: Number, default: 0 },                    // quiz attempts
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const CourseProgressSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  completedTaskIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: []
  },
  responses: {
    type: [ResponseSchema],
    default: []
  },
  completedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

CourseProgressSchema.index({ course: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('CourseProgress', CourseProgressSchema);
