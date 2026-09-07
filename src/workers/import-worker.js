const { parentPort, workerData } = require('worker_threads');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const { connectDatabase, disconnectDatabase } = require('../db');
const { Agent, User, Account, Lob, Carrier, Policy } = require('../models');
const { normalizeRow, validateRow } = require('../services/import-map');

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function uniqueValues(rows, field) {
  return [...new Set(rows.map((row) => text(row[field])).filter(Boolean))];
}

function userIdentity(row) {
  const email = text(row.email).toLowerCase();
  return email
    ? { filter: { email }, key: `email:${email}` }
    : { filter: { firstName: text(row.firstName), phoneNumber: text(row.phoneNumber) }, key: `name:${text(row.firstName)}|phone:${text(row.phoneNumber)}` };
}

function docMap(docs, field) {
  return new Map(docs.map((doc) => [text(doc[field]), doc._id]));
}

async function upsertLookup(model, field, values) {
  if (!values.length) return new Map();
  await model.bulkWrite(values.map((value) => ({
    updateOne: {
      filter: { [field]: value },
      update: { $setOnInsert: { [field]: value } },
      upsert: true
    }
  })), { ordered: false });
  return docMap(await model.find({ [field]: { $in: values } }).select(`_id ${field}`).lean(), field);
}

async function importRows(rows) {
  const policyNumbers = uniqueValues(rows, 'policyNumber');
  const existingPolicies = new Set((await Policy.find({ policyNumber: { $in: policyNumbers } }).select('policyNumber').lean())
    .map((policy) => text(policy.policyNumber)));

  const [agents, categories, carriers] = await Promise.all([
    upsertLookup(Agent, 'name', uniqueValues(rows, 'agentName')),
    upsertLookup(Lob, 'categoryName', uniqueValues(rows, 'categoryName')),
    upsertLookup(Carrier, 'companyName', uniqueValues(rows, 'companyName'))
  ]);

  const userOperations = new Map();
  for (const row of rows) {
    const identity = userIdentity(row);
    userOperations.set(identity.key, {
      updateOne: {
        filter: identity.filter,
        update: {
          $set: {
            firstName: text(row.firstName),
            dob: row.dob,
            address: text(row.address),
            phoneNumber: text(row.phoneNumber),
            state: text(row.state),
            zipCode: text(row.zipCode),
            email: text(row.email).toLowerCase() || undefined,
            gender: text(row.gender),
            userType: text(row.userType)
          }
        },
        upsert: true
      }
    });
  }
  if (userOperations.size) await User.bulkWrite([...userOperations.values()], { ordered: false });

  const emailFilters = [];
  const fallbackFilters = [];
  for (const row of rows) {
    const identity = userIdentity(row);
    if (identity.filter.email) emailFilters.push(identity.filter.email);
    else fallbackFilters.push(identity.filter);
  }

  const userQuery = [];
  if (emailFilters.length) userQuery.push({ email: { $in: [...new Set(emailFilters)] } });
  if (fallbackFilters.length) userQuery.push(...fallbackFilters);
  const users = userQuery.length
    ? await User.find({ $or: userQuery }).select('_id firstName phoneNumber email').lean()
    : [];
  const userMap = new Map(users.map((user) => {
    const email = text(user.email).toLowerCase();
    return [email ? `email:${email}` : `name:${text(user.firstName)}|phone:${text(user.phoneNumber)}`, user._id];
  }));

  const accountOperations = new Map();
  for (const row of rows) {
    const userId = userMap.get(userIdentity(row).key);
    const accountName = text(row.accountName);
    accountOperations.set(`${accountName}|${userId}`, {
      updateOne: {
        filter: { accountName, userId },
        update: { $setOnInsert: { accountName, userId } },
        upsert: true
      }
    });
  }
  if (accountOperations.size) await Account.bulkWrite([...accountOperations.values()], { ordered: false });

  const accounts = await Account.find({
    $or: rows.map((row) => ({ accountName: text(row.accountName), userId: userMap.get(userIdentity(row).key) }))
  }).select('_id accountName userId').lean();
  const accountMap = new Map(accounts.map((account) => [`${text(account.accountName)}|${account.userId}`, account._id]));

  await Policy.bulkWrite(rows.map((row) => {
    const userId = userMap.get(userIdentity(row).key);
    return {
      updateOne: {
        filter: { policyNumber: text(row.policyNumber) },
        update: {
          $set: {
            policyStartDate: row.policyStartDate,
            policyEndDate: row.policyEndDate,
            categoryId: categories.get(text(row.categoryName)),
            companyId: carriers.get(text(row.companyName)),
            userId,
            agentId: agents.get(text(row.agentName)),
            accountId: accountMap.get(`${text(row.accountName)}|${userId}`)
          },
          $setOnInsert: { policyNumber: text(row.policyNumber) }
        },
        upsert: true
      }
    };
  }), { ordered: false });

  return { created: policyNumbers.filter((policyNumber) => !existingPolicies.has(policyNumber)).length, updated: policyNumbers.filter((policyNumber) => existingPolicies.has(policyNumber)).length, rows: rows.length };
}

async function run() {
  const workbook = new ExcelJS.Workbook();
  if (workerData.extension === '.csv') {
    await workbook.csv.readFile(workerData.filePath);
  } else {
    const buffer = await fs.readFile(workerData.filePath);
    await workbook.xlsx.load(buffer);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The uploaded workbook has no worksheets.');
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column] = String(cell.text || '').trim(); });
  const rawRows = [];
  sheet.eachRow((sheetRow, rowNumber) => {
    if (rowNumber === 1) return;
    const row = {};
    headers.forEach((header, column) => {
      if (!header) return;
      const cell = sheetRow.getCell(column);
      row[header] = cell.value instanceof Date ? cell.value : cell.text;
    });
    if (Object.values(row).some((value) => String(value).trim())) rawRows.push(row);
  });
  if (!rawRows.length) throw new Error('The uploaded file has no data rows.');

  const valid = [];
  const errors = [];
  rawRows.forEach((raw, position) => {
    const result = validateRow(normalizeRow(raw), position + 2);
    if (result.error) errors.push(result.error);
    else valid.push(result.value);
  });
  if (errors.length) {
    const error = new Error(`Import validation failed for ${errors.length} row(s).`);
    error.details = errors.slice(0, 50);
    throw error;
  }

  await connectDatabase(workerData.mongoUri);
  parentPort.postMessage({ type: 'progress', processed: 0, total: valid.length });
  const totals = await importRows(valid);
  parentPort.postMessage({ type: 'progress', processed: valid.length, total: valid.length });
  await disconnectDatabase();
  return totals;
}

run()
  .then((result) => parentPort.postMessage({ type: 'complete', result }))
  .catch(async (error) => {
    await disconnectDatabase().catch(() => {});
    parentPort.postMessage({ type: 'error', error: error.message, details: error.details || [] });
  });
