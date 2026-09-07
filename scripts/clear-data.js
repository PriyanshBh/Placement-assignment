require('dotenv').config({ quiet: true });

const { connectDatabase, disconnectDatabase } = require('../src/db');
const { Agent, User, Account, Lob, Carrier, Policy, ScheduledMessage, Message } = require('../src/models');

async function main() {
  if (process.env.CONFIRM_CLEAR_DATA !== 'yes') {
    throw new Error('Refusing to clear data. Run with CONFIRM_CLEAR_DATA=yes after verifying MONGODB_URI.');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  await connectDatabase(process.env.MONGODB_URI);
  const collections = [Policy, Account, User, Agent, Lob, Carrier, ScheduledMessage, Message];
  const result = {};
  for (const model of collections) {
    const deleted = await model.deleteMany({});
    result[model.collection.collectionName] = deleted.deletedCount;
  }
  console.log(JSON.stringify({ success: true, deleted: result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => {});
  });
