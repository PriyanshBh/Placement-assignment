const aliases = {
  agentName: ['agent', 'agent name', 'agent_name'],
  firstName: ['firstname', 'first name', 'first_name', 'user name', 'username'],
  dob: ['dob', 'date of birth', 'date_of_birth'],
  address: ['address'],
  phoneNumber: ['phone', 'phone number', 'phone_number', 'mobile'],
  state: ['state'],
  zipCode: ['zip', 'zip code', 'zip_code', 'zipcode', 'postal code'],
  email: ['email', 'email address', 'email_address'],
  gender: ['gender'],
  userType: ['user type', 'user_type', 'usertype'],
  accountName: ['account name', 'account_name', 'accountname'],
  categoryName: ['category name', 'category_name', 'lob', 'policy category'],
  companyName: ['company name', 'company_name', 'carrier', 'policy carrier'],
  policyNumber: ['policy number', 'policy_number', 'policynumber'],
  policyStartDate: ['policy start date', 'policy_start_date', 'policy start', 'start date'],
  policyEndDate: ['policy end date', 'policy_end_date', 'policy end', 'end date']
};

function cleanKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizeRow(raw) {
  const lookup = Object.fromEntries(Object.entries(raw).map(([key, value]) => [cleanKey(key), value]));
  const row = {};
  for (const [field, names] of Object.entries(aliases)) {
    const match = names.map(cleanKey).find((name) => lookup[name] !== undefined);
    row[field] = match ? lookup[match] : undefined;
  }
  return row;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function validateRow(row, index) {
  const required = ['agentName', 'firstName', 'accountName', 'categoryName', 'companyName', 'policyNumber', 'policyStartDate', 'policyEndDate'];
  const missing = required.filter((field) => row[field] === undefined || String(row[field]).trim() === '');
  const start = parseDate(row.policyStartDate);
  const end = parseDate(row.policyEndDate);
  if (missing.length) return { error: `Row ${index}: missing ${missing.join(', ')}` };
  if (!start || !end) return { error: `Row ${index}: invalid policy date` };
  if (end < start) return { error: `Row ${index}: policy end date is before start date` };
  return { value: { ...row, policyStartDate: start, policyEndDate: end, dob: parseDate(row.dob) } };
}

module.exports = { normalizeRow, validateRow, aliases };
