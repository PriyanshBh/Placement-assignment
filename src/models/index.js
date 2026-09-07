const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const options = { timestamps: true, versionKey: false };

const Agent = models.Agent || model('Agent', new Schema({
  name: { type: String, required: true, trim: true, index: true }
}, options));

const User = models.User || model('User', new Schema({
  firstName: { type: String, required: true, trim: true, index: true },
  dob: Date,
  address: String,
  phoneNumber: { type: String, trim: true },
  state: String,
  zipCode: String,
  email: { type: String, trim: true, lowercase: true, sparse: true, index: true },
  gender: String,
  userType: String
}, options));

User.schema.index({ firstName: 'text', email: 'text' });

const Account = models.Account || model('Account', new Schema({
  accountName: { type: String, required: true, trim: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, options));

const Lob = models.Lob || model('Lob', new Schema({
  categoryName: { type: String, required: true, trim: true, unique: true }
}, options));

const Carrier = models.Carrier || model('Carrier', new Schema({
  companyName: { type: String, required: true, trim: true, unique: true }
}, options));

const Policy = models.Policy || model('Policy', new Schema({
  policyNumber: { type: String, required: true, trim: true, unique: true, index: true },
  policyStartDate: { type: Date, required: true },
  policyEndDate: { type: Date, required: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Lob', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Carrier', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true }
}, options));

const ScheduledMessage = models.ScheduledMessage || model('ScheduledMessage', new Schema({
  message: { type: String, required: true, trim: true },
  scheduledFor: { type: Date, required: true, index: true },
  timezone: { type: String, required: true },
  status: { type: String, enum: ['pending', 'processing', 'delivered', 'failed'], default: 'pending', index: true },
  deliveredAt: Date,
  failureReason: String
}, options));

const Message = models.Message || model('Message', new Schema({
  message: { type: String, required: true },
  scheduledMessageId: { type: Schema.Types.ObjectId, ref: 'ScheduledMessage', required: true, unique: true },
  insertedAt: { type: Date, default: Date.now }
}, options));

module.exports = { Agent, User, Account, Lob, Carrier, Policy, ScheduledMessage, Message };
