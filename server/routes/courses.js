const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseProgress = require('../models/CourseProgress');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

/* ── Helpers ───────────────────────────────────────────────────────── */

const populateCourse = (q) => q
  .populate('creator', 'username avatarColor')
  .populate('managers', 'username avatarColor')
  .populate('participants', 'username avatarColor');

const roleFor = (course, userId) => {
  if (!course || !userId) return null;
  const id = userId.toString();
  if ((course.creator?._id || course.creator)?.toString() === id) return 'owner';
  if (course.managers?.some((m) => (m._id || m).toString() === id)) return 'manager';
  if (course.participants?.some((p) => (p._id || p).toString() === id)) return 'participant';
  return null;
};

const canEdit = (role) => role === 'owner' || role === 'manager';

const totalRequiredTasks = (course) => {
  let n = 0;
  for (const l of course.lessons || []) {
    for (const t of l.tasks || []) {
      if (t.required) n += 1;
    }
  }
  return n;
};

const findTaskInCourse = (course, taskId) => {
  const idStr = taskId.toString();
  for (const l of course.lessons) {
    const t = l.tasks.id(idStr);
    if (t) return { lesson: l, task: t };
  }
  return { lesson: null, task: null };
};

const notify = async (io, recipientIds, message, courseId, fromId) => {
  for (const recipientId of recipientIds) {
    if (recipientId.toString() === fromId.toString()) continue;
    const notification = new Notification({
      recipient: recipientId,
      message,
      courseId
    });
    await notification.save();
    if (io) {
      io.to(recipientId.toString()).emit('notification:new', {
        _id: notification._id,
        message: notification.message,
        courseId,
        isRead: false,
        createdAt: notification.createdAt
      });
    }
  }
};

const guard2fa = (req, res) => {
  if (req.is2faPending) {
    res.status(403).json({ message: '2FA verification pending' });
    return true;
  }
  return false;
};

const sanitizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean)
      .map((t) => t.slice(0, 32))
  )].slice(0, 12);
};

const sanitizeBlocks = (blocks) => {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b && typeof b === 'object' && typeof b.type === 'string')
    .map((b) => ({
      type: b.type,
      text: typeof b.text === 'string' ? b.text : '',
      level: [2, 3].includes(Number(b.level)) ? Number(b.level) : 2,
      items: Array.isArray(b.items) ? b.items.filter((x) => typeof x === 'string') : [],
      variant: typeof b.variant === 'string' ? b.variant : 'info',
      language: typeof b.language === 'string' ? b.language : '',
      url: typeof b.url === 'string' ? b.url : '',
      title: typeof b.title === 'string' ? b.title : '',
      description: typeof b.description === 'string' ? b.description : ''
    }));
};

const sanitizeResources = (resources) => {
  if (!Array.isArray(resources)) return [];
  return resources
    .filter((r) => r && typeof r === 'object' && r.title && r.url)
    .map((r) => ({
      title: String(r.title).trim().slice(0, 140),
      url: String(r.url).trim().slice(0, 500),
      description: typeof r.description === 'string' ? r.description.slice(0, 400) : ''
    }));
};

const applyTaskPayload = (task, body) => {
  const { title, instructions, required, type, url, options, correctIndex } = body || {};
  if (typeof title === 'string') {
    if (!title.trim()) throw new Error('Task title cannot be empty');
    task.title = title.trim();
  }
  if (typeof instructions === 'string') task.instructions = instructions;
  if (typeof required === 'boolean') task.required = required;

  if (typeof type === 'string' && ['check', 'link', 'response', 'quiz'].includes(type)) {
    task.type = type;
  }

  if (task.type === 'link') {
    if (typeof url === 'string') task.url = url.trim();
    if (!task.url) throw new Error('Link tasks need a URL');
    task.options = [];
    task.correctIndex = null;
  } else if (task.type === 'quiz') {
    if (Array.isArray(options)) {
      task.options = options.map((o) => String(o).trim()).filter(Boolean).slice(0, 8);
    }
    if (typeof correctIndex === 'number') task.correctIndex = correctIndex;
    if (task.options.length < 2) throw new Error('Quiz tasks need at least 2 options');
    if (task.correctIndex == null || task.correctIndex < 0 || task.correctIndex >= task.options.length) {
      throw new Error('Quiz tasks need a valid correct answer');
    }
    task.url = '';
  } else if (task.type === 'response') {
    task.url = '';
    task.options = [];
    task.correctIndex = null;
  } else {
    task.url = '';
    task.options = [];
    task.correctIndex = null;
  }
};

/* ── Course CRUD ────────────────────────────────────────────────────── */

router.get('/', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const me = req.user.id;
    const courses = await populateCourse(
      Course.find({
        $or: [
          { creator: me },
          { managers: me },
          { participants: me },
          { isPublished: true }
        ]
      }).sort({ updatedAt: -1 })
    );

    const progresses = await CourseProgress.find({
      user: me,
      course: { $in: courses.map((c) => c._id) }
    });

    const enriched = courses.map((c) => {
      const obj = c.toObject();
      const role = roleFor(c, me);
      const required = totalRequiredTasks(c);
      const prog = progresses.find((p) => p.course.toString() === c._id.toString());
      const completed = prog ? prog.completedTaskIds.length : 0;
      return {
        ...obj,
        myRole: role,
        progress: {
          required,
          completed: required ? Math.min(completed, required) : 0,
          pct: required ? Math.round((Math.min(completed, required) / required) * 100) : 0,
          isDone: !!prog?.completedAt
        }
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('List courses error:', error);
    res.status(500).json({ message: 'Server error listing courses' });
  }
});

router.post('/', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  const { title, summary, category, tags, estimatedMinutes } = req.body || {};
  try {
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    const course = await new Course({
      title: title.trim(),
      summary: (summary || '').trim(),
      category: (category || '').trim().slice(0, 40),
      tags: sanitizeTags(tags),
      estimatedMinutes: Number.isFinite(Number(estimatedMinutes)) ? Number(estimatedMinutes) : null,
      creator: req.user.id
    }).save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:new', { _id: populated._id, title: populated.title });

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ message: 'Server error creating course' });
  }
});

const stripCorrectAnswers = (courseObj, role) => {
  if (canEdit(role)) return courseObj;
  // Participants must not see quiz correct answers
  if (!Array.isArray(courseObj.lessons)) return courseObj;
  courseObj.lessons = courseObj.lessons.map((l) => ({
    ...l,
    tasks: (l.tasks || []).map((t) => {
      if (t.type === 'quiz') {
        const { correctIndex, ...rest } = t;
        return rest;
      }
      return t;
    })
  }));
  return courseObj;
};

router.get('/:id', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await populateCourse(Course.findById(req.params.id));
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const role = roleFor(course, req.user.id);
    if (!role && !course.isPublished) {
      return res.status(403).json({ message: 'Not authorized to view this course' });
    }

    const progress = await CourseProgress.findOne({ course: course._id, user: req.user.id });
    const required = totalRequiredTasks(course);
    const completed = progress ? progress.completedTaskIds.length : 0;

    const courseObj = stripCorrectAnswers(course.toObject(), role);

    res.json({
      ...courseObj,
      myRole: role,
      progress: {
        required,
        completed: required ? Math.min(completed, required) : 0,
        pct: required ? Math.round((Math.min(completed, required) / required) * 100) : 0,
        isDone: !!progress?.completedAt,
        completedTaskIds: progress?.completedTaskIds || [],
        responses: (progress?.responses || []).map((r) => ({
          taskId: r.taskId,
          text: r.text,
          choiceIndex: r.choiceIndex,
          isCorrect: r.isCorrect,
          attempts: r.attempts,
          submittedAt: r.submittedAt
        }))
      }
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ message: 'Server error fetching course' });
  }
});

router.put('/:id', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const role = roleFor(course, req.user.id);
    if (!canEdit(role)) return res.status(403).json({ message: 'Not authorized to edit this course' });

    const { title, summary, category, tags, estimatedMinutes, isPublished } = req.body || {};
    if (typeof title === 'string') {
      if (!title.trim()) return res.status(400).json({ message: 'Title cannot be empty' });
      course.title = title.trim();
    }
    if (typeof summary === 'string') course.summary = summary;
    if (typeof category === 'string') course.category = category.trim().slice(0, 40);
    if (Array.isArray(tags)) course.tags = sanitizeTags(tags);
    if (estimatedMinutes === null) course.estimatedMinutes = null;
    else if (Number.isFinite(Number(estimatedMinutes))) course.estimatedMinutes = Number(estimatedMinutes);
    if (typeof isPublished === 'boolean' && role === 'owner') course.isPublished = isPublished;

    await course.save();
    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ message: 'Server error updating course' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (roleFor(course, req.user.id) !== 'owner') {
      return res.status(403).json({ message: 'Only the owner can delete this course' });
    }
    await Course.findByIdAndDelete(course._id);
    await CourseProgress.deleteMany({ course: course._id });
    await Notification.deleteMany({ courseId: course._id });

    const io = req.app.get('socketio');
    if (io) io.emit('course:deleted', course._id);

    res.json({ message: 'Course removed' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ message: 'Server error deleting course' });
  }
});

/* ── Membership ────────────────────────────────────────────────────── */

router.post('/:id/members', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const myRole = roleFor(course, req.user.id);
    if (!canEdit(myRole)) return res.status(403).json({ message: 'Not authorized' });

    const { userIds = [], role } = req.body || {};
    if (!['manager', 'participant'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (role === 'manager' && myRole !== 'owner') {
      return res.status(403).json({ message: 'Only the owner can add managers' });
    }

    const ids = userIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const ownerId = course.creator.toString();
    const targetList = role === 'manager' ? course.managers : course.participants;
    const otherList = role === 'manager' ? course.participants : course.managers;

    const added = [];
    for (const id of ids) {
      const s = id.toString();
      if (s === ownerId) continue;
      if (targetList.some((x) => x.toString() === s)) continue;
      const otherIdx = otherList.findIndex((x) => x.toString() === s);
      if (otherIdx !== -1) otherList.splice(otherIdx, 1);
      targetList.push(id);
      added.push(id);
    }

    await course.save();
    const populated = await populateCourse(Course.findById(course._id));

    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    if (added.length) {
      const verb = role === 'manager' ? 'as a manager' : 'as a participant';
      await notify(
        io,
        added,
        `@${req.user.username} added you to "${course.title}" ${verb}.`,
        course._id,
        req.user.id
      );
    }

    res.json(populated);
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ message: 'Server error adding members' });
  }
});

router.delete('/:id/members/:userId', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const targetId = req.params.userId;
    const myRole = roleFor(course, req.user.id);
    const isSelf = targetId === req.user.id;

    if (targetId === course.creator.toString()) {
      return res.status(400).json({ message: 'Owner cannot be removed' });
    }

    const targetIsManager = course.managers.some((m) => m.toString() === targetId);
    const targetIsParticipant = course.participants.some((p) => p.toString() === targetId);
    if (!targetIsManager && !targetIsParticipant) {
      return res.status(404).json({ message: 'Member not found' });
    }

    let allowed = false;
    if (myRole === 'owner') allowed = true;
    else if (isSelf) allowed = true;                                    // self-leave
    else if (myRole === 'manager' && targetIsParticipant) allowed = true; // managers manage participants
    if (!allowed) {
      return res.status(403).json({
        message: targetIsManager
          ? 'Only the owner can remove managers'
          : 'Not authorized'
      });
    }

    course.managers = course.managers.filter((m) => m.toString() !== targetId);
    course.participants = course.participants.filter((p) => p.toString() !== targetId);
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error removing member' });
  }
});

// POST /:id/enroll — self-enroll on a published course
router.post('/:id/enroll', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const myRole = roleFor(course, req.user.id);
    if (myRole) {
      return res.status(400).json({ message: 'You are already enrolled' });
    }
    if (!course.isPublished) {
      return res.status(403).json({ message: 'This track is not open to self-enroll' });
    }

    course.participants.push(req.user.id);
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });

    // Notify owner + managers
    const recipients = [course.creator, ...course.managers];
    await notify(
      io,
      recipients,
      `@${req.user.username} enrolled in "${course.title}".`,
      course._id,
      req.user.id
    );

    res.json(populated);
  } catch (error) {
    console.error('Enroll error:', error);
    res.status(500).json({ message: 'Server error enrolling' });
  }
});

/* ── Lessons ────────────────────────────────────────────────────────── */

router.post('/:id/lessons', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, summary, estimatedMinutes, blocks, resources } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'Lesson title required' });

    course.lessons.push({
      title: title.trim(),
      summary: typeof summary === 'string' ? summary : '',
      estimatedMinutes: Number.isFinite(Number(estimatedMinutes)) ? Number(estimatedMinutes) : null,
      blocks: sanitizeBlocks(blocks),
      resources: sanitizeResources(resources),
      order: course.lessons.length,
      tasks: []
    });
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.status(201).json(populated);
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ message: 'Server error creating lesson' });
  }
});

router.put('/:id/lessons/:lessonId', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const { title, summary, estimatedMinutes, blocks, resources, content } = req.body || {};
    if (typeof title === 'string') {
      if (!title.trim()) return res.status(400).json({ message: 'Lesson title cannot be empty' });
      lesson.title = title.trim();
    }
    if (typeof summary === 'string') lesson.summary = summary;
    if (estimatedMinutes === null) lesson.estimatedMinutes = null;
    else if (Number.isFinite(Number(estimatedMinutes))) lesson.estimatedMinutes = Number(estimatedMinutes);
    if (Array.isArray(blocks)) lesson.blocks = sanitizeBlocks(blocks);
    if (Array.isArray(resources)) lesson.resources = sanitizeResources(resources);
    if (typeof content === 'string') lesson.content = content;
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ message: 'Server error updating lesson' });
  }
});

// PUT /:id/lessons/:lessonId/reorder — body: { direction: 'up' | 'down' }
router.put('/:id/lessons/:lessonId/reorder', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const idx = course.lessons.findIndex((l) => l._id.toString() === req.params.lessonId);
    if (idx === -1) return res.status(404).json({ message: 'Lesson not found' });

    const { direction } = req.body || {};
    let target = idx;
    if (direction === 'up') target = idx - 1;
    else if (direction === 'down') target = idx + 1;
    else return res.status(400).json({ message: 'Direction must be up or down' });

    if (target < 0 || target >= course.lessons.length) {
      return res.json(await populateCourse(Course.findById(course._id)));
    }

    const arr = course.lessons.toObject();
    const [moved] = arr.splice(idx, 1);
    arr.splice(target, 0, moved);
    arr.forEach((l, i) => { l.order = i; });
    course.lessons = arr;
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Reorder lesson error:', error);
    res.status(500).json({ message: 'Server error reordering lesson' });
  }
});

router.delete('/:id/lessons/:lessonId', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const removedTaskIds = lesson.tasks.map((t) => t._id.toString());
    lesson.deleteOne();
    course.lessons.forEach((l, idx) => { l.order = idx; });
    await course.save();

    if (removedTaskIds.length) {
      await CourseProgress.updateMany(
        { course: course._id },
        {
          $pull: {
            completedTaskIds: { $in: removedTaskIds },
            responses: { taskId: { $in: removedTaskIds } }
          }
        }
      );
    }

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ message: 'Server error deleting lesson' });
  }
});

/* ── Lesson tasks ──────────────────────────────────────────────────── */

router.post('/:id/lessons/:lessonId/tasks', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const { title } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'Task title required' });

    const task = lesson.tasks.create({
      title: title.trim(),
      order: lesson.tasks.length,
      type: 'check'
    });
    try {
      applyTaskPayload(task, req.body);
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }
    lesson.tasks.push(task);
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.status(201).json(populated);
  } catch (error) {
    console.error('Create lesson task error:', error);
    res.status(500).json({ message: 'Server error creating task' });
  }
});

router.put('/:id/lessons/:lessonId/tasks/:taskId', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    const task = lesson.tasks.id(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    try {
      applyTaskPayload(task, req.body);
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Update lesson task error:', error);
    res.status(500).json({ message: 'Server error updating task' });
  }
});

// PUT /:id/lessons/:lessonId/tasks/:taskId/reorder — body: { direction: 'up' | 'down' }
router.put('/:id/lessons/:lessonId/tasks/:taskId/reorder', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const idx = lesson.tasks.findIndex((t) => t._id.toString() === req.params.taskId);
    if (idx === -1) return res.status(404).json({ message: 'Task not found' });
    const { direction } = req.body || {};
    let target = idx;
    if (direction === 'up') target = idx - 1;
    else if (direction === 'down') target = idx + 1;
    else return res.status(400).json({ message: 'Direction must be up or down' });
    if (target < 0 || target >= lesson.tasks.length) {
      return res.json(await populateCourse(Course.findById(course._id)));
    }

    const arr = lesson.tasks.toObject();
    const [moved] = arr.splice(idx, 1);
    arr.splice(target, 0, moved);
    arr.forEach((t, i) => { t.order = i; });
    lesson.tasks = arr;
    await course.save();

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Reorder task error:', error);
    res.status(500).json({ message: 'Server error reordering task' });
  }
});

router.delete('/:id/lessons/:lessonId/tasks/:taskId', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    const task = lesson.tasks.id(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const taskId = task._id.toString();
    task.deleteOne();
    lesson.tasks.forEach((t, idx) => { t.order = idx; });
    await course.save();

    await CourseProgress.updateMany(
      { course: course._id },
      {
        $pull: {
          completedTaskIds: taskId,
          responses: { taskId }
        }
      }
    );

    const populated = await populateCourse(Course.findById(course._id));
    const io = req.app.get('socketio');
    if (io) io.emit('course:updated', { _id: populated._id });
    res.json(populated);
  } catch (error) {
    console.error('Delete lesson task error:', error);
    res.status(500).json({ message: 'Server error deleting task' });
  }
});

/* ── Progress ──────────────────────────────────────────────────────── */

// PUT /:id/progress — body: { taskId, completed?, response?, choiceIndex? }
router.put('/:id/progress', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const role = roleFor(course, req.user.id);
    if (!role) return res.status(403).json({ message: 'Not enrolled in this course' });

    const { taskId } = req.body || {};
    if (!taskId) return res.status(400).json({ message: 'taskId is required' });

    const { task } = findTaskInCourse(course, taskId);
    if (!task) return res.status(404).json({ message: 'Task not found in course' });

    let progress = await CourseProgress.findOne({ course: course._id, user: req.user.id });
    if (!progress) {
      progress = new CourseProgress({ course: course._id, user: req.user.id, completedTaskIds: [] });
    }

    const idStr = task._id.toString();
    const hasDone = progress.completedTaskIds.some((x) => x.toString() === idStr);

    let responseRecord = progress.responses.find((r) => r.taskId.toString() === idStr);
    const ensureResponse = () => {
      if (!responseRecord) {
        responseRecord = {
          taskId: task._id,
          text: '',
          choiceIndex: null,
          isCorrect: null,
          attempts: 0,
          submittedAt: new Date()
        };
        progress.responses.push(responseRecord);
        responseRecord = progress.responses[progress.responses.length - 1];
      }
      return responseRecord;
    };

    let quizFeedback = null;

    if (task.type === 'check') {
      const completed = !!req.body.completed;
      if (completed && !hasDone) progress.completedTaskIds.push(task._id);
      if (!completed && hasDone) {
        progress.completedTaskIds = progress.completedTaskIds.filter((x) => x.toString() !== idStr);
      }
    } else if (task.type === 'link') {
      // Marking as visited
      if (!hasDone) progress.completedTaskIds.push(task._id);
      const r = ensureResponse();
      r.submittedAt = new Date();
    } else if (task.type === 'response') {
      const text = typeof req.body.response === 'string' ? req.body.response.trim() : '';
      if (!text) return res.status(400).json({ message: 'Response cannot be empty' });
      const r = ensureResponse();
      r.text = text.slice(0, 4000);
      r.submittedAt = new Date();
      if (!hasDone) progress.completedTaskIds.push(task._id);
    } else if (task.type === 'quiz') {
      const choice = Number(req.body.choiceIndex);
      if (!Number.isInteger(choice) || choice < 0 || choice >= task.options.length) {
        return res.status(400).json({ message: 'Invalid choice' });
      }
      const isCorrect = task.correctIndex === choice;
      const r = ensureResponse();
      r.choiceIndex = choice;
      r.isCorrect = isCorrect;
      r.attempts = (r.attempts || 0) + 1;
      r.submittedAt = new Date();
      if (isCorrect && !hasDone) progress.completedTaskIds.push(task._id);
      if (!isCorrect && hasDone) {
        progress.completedTaskIds = progress.completedTaskIds.filter((x) => x.toString() !== idStr);
      }
      quizFeedback = { isCorrect, attempts: r.attempts };
    } else {
      return res.status(400).json({ message: 'Unsupported task type' });
    }

    const required = totalRequiredTasks(course);
    const completedCount = progress.completedTaskIds.length;
    const isDone = required > 0 && completedCount >= required;
    const wasDone = !!progress.completedAt;
    progress.completedAt = isDone ? (progress.completedAt || new Date()) : null;

    await progress.save();

    if (!wasDone && isDone) {
      const io = req.app.get('socketio');
      const recipients = [course.creator, ...course.managers];
      await notify(
        io,
        recipients,
        `@${req.user.username} completed the course "${course.title}".`,
        course._id,
        req.user.id
      );
    }

    res.json({
      required,
      completed: required ? Math.min(completedCount, required) : 0,
      pct: required ? Math.round((Math.min(completedCount, required) / required) * 100) : 0,
      isDone: !!progress.completedAt,
      completedTaskIds: progress.completedTaskIds,
      responses: progress.responses.map((r) => ({
        taskId: r.taskId,
        text: r.text,
        choiceIndex: r.choiceIndex,
        isCorrect: r.isCorrect,
        attempts: r.attempts,
        submittedAt: r.submittedAt
      })),
      quizFeedback
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Server error updating progress' });
  }
});

// GET /:id/roster — owner/manager only. Returns everyone with a role.
router.get('/:id/roster', protect, async (req, res) => {
  if (guard2fa(req, res)) return;
  try {
    const course = await populateCourse(Course.findById(req.params.id));
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (!canEdit(roleFor(course, req.user.id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const required = totalRequiredTasks(course);

    // Collect every enrolled member with their role
    const members = [];
    if (course.creator) members.push({ user: course.creator, role: 'owner' });
    for (const m of course.managers) members.push({ user: m, role: 'manager' });
    for (const p of course.participants) members.push({ user: p, role: 'participant' });

    const userIds = members.map((m) => m.user._id);
    const progresses = await CourseProgress.find({ course: course._id, user: { $in: userIds } });

    const rows = members.map((m) => {
      const prog = progresses.find((x) => x.user.toString() === m.user._id.toString());
      const completed = prog ? prog.completedTaskIds.length : 0;
      return {
        user: m.user,
        role: m.role,
        completed: required ? Math.min(completed, required) : 0,
        required,
        pct: required ? Math.round((Math.min(completed, required) / required) * 100) : 0,
        isDone: !!prog?.completedAt,
        completedAt: prog?.completedAt || null,
        startedAt: prog?.createdAt || null,
        responses: (prog?.responses || []).map((r) => ({
          taskId: r.taskId,
          text: r.text,
          choiceIndex: r.choiceIndex,
          isCorrect: r.isCorrect,
          attempts: r.attempts,
          submittedAt: r.submittedAt
        })),
        completedTaskIds: prog?.completedTaskIds || []
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Roster error:', error);
    res.status(500).json({ message: 'Server error fetching roster' });
  }
});

module.exports = router;
