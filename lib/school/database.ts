import * as SQLite from 'expo-sqlite';
import {
  SCHOOL_MONTHS,
  getCurrentAcademicMonthIndex,
  nowKarachiIso,
  todayKarachi,
} from './calendar';
import {
  createPaymentPreview,
  withStatus,
} from './feeLogic';

import type {
  AdditionalFee,
  Expense,
  MonthlyFeeStatus,
  Payment,
  PaymentMethod,
  Settings,
  Student,
} from './types';

const DB_NAME = 'school_fee_cash.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const id = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const clean = (value: unknown) =>
  String(value ?? '').trim();

const positive = (
  value: number,
  label: string
) => {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${label} must be greater than zero.`
    );
  }
};

/* =========================================================
   DATABASE
   ========================================================= */

async function getDb() {
  if (!dbPromise) {
    dbPromise =
      SQLite.openDatabaseAsync(DB_NAME);
  }

  const db = await dbPromise;

  await migrate(db);

  return db;
}

/* =========================================================
   MIGRATION
   ========================================================= */

async function migrate(
  db: SQLite.SQLiteDatabase
) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

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

    CREATE INDEX IF NOT EXISTS idx_students_search
      ON students(name, class_name, rno);

    CREATE TABLE IF NOT EXISTS student_monthly_fees (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL
        REFERENCES students(id)
        ON DELETE CASCADE,

      month_key TEXT NOT NULL,

      base_fee REAL NOT NULL,

      additional_fee REAL NOT NULL
        DEFAULT 0,

      paid_amount REAL NOT NULL
        DEFAULT 0,

      advance_amount REAL NOT NULL
        DEFAULT 0,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      UNIQUE(student_id, month_key)
    );

    CREATE INDEX IF NOT EXISTS idx_monthly_student
      ON student_monthly_fees(
        student_id,
        month_key
      );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY NOT NULL,

      student_id TEXT NOT NULL
        REFERENCES students(id)
        ON DELETE RESTRICT,

      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL,
      reference TEXT NOT NULL,
      notes TEXT NOT NULL,

      transaction_key TEXT NOT NULL UNIQUE,

      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payments_date
      ON payments(payment_date);

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id TEXT PRIMARY KEY NOT NULL,

      payment_id TEXT NOT NULL
        REFERENCES payments(id)
        ON DELETE CASCADE,

      student_id TEXT NOT NULL
        REFERENCES students(id)
        ON DELETE RESTRICT,

      month_key TEXT NOT NULL,
      amount REAL NOT NULL,
      before_remaining REAL NOT NULL,
      after_remaining REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS additional_fees (
      id TEXT PRIMARY KEY NOT NULL,

      student_id TEXT NOT NULL
        REFERENCES students(id)
        ON DELETE RESTRICT,

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

    CREATE INDEX IF NOT EXISTS idx_expenses_date
      ON expenses(expense_date);

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

  /*
   * Existing databases may not have
   * advance_amount.
   */
  const columns =
    await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(student_monthly_fees)'
    );

  const hasAdvanceColumn =
    columns.some(
      (column) =>
        column.name === 'advance_amount'
    );

  if (!hasAdvanceColumn) {
    await db.execAsync(`
      ALTER TABLE student_monthly_fees
      ADD COLUMN advance_amount
      REAL NOT NULL DEFAULT 0;
    `);
  }

  const count =
    await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings'
    );

  if ((count?.count ?? 0) === 0) {
    await seed(db);
  }
}

/* =========================================================
   SEED
   ========================================================= */

async function seed(
  db: SQLite.SQLiteDatabase
) {
  const settings: Settings = {
    schoolName: 'School Fee Office',
    schoolAddress:
      'Update address in Settings',
    phone: '',
    academicYear: '2026-2027',
    defaultMonthlyFee: 1400,
    currentFeeMonthIndex:
      getCurrentAcademicMonthIndex(),
    currency: 'Rs.',
    role: 'Admin',
  };

  for (const [key, value] of Object.entries(
    settings
  )) {
    await db.runAsync(
      `INSERT INTO settings(key, value)
       VALUES (?, ?)`,
      key,
      String(value)
    );
  }
}

/* =========================================================
   AUDIT
   ========================================================= */

async function audit(
  db: SQLite.SQLiteDatabase,
  action: string,
  description: string,
  studentId = '',
  amount = 0,
  oldValue = '',
  newValue = ''
) {
  await db.runAsync(
    `INSERT INTO audit_logs
      (
        id,
        created_at,
        user,
        action,
        student_id,
        amount,
        old_value,
        new_value,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id('aud'),
    nowKarachiIso(),
    'local-admin',
    action,
    studentId,
    amount,
    oldValue,
    newValue,
    description
  );
}

/* =========================================================
   STUDENT INSERT
   ========================================================= */

async function insertStudent(
  db: SQLite.SQLiteDatabase,
  input: Omit<
    Student,
    'id' | 'createdAt' | 'updatedAt'
  >,
  skipAudit = false,
  /*
   * IMPORTANT BUG FIX:
   *
   * When true, monthly fee rows are only
   * created starting from the student's
   * admission month onward.
   *
   * Without this, a student added TODAY
   * would still show unpaid dues going all
   * the way back to April 2026, and a new
   * payment would get applied to those old
   * fake dues first (oldest-unpaid-first
   * rule) instead of the month the student
   * actually joined. That made the current
   * month look "Unpaid" even after a
   * payment was saved.
   *
   * Excel imports do NOT use this flag,
   * because Excel already supplies the
   * real historical balance for every
   * month directly.
   */
  restrictToAdmissionMonth = false
) {
  if (!clean(input.name)) {
    throw new Error(
      'Student name cannot be empty.'
    );
  }

  if (!clean(input.className)) {
    throw new Error(
      'Class cannot be empty.'
    );
  }

  positive(
    input.monthlyFee,
    'Monthly fee'
  );

  const studentId = id('stu');
  const createdAt = nowKarachiIso();

  await db.runAsync(
    `INSERT INTO students
      (
        id,
        rno,
        name,
        class_name,
        monthly_fee,
        category,
        status,
        admission_date,
        notes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    studentId,
    clean(input.rno),
    clean(input.name),
    clean(input.className),
    input.monthlyFee,
    clean(input.category) ||
      'Normal',
    input.status,
    input.admissionDate ||
      todayKarachi(),
    clean(input.notes),
    createdAt,
    createdAt
  );

  /*
   * Work out which month the student
   * actually joined in, so we don't
   * create fake dues for months before
   * that.
   */
  const admissionMonthKey = (
    input.admissionDate ||
    todayKarachi()
  ).slice(0, 7);

  const admissionMonthIndex =
    restrictToAdmissionMonth
      ? (SCHOOL_MONTHS.find(
          (month) =>
            month.key ===
            admissionMonthKey
        )?.index ?? 0)
      : 0;

  for (const month of SCHOOL_MONTHS) {
    if (
      restrictToAdmissionMonth &&
      month.index <
        admissionMonthIndex
    ) {
      // Student was not enrolled yet.
      continue;
    }

    await db.runAsync(
      `INSERT INTO student_monthly_fees
        (
          id,
          student_id,
          month_key,
          base_fee,
          additional_fee,
          paid_amount,
          advance_amount,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      id('fee'),
      studentId,
      month.key,
      input.monthlyFee,
      createdAt,
      createdAt
    );
  }

  if (!skipAudit) {
    await audit(
      db,
      'STUDENT_CREATED',
      `Created student ${input.name}`,
      studentId,
      input.monthlyFee
    );
  }

  return studentId;
}

/* =========================================================
   MAPPERS
   ========================================================= */

const mapStudent = (
  row: any
): Student => ({
  id: row.id,
  rno: row.rno,
  name: row.name,
  className: row.class_name,
  monthlyFee: Number(
    row.monthly_fee ?? 0
  ),
  category: row.category,
  status: row.status,
  admissionDate:
    row.admission_date,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/*
 * IMPORTANT:
 * Pass currentFeeMonthIndex here.
 *
 * This prevents future months from being
 * shown as Unpaid.
 */
const mapMonth = (
  row: any,
  currentFeeMonthIndex: number
): MonthlyFeeStatus =>
  withStatus(
    {
      id: row.id,
      studentId: row.student_id,
      monthKey: row.month_key,
      baseFee: Number(
        row.base_fee ?? 0
      ),
      additionalFee: Number(
        row.additional_fee ?? 0
      ),
      paidAmount: Number(
        row.paid_amount ?? 0
      ),
      advanceAmount: Number(
        row.advance_amount ?? 0
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    currentFeeMonthIndex
  );

/* =========================================================
   ADVANCE NORMALIZATION
   ========================================================= */

/**
 * When an advance month becomes current,
 * automatically use that advance to pay the
 * month's fee.
 *
 * Example:
 *
 * October advance = 2500
 * October fee = 1400
 *
 * becomes:
 *
 * October paid = 1400
 * October advance = 0
 * November advance = 1100
 */
async function normalizeStudentAdvances(
  db: SQLite.SQLiteDatabase,
  studentId: string,
  currentFeeMonthIndex: number
) {
  const rows =
    await db.getAllAsync<{
      id: string;
      month_key: string;
      base_fee: number;
      additional_fee: number;
      paid_amount: number;
      advance_amount: number;
    }>(
      `SELECT
         id,
         month_key,
         base_fee,
         additional_fee,
         paid_amount,
         advance_amount
       FROM student_monthly_fees
       WHERE student_id = ?
       ORDER BY month_key`,
      studentId
    );

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {
    const month = rows[i];

    const monthIndex =
      SCHOOL_MONTHS.find(
        (item) =>
          item.key ===
          month.month_key
      )?.index ?? 99;

    /*
     * Future months stay untouched.
     */
    if (
      monthIndex >
      currentFeeMonthIndex
    ) {
      continue;
    }

    let advance = Number(
      month.advance_amount ?? 0
    );

    if (advance <= 0) {
      continue;
    }

    const feeDue =
      Number(month.base_fee ?? 0) +
      Number(
        month.additional_fee ?? 0
      );

    const paid =
      Number(month.paid_amount ?? 0);

    const unpaid = Math.max(
      0,
      feeDue - paid
    );

    const used = Math.min(
      advance,
      unpaid
    );

    const newPaid =
      paid + used;

    const leftover =
      advance - used;

    /*
     * BUG FIX:
     *
     * This row is no longer a future
     * month, so its own advance_amount
     * must become 0 once used. Leaving
     * "leftover" here as well as on the
     * next month double-counted the same
     * money.
     *
     * The only exception is when there is
     * no next month to carry it into
     * (the very last month of the
     * academic year) - then we keep the
     * money here so it is not lost.
     */
    const hasNextMonth =
      i + 1 < rows.length;

    await db.runAsync(
      `UPDATE student_monthly_fees
       SET
         paid_amount = ?,
         advance_amount = ?,
         updated_at = ?
       WHERE id = ?`,
      newPaid,
      hasNextMonth ? 0 : leftover,
      nowKarachiIso(),
      month.id
    );

    /*
     * Carry extra advance forward.
     */
    if (
      leftover > 0 &&
      hasNextMonth
    ) {
      const nextMonth =
        rows[i + 1];

      await db.runAsync(
        `UPDATE student_monthly_fees
         SET
           advance_amount =
             advance_amount + ?,
           updated_at = ?
         WHERE id = ?`,
        leftover,
        nowKarachiIso(),
        nextMonth.id
      );
    }
  }
}

/**
 * Normalize every active student.
 *
 * Used by dashboard/reports so advance
 * automatically becomes current when
 * the month changes.
 */
async function normalizeAllAdvances(
  db: SQLite.SQLiteDatabase,
  currentFeeMonthIndex: number
) {
  const students =
    await db.getAllAsync<{
      id: string;
    }>(
      `SELECT id
       FROM students
       WHERE status = ?`,
      'Active'
    );

  for (const student of students) {
    await normalizeStudentAdvances(
      db,
      student.id,
      currentFeeMonthIndex
    );
  }
}

/* =========================================================
   DATABASE API
   ========================================================= */

export const schoolDb = {
  /* -------------------------------------------------------
     SETTINGS
  ------------------------------------------------------- */

  async settings(): Promise<Settings> {
    const db = await getDb();

    const rows =
      await db.getAllAsync<{
        key: string;
        value: string;
      }>(
        'SELECT key, value FROM settings'
      );

    const data =
      Object.fromEntries(
        rows.map((row) => [
          row.key,
          row.value,
        ])
      );

    return {
      schoolName:
        data.schoolName ||
        'School Fee Office',

      schoolAddress:
        data.schoolAddress || '',

      phone: data.phone || '',

      academicYear:
        data.academicYear ||
        '2026-2027',

      defaultMonthlyFee:
        Number(
          data.defaultMonthlyFee ||
            1400
        ),

      currentFeeMonthIndex:
        Number(
          data.currentFeeMonthIndex ??
            getCurrentAcademicMonthIndex()
        ),

      currency:
        data.currency || 'Rs.',

      role:
        (data.role as Settings['role']) ||
        'Admin',
    };
  },

  async saveSettings(
    input: Settings
  ) {
    const db = await getDb();

    for (const [key, value] of Object.entries(
      input
    )) {
      await db.runAsync(
        `INSERT OR REPLACE INTO
         settings(key, value)
         VALUES (?, ?)`,
        key,
        String(value)
      );
    }

    /*
     * If the month was changed,
     * immediately consume advances.
     */
    await normalizeAllAdvances(
      db,
      input.currentFeeMonthIndex
    );

    await audit(
      db,
      'SETTINGS_UPDATED',
      'Updated school settings'
    );
  },

  /* -------------------------------------------------------
     STUDENTS
  ------------------------------------------------------- */
async updateStudentFromImportedExcel(
  studentId: string,
  input: {
    rno: string;
    name: string;
    className: string;
    monthlyFee: number;
    category: string;
    notes: string;
    balancesByMonth: Record<string, number>;
  }
) {
  const db = await getDb();
  const settings = await this.settings();

  await db.withTransactionAsync(async () => {
    // Update student information.
    await db.runAsync(
      `UPDATE students
       SET
         rno = ?,
         name = ?,
         class_name = ?,
         monthly_fee = ?,
         category = ?,
         notes = ?,
         updated_at = ?
       WHERE id = ?`,
      clean(input.rno),
      clean(input.name),
      clean(input.className),
      input.monthlyFee,
      clean(input.category || 'Normal'),
      clean(input.notes || ''),
      nowKarachiIso(),
      studentId
    );

    /*
     * Excel stores REMAINING amounts.
     *
     * Therefore we rebuild each month from
     * the exact Excel balance.
     */
    for (const month of SCHOOL_MONTHS) {
      const rawValue =
        input.balancesByMonth[month.key];

      if (!Number.isFinite(rawValue)) {
        continue;
      }

      const remaining = Math.max(
        0,
        Number(rawValue)
      );

      if (
        month.index >
        settings.currentFeeMonthIndex
      ) {
        // Future amount = ADVANCE.
        await db.runAsync(
          `UPDATE student_monthly_fees
           SET
             base_fee = ?,
             additional_fee = 0,
             paid_amount = 0,
             advance_amount = ?,
             updated_at = ?
           WHERE
             student_id = ?
             AND month_key = ?`,
          input.monthlyFee,
          remaining,
          nowKarachiIso(),
          studentId,
          month.key
        );
      } else {
        /*
         * Current/previous month.
         *
         * If Excel remaining is greater than the
         * normal monthly fee, the difference is
         * treated as an additional fee.
         */
        const additionalFee = Math.max(
          0,
          remaining - input.monthlyFee
        );

        const feeDue =
          input.monthlyFee +
          additionalFee;

        const paidAmount = Math.max(
          0,
          feeDue - remaining
        );

        await db.runAsync(
          `UPDATE student_monthly_fees
           SET
             base_fee = ?,
             additional_fee = ?,
             paid_amount = ?,
             advance_amount = 0,
             updated_at = ?
           WHERE
             student_id = ?
             AND month_key = ?`,
          input.monthlyFee,
          additionalFee,
          paidAmount,
          nowKarachiIso(),
          studentId,
          month.key
        );
      }
    }

    await normalizeStudentAdvances(
      db,
      studentId,
      settings.currentFeeMonthIndex
    );

    await audit(
      db,
      'EXCEL_IMPORT_STUDENT_UPDATED',
      'Updated existing student from Excel',
      studentId
    );
  });
},
  async addStudent(
    input: Omit<
      Student,
      'id' | 'createdAt' | 'updatedAt'
    >
  ) {
    const db = await getDb();

    let studentId = '';

    await db.withTransactionAsync(
      async () => {
        studentId =
          await insertStudent(
            db,
            input,
            false,
            /*
             * Manually added students only
             * owe fees from their own
             * admission month onward.
             */
            true
          );
      }
    );

    return studentId;
  },

   async addStudentWithImportedBalances(
  input: Omit<
    Student,
    'id' | 'createdAt' | 'updatedAt'
  >,
  balancesByMonth: Record<string, number>
) {
  const db = await getDb();

  let studentId = '';

  const settings = await this.settings();

  await db.withTransactionAsync(
    async () => {
      studentId = await insertStudent(
        db,
        input
      );

      for (const month of SCHOOL_MONTHS) {
        const rawValue =
          balancesByMonth[month.key];

        const value = Number(rawValue);

        if (!Number.isFinite(value)) {
          continue;
        }

        const remaining = Math.max(
          0,
          value
        );

        /*
         * Excel contains REMAINING amounts.
         *
         * Current/previous:
         * non-zero = unpaid amount
         * zero = already paid
         *
         * Future:
         * non-zero = advance
         * zero = no advance
         */

        if (
          month.index >
          settings.currentFeeMonthIndex
        ) {
          await db.runAsync(
            `UPDATE student_monthly_fees
             SET
               paid_amount = 0,
               advance_amount = ?,
               updated_at = ?
             WHERE
               student_id = ?
               AND month_key = ?`,
            remaining,
            nowKarachiIso(),
            studentId,
            month.key
          );
        } else {
          const feeDue =
            Math.max(
              0,
              input.monthlyFee
            );

          const paidAmount =
            Math.max(
              0,
              feeDue - remaining
            );

          await db.runAsync(
            `UPDATE student_monthly_fees
             SET
               paid_amount = ?,
               advance_amount = 0,
               updated_at = ?
             WHERE
               student_id = ?
               AND month_key = ?`,
            paidAmount,
            nowKarachiIso(),
            studentId,
            month.key
          );
        }
      }
 
      await normalizeStudentAdvances(
        db,
        studentId,
        settings.currentFeeMonthIndex
      );

      await audit(
        db,
        'EXCEL_IMPORT_STUDENT',
        'Imported Excel student with exact monthly remaining balances',
        studentId
      );
    }
  );

  return studentId;
},

  async updateStudent(
    studentId: string,
    input: Partial<Student>
  ) {
    const db = await getDb();

    const existingRow =
      await db.getFirstAsync(
        'SELECT * FROM students WHERE id = ?',
        studentId
      );

    if (!existingRow) {
      throw new Error(
        'Student was not found.'
      );
    }

    const existing =
      mapStudent(existingRow);

    const next = {
      ...existing,
      ...input,
    };

    if (
      input.name !== undefined &&
      !clean(input.name)
    ) {
      throw new Error(
        'Student name cannot be empty.'
      );
    }

    if (
      input.className !== undefined &&
      !clean(input.className)
    ) {
      throw new Error(
        'Class cannot be empty.'
      );
    }

    if (
  input.monthlyFee !== undefined &&
  (
    !Number.isFinite(input.monthlyFee) ||
    input.monthlyFee < 0
  )
) {
  throw new Error(
    'Monthly fee cannot be negative.'
  );
}

    await db.withTransactionAsync(
      async () => {
        await db.runAsync(
          `UPDATE students
           SET
             rno = ?,
             name = ?,
             class_name = ?,
             monthly_fee = ?,
             category = ?,
             status = ?,
             admission_date = ?,
             notes = ?,
             updated_at = ?
           WHERE id = ?`,
          clean(next.rno),
          clean(next.name),
          clean(next.className),
          next.monthlyFee,
          clean(next.category),
          next.status,
          next.admissionDate,
          clean(next.notes),
          nowKarachiIso(),
          studentId
        );

        /*
         * Only change the base fee for
         * months that have NOT received
         * payments yet.
         *
         * Historical paid months remain
         * untouched.
         */
        if (
          input.monthlyFee !== undefined
        ) {
          await db.runAsync(
            `UPDATE student_monthly_fees
             SET
               base_fee = ?,
               updated_at = ?
             WHERE
               student_id = ?
               AND paid_amount = 0
               AND advance_amount = 0`,
            input.monthlyFee,
            nowKarachiIso(),
            studentId
          );
        }

        await audit(
          db,
          'STUDENT_UPDATED',
          'Updated student profile',
          studentId
        );
      }
    );
  },

  async students(
    search = ''
  ) {
    const db = await getDb();

    const query =
      `%${search.trim()}%`;

    const rows =
      await db.getAllAsync(
        `SELECT *
         FROM students
         WHERE
           name LIKE ?
           OR class_name LIKE ?
           OR rno LIKE ?
           OR id LIKE ?
         ORDER BY
           class_name,
           name
         LIMIT 200`,
        query,
        query,
        query,
        query
      );

    return rows.map(mapStudent);
  },

  async findStudents(
    name: string,
    className: string
  ) {
    const db = await getDb();

    const rows =
      await db.getAllAsync(
        `SELECT *
         FROM students
         WHERE
           lower(name) = lower(?)
           AND lower(class_name) = lower(?)
         ORDER BY rno`,
        clean(name),
        clean(className)
      );

    return rows.map(mapStudent);
  },

  /* -------------------------------------------------------
     MONTHLY FEES
  ------------------------------------------------------- */

  async monthlyFees(
    studentId: string
  ) {
    const db = await getDb();

    const settings =
      await this.settings();

    /*
     * IMPORTANT:
     * Consume any advance that has
     * now become current.
     */
    await normalizeStudentAdvances(
      db,
      studentId,
      settings.currentFeeMonthIndex
    );

    const rows =
      await db.getAllAsync(
        `SELECT *
         FROM student_monthly_fees
         WHERE student_id = ?
         ORDER BY month_key`,
        studentId
      );

    return rows.map(
      (row) =>
        mapMonth(
          row,
          settings.currentFeeMonthIndex
        )
    );
  },

  /* -------------------------------------------------------
     PAYMENT PREVIEW
  ------------------------------------------------------- */

  async paymentPreview(
    studentId: string,
    amount: number
  ) {
    const db = await getDb();

    const settings =
      await this.settings();

    await normalizeStudentAdvances(
      db,
      studentId,
      settings.currentFeeMonthIndex
    );

    const rows =
      await db.getAllAsync(
        `SELECT *
         FROM student_monthly_fees
         WHERE student_id = ?
         ORDER BY month_key`,
        studentId
      );

    const months =
      rows.map(
        (row) =>
          mapMonth(
            row,
            settings.currentFeeMonthIndex
          )
      );

    return createPaymentPreview(
      months,
      amount,
      settings.currentFeeMonthIndex
    );
  },

  /* -------------------------------------------------------
     ADD PAYMENT
  ------------------------------------------------------- */

  async addPayment(input: {
    studentId: string;
    amount: number;
    paymentDate: string;
    method: PaymentMethod;
    reference: string;
    notes: string;
    transactionKey?: string;
  }) {
    positive(
      input.amount,
      'Payment amount'
    );

    const db = await getDb();

    const transactionKey =
      input.transactionKey ||
      id('txn');

    let savedPaymentId = '';

    await db.withTransactionAsync(
      async () => {
        const existing =
          await db.getFirstAsync<Payment>(
            `SELECT *
             FROM payments
             WHERE transaction_key = ?`,
            transactionKey
          );

        if (existing) {
          savedPaymentId =
            existing.id;
          return;
        }

        const settings =
          await this.settings();

        /*
         * Before taking a new payment,
         * consume any old advance that has
         * become current.
         */
        await normalizeStudentAdvances(
          db,
          input.studentId,
          settings.currentFeeMonthIndex
        );

        const rows =
          await db.getAllAsync(
            `SELECT *
             FROM student_monthly_fees
             WHERE student_id = ?
             ORDER BY month_key`,
            input.studentId
          );

        const months =
          rows.map(
            (row) =>
              mapMonth(
                row,
                settings.currentFeeMonthIndex
              )
          );

        const preview =
          createPaymentPreview(
            months,
            input.amount,
            settings.currentFeeMonthIndex
          );

        /*
         * No academic months left.
         */
        if (
          preview.excessAmount > 0
        ) {
          throw new Error(
            `Payment exceeds the available academic-year months by Rs. ${preview.excessAmount}.`
          );
        }

        if (
          preview.allocations
            .length === 0
        ) {
          throw new Error(
            'No month is available for this payment.'
          );
        }

        const paymentId =
          id('pay');

        await db.runAsync(
          `INSERT INTO payments
            (
              id,
              student_id,
              amount,
              payment_date,
              method,
              reference,
              notes,
              transaction_key,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          paymentId,
          input.studentId,
          input.amount,
          input.paymentDate,
          input.method,
          clean(input.reference),
          clean(input.notes),
          transactionKey,
          nowKarachiIso()
        );

        for (
          const allocation of
            preview.allocations
        ) {
          const month =
            months.find(
              (item) =>
                item.monthKey ===
                allocation.monthKey
            );

          if (!month) {
            continue;
          }

          const monthIndex =
            SCHOOL_MONTHS.find(
              (item) =>
                item.key ===
                allocation.monthKey
            )?.index ?? 99;

          /*
           * CURRENT / PREVIOUS
           */
          if (
            monthIndex <=
            settings.currentFeeMonthIndex
          ) {
            await db.runAsync(
              `UPDATE student_monthly_fees
               SET
                 paid_amount =
                   paid_amount + ?,
                 updated_at = ?
               WHERE
                 student_id = ?
                 AND month_key = ?`,
              allocation.applied,
              nowKarachiIso(),
              input.studentId,
              allocation.monthKey
            );
          }

          /*
           * FUTURE
           *
           * Extra payment becomes
           * advance.
           */
          else {
            await db.runAsync(
              `UPDATE student_monthly_fees
               SET
                 advance_amount =
                   advance_amount + ?,
                 updated_at = ?
               WHERE
                 student_id = ?
                 AND month_key = ?`,
              allocation.applied,
              nowKarachiIso(),
              input.studentId,
              allocation.monthKey
            );
          }

          await db.runAsync(
            `INSERT INTO payment_allocations
              (
                id,
                payment_id,
                student_id,
                month_key,
                amount,
                before_remaining,
                after_remaining
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
            id('alc'),
            paymentId,
            input.studentId,
            allocation.monthKey,
            allocation.applied,
            allocation.beforeRemaining,
            allocation.afterRemaining
          );
        }

        await audit(
          db,
          'PAYMENT_CREATED',
          'Payment created and allocated from oldest dues to future advance',
          input.studentId,
          input.amount,
          '',
          JSON.stringify(
            preview.allocations
          )
        );

        savedPaymentId =
          paymentId;
      }
    );

    return savedPaymentId;
  },

  /* -------------------------------------------------------
     ADDITIONAL FEE
  ------------------------------------------------------- */

  async addAdditionalFee(input: {
    studentId: string;
    monthKey: string;
    amount: number;
    reason: string;
  }) {
    if (
      !Number.isFinite(
        input.amount
      ) ||
      input.amount < 0
    ) {
      throw new Error(
        'Additional fee cannot be negative.'
      );
    }

    const db = await getDb();

    await db.withTransactionAsync(
      async () => {
        await db.runAsync(
          `INSERT INTO additional_fees
            (
              id,
              student_id,
              month_key,
              amount,
              reason,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
          id('add'),
          input.studentId,
          input.monthKey,
          input.amount,
          clean(input.reason),
          nowKarachiIso()
        );

        await db.runAsync(
          `UPDATE student_monthly_fees
           SET
             additional_fee =
               additional_fee + ?,
             updated_at = ?
           WHERE
             student_id = ?
             AND month_key = ?`,
          input.amount,
          nowKarachiIso(),
          input.studentId,
          input.monthKey
        );

        await audit(
          db,
          'ADDITIONAL_FEE_ADDED',
          clean(input.reason) ||
            'Additional fee added',
          input.studentId,
          input.amount
        );
      }
    );
  },

  /* -------------------------------------------------------
     EXPENSE
  ------------------------------------------------------- */

  async addExpense(
    input: Omit<
      Expense,
      'id' | 'createdAt'
    >
  ) {
    if (!clean(input.name)) {
      throw new Error(
        'Expense name cannot be empty.'
      );
    }

    positive(
      input.amount,
      'Expense amount'
    );

    const db = await getDb();

    await db.runAsync(
      `INSERT INTO expenses
        (
          id,
          name,
          amount,
          expense_date,
          category,
          notes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id('exp'),
      clean(input.name),
      input.amount,
      input.expenseDate,
      clean(input.category) ||
        'Other',
      clean(input.notes),
      nowKarachiIso()
    );

    await audit(
      db,
      'EXPENSE_CREATED',
      `Expense created: ${input.name}`,
      '',
      input.amount
    );
  },

  /* -------------------------------------------------------
     DASHBOARD
  ------------------------------------------------------- */

  async dashboard(
    date = todayKarachi()
  ) {
    const db = await getDb();

    const settings =
      await this.settings();

    /*
     * Keep advance data correct for
     * every active student.
     */
    await normalizeAllAdvances(
      db,
      settings.currentFeeMonthIndex
    );

    const currentMonth =
      SCHOOL_MONTHS[
        settings.currentFeeMonthIndex
      ]?.key || '2026-09';

    const payments =
      await db.getFirstAsync<{
        total: number;
      }>(
        `SELECT
           COALESCE(
             SUM(amount),
             0
           ) total
         FROM payments
         WHERE payment_date = ?`,
        date
      );

    const expenses =
      await db.getFirstAsync<{
        total: number;
      }>(
        `SELECT
           COALESCE(
             SUM(amount),
             0
           ) total
         FROM expenses
         WHERE expense_date = ?`,
        date
      );

    /*
     * IMPORTANT:
     *
     * Only current + previous months
     * are counted as outstanding.
     */
    const outstanding =
      await db.getFirstAsync<{
        total: number;
      }>(
        `SELECT
           COALESCE(
             SUM(
               MAX(
                 m.base_fee +
                 m.additional_fee -
                 m.paid_amount,
                 0
               )
             ),
             0
           ) total
         FROM student_monthly_fees m
         JOIN students s
           ON s.id = m.student_id
         WHERE
           m.month_key <= ?`,
        currentMonth
      );

    const students =
      await db.getFirstAsync<{
        total: number;
      }>(
        `SELECT COUNT(*) total
         FROM students
         WHERE status = ?`,
        'Active'
      );

    const unpaid =
      await db.getFirstAsync<{
        total: number;
      }>(
        `SELECT
           COUNT(
             DISTINCT student_id
           ) total
         FROM student_monthly_fees
         WHERE
           base_fee +
           additional_fee -
           paid_amount > 0
           AND month_key <= ?`,
        currentMonth
      );

    const recentPayments =
      await db.getAllAsync<any>(
        `SELECT
           p.*,
           s.name,
           s.class_name,

           GROUP_CONCAT(
             a.month_key ||
             ':' ||
             a.amount,
             ', '
           ) allocations

         FROM payments p

         JOIN students s
           ON s.id = p.student_id

         LEFT JOIN payment_allocations a
           ON a.payment_id = p.id

         GROUP BY p.id

         ORDER BY
           p.created_at DESC

         LIMIT 8`
      );

    const recentExpenses =
      await db.getAllAsync<any>(
        `SELECT
           id,
           name,
           amount,
           expense_date,
           category,
           notes,
           created_at
         FROM expenses
         ORDER BY
           created_at DESC
         LIMIT 8`
      );

    return {
      todayCollection:
        payments?.total ?? 0,

      todayExpenses:
        expenses?.total ?? 0,

      netCash:
        (payments?.total ?? 0) -
        (expenses?.total ?? 0),

      totalOutstanding:
        outstanding?.total ?? 0,

      studentCount:
        students?.total ?? 0,

      studentsWithUnpaid:
        unpaid?.total ?? 0,

      recentPayments,

      recentExpenses,
    };
  },

  /* -------------------------------------------------------
     PAYMENTS
  ------------------------------------------------------- */

  async payments(
    date?: string
  ) {
    const db = await getDb();

    const where = date
      ? 'WHERE p.payment_date = ?'
      : '';

    return db.getAllAsync<any>(
      `SELECT
         p.*,
         s.name,
         s.class_name,

         GROUP_CONCAT(
           a.month_key ||
           ':' ||
           a.amount,
           ', '
         ) allocations

       FROM payments p

       JOIN students s
         ON s.id = p.student_id

       LEFT JOIN payment_allocations a
         ON a.payment_id = p.id

       ${where}

       GROUP BY p.id

       ORDER BY
         p.created_at DESC`,
      ...(date ? [date] : [])
    );
  },

  /* -------------------------------------------------------
     EXPENSES
  ------------------------------------------------------- */

  async expenses(
    date?: string
  ) {
    const db = await getDb();

    const where = date
      ? 'WHERE expense_date = ?'
      : '';

    return db.getAllAsync<any>(
      `SELECT *
       FROM expenses
       ${where}
       ORDER BY
         created_at DESC`,
      ...(date ? [date] : [])
    );
  },

  /* -------------------------------------------------------
     STUDENT HISTORY
  ------------------------------------------------------- */

  async studentHistory(
    studentId: string
  ) {
    const db = await getDb();

    const studentRow =
      await db.getFirstAsync(
        `SELECT *
         FROM students
         WHERE id = ?`,
        studentId
      );

    if (!studentRow) {
      throw new Error(
        'Student was not found.'
      );
    }

    /*
     * monthlyFees() automatically
     * normalizes advance.
     */
    const months =
      await this.monthlyFees(
        studentId
      );

    const payments =
      await db.getAllAsync<any>(
        `SELECT
           p.*,

           GROUP_CONCAT(
             a.month_key ||
             ':' ||
             a.amount,
             ', '
           ) allocations

         FROM payments p

         LEFT JOIN payment_allocations a
           ON a.payment_id = p.id

         WHERE
           p.student_id = ?

         GROUP BY p.id

         ORDER BY
           p.payment_date DESC`,
        studentId
      );

    const additionalFees =
      await db.getAllAsync<AdditionalFee>(
        `SELECT
           id,
           student_id as studentId,
           month_key as monthKey,
           amount,
           reason,
           created_at as createdAt

         FROM additional_fees

         WHERE student_id = ?

         ORDER BY
           created_at DESC`,
        studentId
      );

    return {
      student:
        mapStudent(studentRow),

      months,

      payments,

      additionalFees,
    };
  },

  /* -------------------------------------------------------
     DEFAULTERS
  ------------------------------------------------------- */

  async defaulters(
    className = ''
  ) {
    const db = await getDb();

    const settings =
      await this.settings();

    /*
     * Normalize advances before
     * calculating defaulters.
     */
    await normalizeAllAdvances(
      db,
      settings.currentFeeMonthIndex
    );

    const currentMonth =
      SCHOOL_MONTHS[
        settings.currentFeeMonthIndex
      ]?.key || '2026-09';

    const clause = className
      ? 'AND s.class_name = ?'
      : '';

    return db.getAllAsync<any>(
      `SELECT
         s.id,
         s.name,
         s.class_name,
         s.monthly_fee,

         SUM(
           MAX(
             m.base_fee +
             m.additional_fee -
             m.paid_amount,
             0
           )
         ) remaining

       FROM students s

       JOIN student_monthly_fees m
         ON m.student_id = s.id

       WHERE
         m.month_key <= ?

         AND
         m.base_fee +
         m.additional_fee -
         m.paid_amount > 0

         ${clause}

       GROUP BY s.id

       ORDER BY
         remaining DESC`,
      ...(className
        ? [
            currentMonth,
            className,
          ]
        : [currentMonth])
    );
  },
};

export type SchoolDb =
  typeof schoolDb;