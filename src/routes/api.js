const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { z } = require('zod');
const config = require('../config');
const asyncHandler = require('../utils/async-handler');
const { runImport } = require('../services/import-service');
const { User, Policy, ScheduledMessage, Message, Agent, Account, Lob, Carrier } = require('../models');
const { systemSnapshot } = require('../services/cpu-monitor');

const router = express.Router();
const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, callback) => callback(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(extension === '.xlsx' || extension === '.csv' ? null : new Error('Only .xlsx and .csv files are accepted.'), true);
  }
});

function regexSafe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/health', (_req, res) => res.json({ success: true, database: 'connected', ...systemSnapshot() }));

router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Please attach an XLSX or CSV file in the file field.' });
  try {
    const result = await runImport(req.file.path, path.extname(req.file.originalname).toLowerCase(), config.mongoUri);
    return res.status(201).json({ success: true, message: 'Policy data imported successfully.', ...result });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
}));

router.get('/policies/search', asyncHandler(async (req, res) => {
  const query = String(req.query.username || req.query.q || '').trim();
  if (query.length < 2) return res.status(400).json({ success: false, message: 'username must contain at least 2 characters.' });
  const matcher = new RegExp(regexSafe(query), 'i');
  const users = await User.find({ $or: [{ firstName: matcher }, { email: matcher }] }).select('_id');
  const policies = await Policy.find({ userId: { $in: users.map((user) => user._id) } })
    .populate('userId', 'firstName email phoneNumber state')
    .populate('agentId', 'name').populate('accountId', 'accountName')
    .populate('categoryId', 'categoryName').populate('companyId', 'companyName')
    .sort({ policyStartDate: -1 }).lean();
  res.json({ success: true, count: policies.length, data: policies });
}));

router.get('/policies/aggregate', asyncHandler(async (_req, res) => {
  const data = await Policy.aggregate([
    { $group: {
      _id: '$userId', totalPolicies: { $sum: 1 },
      activePolicies: { $sum: { $cond: [{ $and: [{ $lte: ['$policyStartDate', '$$NOW'] }, { $gte: ['$policyEndDate', '$$NOW'] }] }, 1, 0] } },
      earliestStart: { $min: '$policyStartDate' }, latestEnd: { $max: '$policyEndDate' },
      policyIds: { $push: '$_id' }
    } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { _id: 0, userId: '$_id', firstName: '$user.firstName', email: '$user.email', totalPolicies: 1, activePolicies: 1, earliestStart: 1, latestEnd: 1 } },
    { $sort: { totalPolicies: -1, firstName: 1 } }
  ]);
  res.json({ success: true, count: data.length, data });
}));

router.get('/dashboard', asyncHandler(async (_req, res) => {
  const now = new Date();
  const [users, policies, agents, accounts, lobs, carriers, activePolicies, expiring, recentPolicies, scheduled] = await Promise.all([
    User.countDocuments(), Policy.countDocuments(), Agent.countDocuments(), Account.countDocuments(), Lob.countDocuments(), Carrier.countDocuments(),
    Policy.countDocuments({ policyStartDate: { $lte: now }, policyEndDate: { $gte: now } }),
    Policy.countDocuments({ policyEndDate: { $gte: now, $lte: new Date(now.valueOf() + 30 * 86400000) } }),
    Policy.find().populate('userId', 'firstName').populate('companyId', 'companyName').populate('categoryId', 'categoryName').sort({ createdAt: -1 }).limit(6).lean(),
    ScheduledMessage.find().sort({ scheduledFor: -1 }).limit(5).lean()
  ]);
  res.json({ success: true, totals: { users, policies, agents, accounts, lobs, carriers, activePolicies, expiring }, recentPolicies, scheduled });
}));

const scheduleSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

router.post('/messages/schedule', asyncHandler(async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Provide message, day (YYYY-MM-DD), and time (HH:mm).', details: parsed.error.issues });
  const scheduledFor = new Date(`${parsed.data.day}T${parsed.data.time}:00`);
  if (Number.isNaN(scheduledFor.valueOf()) || scheduledFor <= new Date()) return res.status(400).json({ success: false, message: 'Scheduled day and time must be in the future.' });
  const item = await ScheduledMessage.create({ message: parsed.data.message, scheduledFor, timezone: config.timezone });
  res.status(201).json({ success: true, message: 'Message scheduled successfully.', data: item });
}));

router.get('/messages', asyncHandler(async (_req, res) => {
  const [scheduled, delivered] = await Promise.all([
    ScheduledMessage.find().sort({ scheduledFor: -1 }).limit(50).lean(),
    Message.find().sort({ insertedAt: -1 }).limit(50).lean()
  ]);
  res.json({ success: true, scheduled, delivered });
}));

module.exports = router;
