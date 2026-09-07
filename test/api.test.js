process.env.NODE_ENV = 'test';
process.env.CPU_MONITOR_ENABLED = 'false';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDatabase, disconnectDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { ScheduledMessage, Message } = require('../src/models');
const { deliverDueMessages } = require('../src/services/scheduler');

let mongo;
let app;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('policy_pulse_test');
  require('../src/config').mongoUri = process.env.MONGODB_URI;
  await connectDatabase(process.env.MONGODB_URI);
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
  await mongo.stop();
});

test('health endpoint reports the supervised process', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.pid, 'number');
});

test('XLSX import runs through worker and normalizes all six collections', async () => {
  const response = await request(app)
    .post('/api/upload')
    .attach('file', path.join(__dirname, '..', 'public', 'sample-policy-data.xlsx'))
    .expect(201);
  assert.equal(response.body.rows, 5);
  assert.equal(response.body.created, 5);

  const dashboard = await request(app).get('/api/dashboard').expect(200);
  assert.deepEqual(
    { users: dashboard.body.totals.users, policies: dashboard.body.totals.policies, agents: dashboard.body.totals.agents, accounts: dashboard.body.totals.accounts, lobs: dashboard.body.totals.lobs, carriers: dashboard.body.totals.carriers },
    { users: 4, policies: 5, agents: 3, accounts: 4, lobs: 5, carriers: 4 }
  );
});

test('repeat import is idempotent and updates existing policies', async () => {
  const response = await request(app)
    .post('/api/upload')
    .attach('file', path.join(__dirname, '..', 'public', 'sample-policy-data.xlsx'))
    .expect(201);
  assert.equal(response.body.created, 0);
  assert.equal(response.body.updated, 5);
});

test('username search returns fully populated policy information', async () => {
  const response = await request(app).get('/api/policies/search').query({ username: 'Olivia' }).expect(200);
  assert.equal(response.body.count, 2);
  assert.equal(response.body.data[0].userId.firstName, 'Olivia');
  assert.ok(response.body.data[0].categoryId.categoryName);
  assert.ok(response.body.data[0].companyId.companyName);
  assert.ok(response.body.data[0].agentId.name);
});

test('aggregation groups policies by user', async () => {
  const response = await request(app).get('/api/policies/aggregate').expect(200);
  const olivia = response.body.data.find((item) => item.firstName === 'Olivia');
  assert.equal(olivia.totalPolicies, 2);
});

test('due scheduler inserts message into delivery collection', async () => {
  const scheduled = await ScheduledMessage.create({ message: 'Assessment reminder', scheduledFor: new Date(Date.now() - 1000), timezone: 'Asia/Kolkata' });
  await deliverDueMessages();
  const message = await Message.findOne({ scheduledMessageId: scheduled._id });
  const updated = await ScheduledMessage.findById(scheduled._id);
  assert.equal(message.message, 'Assessment reminder');
  assert.equal(updated.status, 'delivered');
});
