const cron = require('node-cron');
const { ScheduledMessage, Message } = require('../models');

async function deliverDueMessages() {
  const due = await ScheduledMessage.find({ status: 'pending', scheduledFor: { $lte: new Date() } })
    .sort({ scheduledFor: 1 }).limit(50);
  for (const item of due) {
    const locked = await ScheduledMessage.findOneAndUpdate(
      { _id: item._id, status: 'pending' }, { $set: { status: 'processing' } }, { new: true }
    );
    if (!locked) continue;
    try {
      await Message.create({ message: item.message, scheduledMessageId: item._id, insertedAt: new Date() });
      await ScheduledMessage.updateOne({ _id: item._id }, { $set: { status: 'delivered', deliveredAt: new Date() } });
    } catch (error) {
      await ScheduledMessage.updateOne({ _id: item._id }, {
        $set: { status: 'failed', failureReason: error.message.slice(0, 300) }
      });
    }
  }
}

function startScheduler() {
  deliverDueMessages().catch(console.error);
  const task = cron.schedule('* * * * * *', () => deliverDueMessages().catch(console.error));
  return () => task.stop();
}

module.exports = { startScheduler, deliverDueMessages };
