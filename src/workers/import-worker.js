const { parentPort, workerData } = require('worker_threads');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const { connectDatabase, disconnectDatabase } = require('../db');
const { Agent, User, Account, Lob, Carrier, Policy } = require('../models');
const { normalizeRow, validateRow } = require('../services/import-map');

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

async function importRow(row) {
  const agent = await Agent.findOneAndUpdate(
    { name: text(row.agentName) }, { $setOnInsert: { name: text(row.agentName) } }, { upsert: true, new: true }
  );
  const category = await Lob.findOneAndUpdate(
    { categoryName: text(row.categoryName) }, { $setOnInsert: { categoryName: text(row.categoryName) } }, { upsert: true, new: true }
  );
  const carrier = await Carrier.findOneAndUpdate(
    { companyName: text(row.companyName) }, { $setOnInsert: { companyName: text(row.companyName) } }, { upsert: true, new: true }
  );

  const identity = text(row.email)
    ? { email: text(row.email).toLowerCase() }
    : { firstName: text(row.firstName), phoneNumber: text(row.phoneNumber) };
  const user = await User.findOneAndUpdate(identity, {
    $set: {
      firstName: text(row.firstName), dob: row.dob, address: text(row.address),
      phoneNumber: text(row.phoneNumber), state: text(row.state), zipCode: text(row.zipCode),
      email: text(row.email).toLowerCase() || undefined, gender: text(row.gender), userType: text(row.userType)
    }
  }, { upsert: true, new: true, runValidators: true });

  const account = await Account.findOneAndUpdate(
    { accountName: text(row.accountName), userId: user._id },
    { $setOnInsert: { accountName: text(row.accountName), userId: user._id } },
    { upsert: true, new: true }
  );

  const existing = await Policy.exists({ policyNumber: text(row.policyNumber) });
  await Policy.findOneAndUpdate({ policyNumber: text(row.policyNumber) }, {
    $set: {
      policyStartDate: row.policyStartDate, policyEndDate: row.policyEndDate,
      categoryId: category._id, companyId: carrier._id, userId: user._id,
      agentId: agent._id, accountId: account._id
    },
    $setOnInsert: { policyNumber: text(row.policyNumber) }
  }, { upsert: true, runValidators: true });
  return existing ? 'updated' : 'created';
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
  const totals = { created: 0, updated: 0, rows: valid.length };
  for (let index = 0; index < valid.length; index += 1) {
    const outcome = await importRow(valid[index]);
    totals[outcome] += 1;
    if ((index + 1) % 25 === 0) parentPort.postMessage({ type: 'progress', processed: index + 1, total: valid.length });
  }
  await disconnectDatabase();
  return totals;
}

run()
  .then((result) => parentPort.postMessage({ type: 'complete', result }))
  .catch(async (error) => {
    await disconnectDatabase().catch(() => {});
    parentPort.postMessage({ type: 'error', error: error.message, details: error.details || [] });
  });
