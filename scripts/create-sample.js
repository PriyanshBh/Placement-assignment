const ExcelJS = require('exceljs');
const path = require('path');

const rows = [
  { 'Agent Name': 'Avery Brooks', 'First Name': 'Olivia', DOB: '1991-04-18', Address: '142 Cedar Lane', 'Phone Number': '415-555-0138', State: 'California', 'Zip Code': '94107', Email: 'olivia@example.com', Gender: 'Female', 'User Type': 'Individual', 'Account Name': 'Olivia Family Account', 'Category Name': 'Home', 'Company Name': 'Horizon Mutual', 'Policy Number': 'HM-20481', 'Policy Start Date': '2026-01-10', 'Policy End Date': '2027-01-09' },
  { 'Agent Name': 'Avery Brooks', 'First Name': 'Olivia', DOB: '1991-04-18', Address: '142 Cedar Lane', 'Phone Number': '415-555-0138', State: 'California', 'Zip Code': '94107', Email: 'olivia@example.com', Gender: 'Female', 'User Type': 'Individual', 'Account Name': 'Olivia Family Account', 'Category Name': 'Auto', 'Company Name': 'Atlas Assurance', 'Policy Number': 'AA-81726', 'Policy Start Date': '2026-05-01', 'Policy End Date': '2027-04-30' },
  { 'Agent Name': 'Maya Chen', 'First Name': 'Ethan', DOB: '1987-11-02', Address: '88 Mercer Street', 'Phone Number': '212-555-0177', State: 'New York', 'Zip Code': '10012', Email: 'ethan@example.com', Gender: 'Male', 'User Type': 'Business', 'Account Name': 'Ethan Studio LLC', 'Category Name': 'Commercial', 'Company Name': 'Northstar Insurance', 'Policy Number': 'NI-55092', 'Policy Start Date': '2026-03-15', 'Policy End Date': '2027-03-14' },
  { 'Agent Name': 'Noah Williams', 'First Name': 'Sophia', DOB: '1995-08-23', Address: '716 Willow Drive', 'Phone Number': '312-555-0114', State: 'Illinois', 'Zip Code': '60611', Email: 'sophia@example.com', Gender: 'Female', 'User Type': 'Individual', 'Account Name': 'Sophia Personal', 'Category Name': 'Life', 'Company Name': 'Horizon Mutual', 'Policy Number': 'HM-99314', 'Policy Start Date': '2025-12-01', 'Policy End Date': '2026-11-30' },
  { 'Agent Name': 'Maya Chen', 'First Name': 'Liam', DOB: '1979-02-10', Address: '21 Lakeview Avenue', 'Phone Number': '206-555-0190', State: 'Washington', 'Zip Code': '98101', Email: 'liam@example.com', Gender: 'Male', 'User Type': 'Individual', 'Account Name': 'Liam Household', 'Category Name': 'Health', 'Company Name': 'Summit Health Co', 'Policy Number': 'SH-34810', 'Policy Start Date': '2026-07-01', 'Policy End Date': '2027-06-30' }
];

async function createSample() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PolicyPulse';
  const sheet = workbook.addWorksheet('Policies', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = Object.keys(rows[0]).map((header) => ({ header, key: header, width: Math.max(header.length + 3, 18) }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15283A' } };
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}` };
  const output = path.join(__dirname, '..', 'public', 'sample-policy-data.xlsx');
  await workbook.xlsx.writeFile(output);
  console.log(`Created ${output}`);
}

createSample().catch((error) => { console.error(error); process.exit(1); });
