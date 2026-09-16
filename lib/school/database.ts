import * as SQLite from 'expo-sqlite';
import { SCHOOL_MONTHS, getCurrentAcademicMonthIndex, nowKarachiIso, todayKarachi } from './calendar';
import { createPaymentPreview, withStatus } from './feeLogic';
import type { AdditionalFee, AllocationPreview, Expense, MonthlyFee, MonthlyFeeStatus, Payment, PaymentAllocation, PaymentMethod, Settings, Student, StudentStatus } from './types';

const DB_NAME = 'school_fee_cash.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const clean = (value: unknown) => String(value ?? '').trim();
const positive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
};

async function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  const db = await dbPromise;
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY NOT NULL,
      rno TEXT NOT NULL,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      monthly_fee REAL NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      admission_date TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_students_search ON students(name, class_name, rno);
    CREATE TABLE IF NOT EXISTS student_monthly_fees (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      month_key TEXT NOT NULL,
      base_fee REAL NOT NULL,
      additional_fee REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, month_key)
    );
    CREATE INDEX IF NOT EXISTS idx_monthly_student ON student_monthly_fees(student_id, month_key);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL,
      reference TEXT NOT NULL,
      notes TEXT NOT NULL,
      transaction_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
    CREATE TABLE IF NOT EXISTS payment_allocations (
      id TEXT PRIMARY KEY NOT NULL,
      payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      month_key TEXT NOT NULL,
      amount REAL NOT NULL,
      before_remaining REAL NOT NULL,
      after_remaining REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS additional_fees (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      month_key TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      student_id TEXT,
      amount REAL,
      old_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM settings');
  if ((count?.count ?? 0) === 0) await seed(db);
}

async function seed(db: SQLite.SQLiteDatabase) {
  const settings: Settings = {
    schoolName: 'School Fee Office',
    schoolAddress: 'Update address in Settings',
    phone: '',
    academicYear: '2026-2027',
    defaultMonthlyFee: 1400,
    currentFeeMonthIndex: getCurrentAcademicMonthIndex(),
    currency: 'Rs.',
    role: 'Admin',
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.runAsync('INSERT INTO settings(key, value) VALUES (?, ?)', key, String(value));
  }
  const samples = [
    { rno: '101', name: 'Ali Ghani', className: '8th', monthlyFee: 1400, category: 'Normal' },
    { rno: '102', name: 'Ahmed Khan', className: '7th', monthlyFee: 1400, category: 'Teacher' },
    { rno: '103', name: 'Usman Raza', className: '8th', monthlyFee: 1200, category: 'Orphan' },
  ];
  for (const sample of samples) {
    await insertStudent(db, { ...sample, status: 'Active', admissionDate: '2026-04-01', notes: '' }, true);
  }
}

async function audit(db: SQLite.SQLiteDatabase, action: string, description: string, studentId = '', amount = 0, oldValue = '', newValue = '') {
  await db.runAsync(
    'INSERT INTO audit_logs(id, created_at, user, action, student_id, amount, old_value, new_value, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id('aud'), nowKarachiIso(), 'local-admin', action, studentId, amount, oldValue, newValue, description,
  );
}

async function insertStudent(db: SQLite.SQLiteDatabase, input: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>, skipAudit = false) {
  if (!clean(input.name)) throw new Error('Student name cannot be empty.');
  if (!clean(input.className)) throw new Error('Class cannot be empty.');
  positive(input.monthlyFee, 'Monthly fee');
  const studentId = id('stu');
  const createdAt = nowKarachiIso();
  await db.runAsync(
    'INSERT INTO students(id, rno, name, class_name, monthly_fee, category, status, admission_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    studentId, clean(input.rno), clean(input.name), clean(input.className), input.monthlyFee, clean(input.category) || 'Normal', input.status, input.admissionDate || todayKarachi(), clean(input.notes), createdAt, createdAt,
  );
  for (const month of SCHOOL_MONTHS) {
    await db.runAsync(
      'INSERT INTO student_monthly_fees(id, student_id, month_key, base_fee, additional_fee, paid_amount, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)',
      id('fee'), studentId, month.key, input.monthlyFee, createdAt, createdAt,
    );
  }
  if (!skipAudit) await audit(db, 'STUDENT_CREATED', `Created student ${input.name}`, studentId, input.monthlyFee);
  return studentId;
}

const mapStudent = (row: any): Student => ({
  id: row.id, rno: row.rno, name: row.name, className: row.class_name, monthlyFee: row.monthly_fee,
  category: row.category, status: row.status, admissionDate: row.admission_date, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapMonth = (row: any): MonthlyFeeStatus => withStatus({ id: row.id, studentId: row.student_id, monthKey: row.month_key, baseFee: row.base_fee, additionalFee: row.additional_fee, paidAmount: row.paid_amount, createdAt: row.created_at, updatedAt: row.updated_at });

export const schoolDb = {
  async settings(): Promise<Settings> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const data = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      schoolName: data.schoolName || 'School Fee Office', schoolAddress: data.schoolAddress || '', phone: data.phone || '', academicYear: data.academicYear || '2026-2027',
      defaultMonthlyFee: Number(data.defaultMonthlyFee || 1400), currentFeeMonthIndex: Number(data.currentFeeMonthIndex ?? 5), currency: data.currency || 'Rs.', role: (data.role as Settings['role']) || 'Admin',
    };
  },
  async saveSettings(input: Settings) {
    const db = await getDb();
    for (const [key, value] of Object.entries(input)) await db.runAsync('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', key, String(value));
    await audit(db, 'SETTINGS_UPDATED', 'Updated school settings');
  },
  async addStudent(input: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) {
    const db = await getDb();
    let studentId = '';
    await db.withTransactionAsync(async () => {
      studentId = await insertStudent(db, input);
    });
    return studentId;
  },
  async addStudentWithImportedBalances(input: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>, outstandingByMonth: Record<string, number>) {
    const db = await getDb();
    let studentId = '';
    await db.withTransactionAsync(async () => {
      studentId = await insertStudent(db, input);
      for (const month of SCHOOL_MONTHS) {
        const outstanding = outstandingByMonth[month.key];
        if (!Number.isFinite(outstanding)) continue;
        const paidAmount = Math.max(0, input.monthlyFee - Math.max(0, outstanding));
        await db.runAsync('UPDATE student_monthly_fees SET paid_amount = ?, updated_at = ? WHERE student_id = ? AND month_key = ?', paidAmount, nowKarachiIso(), studentId, month.key);
      }
      await audit(db, 'EXCEL_IMPORT_STUDENT', 'Imported student and preserved monthly outstanding balances', studentId);
    });
    return studentId;
  },
  async updateStudent(studentId: string, input: Partial<Student>) {
    const db = await getDb();
    const existingRow = await db.getFirstAsync('SELECT * FROM students WHERE id = ?', studentId);
    if (!existingRow) throw new Error('Student was not found.');
    const existing = mapStudent(existingRow);
    const next = { ...existing, ...input };
    if (input.name !== undefined && !clean(input.name)) throw new Error('Student name cannot be empty.');
    if (input.className !== undefined && !clean(input.className)) throw new Error('Class cannot be empty.');
    if (input.monthlyFee !== undefined) positive(input.monthlyFee, 'Monthly fee');
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE students SET rno = ?, name = ?, class_name = ?, monthly_fee = ?, category = ?, status = ?, admission_date = ?, notes = ?, updated_at = ? WHERE id = ?', clean(next.rno), clean(next.name), clean(next.className), next.monthlyFee, clean(next.category), next.status, next.admissionDate, clean(next.notes), nowKarachiIso(), studentId);
      await audit(db, 'STUDENT_UPDATED', 'Updated student profile', studentId);
    });
  },
  async students(search = '') {
    const db = await getDb();
    const query = `%${search.trim()}%`;
    const rows = await db.getAllAsync('SELECT * FROM students WHERE name LIKE ? OR class_name LIKE ? OR rno LIKE ? OR id LIKE ? ORDER BY class_name, name LIMIT 200', query, query, query, query);
    return rows.map(mapStudent);
  },
  async findStudents(name: string, className: string) {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM students WHERE lower(name) = lower(?) AND lower(class_name) = lower(?) ORDER BY rno', clean(name), clean(className));
    return rows.map(mapStudent);
  },
  async monthlyFees(studentId: string) {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM student_monthly_fees WHERE student_id = ? ORDER BY month_key', studentId);
    return rows.map(mapMonth);
  },
  async paymentPreview(studentId: string, amount: number) {
    const settings = await this.settings();
    const months = await this.monthlyFees(studentId);
    return createPaymentPreview(months, amount, settings.currentFeeMonthIndex);
  },
  async addPayment(input: { studentId: string; amount: number; paymentDate: string; method: PaymentMethod; reference: string; notes: string; transactionKey?: string }) {
    positive(input.amount, 'Payment amount');
    const db = await getDb();
    const transactionKey = input.transactionKey || id('txn');
    let savedPaymentId = '';
    await db.withTransactionAsync(async () => {
      const existing = await db.getFirstAsync<Payment>('SELECT * FROM payments WHERE transaction_key = ?', transactionKey);
      if (existing) {
        savedPaymentId = existing.id;
        return;
      }
      const settings = await this.settings();
      const months = (await db.getAllAsync('SELECT * FROM student_monthly_fees WHERE student_id = ? ORDER BY month_key', input.studentId)).map(mapMonth);
      const preview = createPaymentPreview(months, input.amount, settings.currentFeeMonthIndex);
      if (preview.excessAmount > 0) throw new Error(`Payment has excess ${preview.excessAmount}. Confirm how to handle the extra amount before saving.`);
      if (preview.allocations.length === 0) throw new Error('No unpaid due month is available for this payment.');
      const paymentId = id('pay');
      await db.runAsync('INSERT INTO payments(id, student_id, amount, payment_date, method, reference, notes, transaction_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', paymentId, input.studentId, input.amount, input.paymentDate, input.method, clean(input.reference), clean(input.notes), transactionKey, nowKarachiIso());
      for (const allocation of preview.allocations) {
        await db.runAsync('UPDATE student_monthly_fees SET paid_amount = paid_amount + ?, updated_at = ? WHERE student_id = ? AND month_key = ?', allocation.applied, nowKarachiIso(), input.studentId, allocation.monthKey);
        await db.runAsync('INSERT INTO payment_allocations(id, payment_id, student_id, month_key, amount, before_remaining, after_remaining) VALUES (?, ?, ?, ?, ?, ?, ?)', id('alc'), paymentId, input.studentId, allocation.monthKey, allocation.applied, allocation.beforeRemaining, allocation.afterRemaining);
      }
      await audit(db, 'PAYMENT_CREATED', 'Payment created and allocated to oldest unpaid months', input.studentId, input.amount, '', JSON.stringify(preview.allocations));
      savedPaymentId = paymentId;
    });
    return savedPaymentId;
  },
  async addAdditionalFee(input: { studentId: string; monthKey: string; amount: number; reason: string }) {
    if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('Additional fee cannot be negative.');
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO additional_fees(id, student_id, month_key, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', id('add'), input.studentId, input.monthKey, input.amount, clean(input.reason), nowKarachiIso());
      await db.runAsync('UPDATE student_monthly_fees SET additional_fee = additional_fee + ?, updated_at = ? WHERE student_id = ? AND month_key = ?', input.amount, nowKarachiIso(), input.studentId, input.monthKey);
      await audit(db, 'ADDITIONAL_FEE_ADDED', clean(input.reason) || 'Additional fee added', input.studentId, input.amount);
    });
  },
  async addExpense(input: Omit<Expense, 'id' | 'createdAt'>) {
    if (!clean(input.name)) throw new Error('Expense name cannot be empty.');
    positive(input.amount, 'Expense amount');
    const db = await getDb();
    await db.runAsync('INSERT INTO expenses(id, name, amount, expense_date, category, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id('exp'), clean(input.name), input.amount, input.expenseDate, clean(input.category) || 'Other', clean(input.notes), nowKarachiIso());
    await audit(db, 'EXPENSE_CREATED', `Expense created: ${input.name}`, '', input.amount);
  },
  async dashboard(date = todayKarachi()) {
    const db = await getDb();
    const [payments, expenses, outstanding, students, unpaid] = await Promise.all([
      db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE payment_date = ?', date),
      db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE expense_date = ?', date),
      db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(MAX(base_fee + additional_fee - paid_amount, 0)),0) total FROM student_monthly_fees'),
      db.getFirstAsync<{ total: number }>('SELECT COUNT(*) total FROM students WHERE status = ?', 'Active'),
      db.getFirstAsync<{ total: number }>('SELECT COUNT(DISTINCT student_id) total FROM student_monthly_fees WHERE base_fee + additional_fee - paid_amount > 0'),
    ]);
    const recentPayments = await db.getAllAsync<any>('SELECT p.*, s.name, s.class_name FROM payments p JOIN students s ON s.id = p.student_id ORDER BY p.created_at DESC LIMIT 8');
    const recentExpenses = await db.getAllAsync<Expense>('SELECT id, name, amount, expense_date as expenseDate, category, notes, created_at as createdAt FROM expenses ORDER BY created_at DESC LIMIT 8');
    return { todayCollection: payments?.total ?? 0, todayExpenses: expenses?.total ?? 0, netCash: (payments?.total ?? 0) - (expenses?.total ?? 0), totalOutstanding: outstanding?.total ?? 0, studentCount: students?.total ?? 0, studentsWithUnpaid: unpaid?.total ?? 0, recentPayments, recentExpenses };
  },
  async payments(date?: string) {
    const db = await getDb();
    const where = date ? 'WHERE p.payment_date = ?' : '';
    return db.getAllAsync<any>(`SELECT p.*, s.name, s.class_name, GROUP_CONCAT(a.month_key || ':' || a.amount, ', ') allocations FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN payment_allocations a ON a.payment_id = p.id ${where} GROUP BY p.id ORDER BY p.created_at DESC`, ...(date ? [date] : []));
  },
  async expenses(date?: string) {
    const db = await getDb();
    const where = date ? 'WHERE expense_date = ?' : '';
    return db.getAllAsync<any>(`SELECT * FROM expenses ${where} ORDER BY created_at DESC`, ...(date ? [date] : []));
  },
  async studentHistory(studentId: string) {
    const db = await getDb();
    const studentRow = await db.getFirstAsync('SELECT * FROM students WHERE id = ?', studentId);
    if (!studentRow) throw new Error('Student was not found.');
    const months = await this.monthlyFees(studentId);
    const payments = await db.getAllAsync<any>('SELECT p.*, GROUP_CONCAT(a.month_key || ":" || a.amount, ", ") allocations FROM payments p LEFT JOIN payment_allocations a ON a.payment_id = p.id WHERE p.student_id = ? GROUP BY p.id ORDER BY p.payment_date DESC', studentId);
    const additionalFees = await db.getAllAsync<AdditionalFee>('SELECT id, student_id as studentId, month_key as monthKey, amount, reason, created_at as createdAt FROM additional_fees WHERE student_id = ? ORDER BY created_at DESC', studentId);
    return { student: mapStudent(studentRow), months, payments, additionalFees };
  },
  async defaulters(className = '') {
    const db = await getDb();
    const clause = className ? 'AND s.class_name = ?' : '';
    return db.getAllAsync<any>(`SELECT s.id, s.name, s.class_name, s.monthly_fee, SUM(m.base_fee + m.additional_fee - m.paid_amount) remaining FROM students s JOIN student_monthly_fees m ON m.student_id = s.id WHERE m.base_fee + m.additional_fee - m.paid_amount > 0 ${clause} GROUP BY s.id ORDER BY remaining DESC`, ...(className ? [className] : []));
  },
};

export type SchoolDb = typeof schoolDb;
