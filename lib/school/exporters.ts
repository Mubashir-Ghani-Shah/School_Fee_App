import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { SCHOOL_MONTHS, currency, formatDate, todayKarachi } from './calendar';
import { schoolDb } from './database';

const safe = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/,/g, ' ');
const writeAndShare = async (name: string, content: string, mimeType: string) => {
  const uri = `${FileSystem.documentDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType });
  return uri;
};

export async function exportDailyReport(format: 'csv' | 'txt' | 'xlsx' = 'csv', date = todayKarachi()) {
  const settings = await schoolDb.settings();
  const payments = await schoolDb.payments(date);
  const expenses = await schoolDb.expenses(date);
  const totalPayments = payments.reduce((sum: number, row: any) => sum + row.amount, 0);
  const totalExpenses = expenses.reduce((sum: number, row: any) => sum + row.amount, 0);
  const stamp = date.replace(/-/g, '');

  if (format === 'txt') {
    const lines = [
      settings.schoolName,
      'SCHOOL DAILY CASH REPORT',
      `Date: ${formatDate(date)}`,
      '',
      'FEE COLLECTION',
      ...payments.map((row: any) => `${row.name} | ${row.class_name} | ${currency(row.amount, settings.currency)} | ${row.method}`),
      `Total Collection: ${currency(totalPayments, settings.currency)}`,
      '',
      'EXPENSES',
      ...expenses.map((row: any) => `${row.name} | ${currency(row.amount, settings.currency)} | ${row.category}`),
      `Total Expenses: ${currency(totalExpenses, settings.currency)}`,
      `NET CASH: ${currency(totalPayments - totalExpenses, settings.currency)}`,
    ];
    return writeAndShare(`Daily_Cash_Report_${stamp}.txt`, lines.join('\n'), 'text/plain');
  }

  if (format === 'xlsx') {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payments.map((row: any) => ({ Student: row.name, Class: row.class_name, Amount: row.amount, Method: row.method, Date: row.payment_date, Allocation: row.allocations || '' }))), 'Fee Collection');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenses.map((row: any) => ({ Expense: row.name, Category: row.category, Amount: row.amount, Date: row.expense_date, Notes: row.notes || '' }))), 'Expenses');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ TotalCollection: totalPayments, TotalExpenses: totalExpenses, NetCash: totalPayments - totalExpenses }]), 'Summary');
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const uri = `${FileSystem.documentDirectory}Daily_Cash_Report_${stamp}.xlsx`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return uri;
  }

  const rows = [
    'Section,Name,Class,Amount,Method/Category,Date',
    ...payments.map((row: any) => `Payment,${safe(row.name)},${safe(row.class_name)},${row.amount},${safe(row.method)},${row.payment_date}`),
    ...expenses.map((row: any) => `Expense,${safe(row.name)},,${row.amount},${safe(row.category)},${row.expense_date}`),
    `Total Collection,,,${totalPayments},,`,
    `Total Expenses,,,${totalExpenses},,`,
    `Net Cash,,,${totalPayments - totalExpenses},,`,
  ];
  return writeAndShare(`Daily_Cash_Report_${stamp}.csv`, rows.join('\n'), 'text/csv');
}

export async function exportStudentHistory(studentId: string) {
  const history = await schoolDb.studentHistory(studentId);
  const rows = [
    'Month,Fee Due,Additional Fee,Paid,Remaining,Status',
    ...history.months.map((row) => `${SCHOOL_MONTHS.find((month) => month.key === row.monthKey)?.label},${row.baseFee},${row.additionalFee},${row.paidAmount},${row.remaining},${row.status}`),
    '',
    'Date,Amount,Method,Allocation',
    ...history.payments.map((row: any) => `${row.payment_date},${row.amount},${row.method},${safe(row.allocations)}`),
  ];
  return writeAndShare(`Student_History_${safe(history.student.name)}_${history.student.className}.csv`, rows.join('\n'), 'text/csv');
}

export async function pickExcelImportPreview() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: 'base64' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  const valid = rows.filter((row) => safe(row.Student_Name || row.Name).trim() && safe(row.Class).trim());
  const invalid = rows.length - valid.length;
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const row of valid) {
    const key = `${safe(row.Student_Name || row.Name).toLowerCase()}-${safe(row.Class).toLowerCase()}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return { fileName: file.name, sheetName, rows: valid, studentsFound: valid.length, invalidRows: invalid, duplicateStudents: duplicates.size };
}

export async function importExcelRows(rows: Record<string, unknown>[]) {
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = safe(row.Student_Name || row.Name);
    const className = safe(row.Class);
    const monthlyFee = Number(row.Fee || row.Monthly_Fee || 0);
    if (!name || !className || monthlyFee <= 0) {
      skipped += 1;
      continue;
    }
    const matches = await schoolDb.findStudents(name, className);
    if (matches.length > 0) {
      skipped += 1;
      continue;
    }
    const balances = Object.fromEntries(SCHOOL_MONTHS.map((month) => [month.key, Number(row[month.excelKey])]));
    await schoolDb.addStudentWithImportedBalances({ rno: safe(row.RNo), name, className, monthlyFee, category: safe(row.Category) || 'Normal', status: 'Active', admissionDate: todayKarachi(), notes: 'Imported from Excel preview.' }, balances);
    imported += 1;
  }
  return { imported, skipped };
}
