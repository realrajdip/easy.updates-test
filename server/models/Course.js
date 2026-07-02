const mongoose = require('mongoose');

/* ── Content blocks (typed) ───────────────────────────────────────────── */
const BlockSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['heading', 'paragraph', 'bullet', 'numbered', 'callout', 'code', 'quote', 'divider', 'link'],
    required: true
  },
  text: { type: String, default: '' },
  level: { type: Number, default: 2 },                       // heading: 2 or 3
  items: { type: [String], default: [] },                    // bullet / numbered
  variant: { type: String, default: 'info' },                // callout: info|tip|warning|success
  language: { type: String, default: '' },                   // code
  url: { type: String, default: '' },                        // link
  title: { type: String, default: '' },                      // link
  description: { type: String, default: '' }                 // link
}, { _id: true });

/* ── External resources (link cards) ─────────────────────────────────── */
const ResourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  description: { type: String, default: '' }
}, { _id: true });

/* ── Lesson tasks (typed) ────────────────────────────────────────────── */
const LessonTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  instructions: { type: String, default: '' },
  type: {
    type: String,
    enum: ['check', 'link', 'response', 'quiz'],
    default: 'check'
  },
  url: { type: String, default: '' },                        // link
  options: { type: [String], default: [] },                  // quiz
  correctIndex: { type: Number, default: null },             // quiz (hidden from participants)
  required: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { _id: true });

/* ── Lessons ─────────────────────────────────────────────────────────── */
const LessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  summary: { type: String, default: '' },
  estimatedMinutes: { type: Number, default: null },
  content: { type: String, default: '' },                    // legacy fallback; new lessons use `blocks`
  blocks: { type: [BlockSchema], default: [] },
  resources: { type: [ResourceSchema], default: [] },
  tasks: { type: [LessonTaskSchema], default: [] },
  order: { type: Number, default: 0 }
}, { _id: true, timestamps: true });

/* ── Course ──────────────────────────────────────────────────────────── */
const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  summary: { type: String, default: '' },
  category: { type: String, default: '' },                   // e.g. Onboarding / SOP / Training
  tags: { type: [String], default: [] },
  estimatedMinutes: { type: Number, default: null },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  managers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lessons: { type: [LessonSchema], default: [] },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

CourseSchema.methods.roleFor = function (userId) {
  if (!userId) return null;
  const id = userId.toString();
  if (this.creator?.toString() === id) return 'owner';
  if (this.managers?.some((m) => m.toString() === id)) return 'manager';
  if (this.participants?.some((p) => p.toString() === id)) return 'participant';
  return null;
};

module.exports = mongoose.model('Course', CourseSchema);
