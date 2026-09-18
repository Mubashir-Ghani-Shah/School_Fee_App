import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import {
  SCHOOL_MONTHS,
  currency,
  formatDate,
  todayKarachi,
} from './calendar';

import { schoolDb } from './database';

const safe = (value: unknown) =>
  String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ' ');


/* =========================================================
   GENERAL FILE SHARING
========================================================= */

const writeAndShare = async (
  name: string,
  content: string,
  mimeType: string
) => {
  const uri =
    `${FileSystem.documentDirectory}${name}`;

  await FileSystem.writeAsStringAsync(
    uri,
    content,
    {
      encoding:
        FileSystem.EncodingType.UTF8,
    }
  );

  if (
    await Sharing.isAvailableAsync()
  ) {
    await Sharing.shareAsync(uri, {
      mimeType,
    });
  }

  return uri;
};


/* =========================================================
   EXCEL IMPORT TYPES
========================================================= */

export type ExcelImportRow = {
  rno: string;
  name: string;
  className: string;
  monthlyFee: number;
  category: string;
  notes: string;
  balancesByMonth: Record<
    string,
    number
  >;

  /*
   * If this student already exists in
   * the app, this is their existing ID.
   *
   * The import will UPDATE this student
   * instead of creating a new one.
   */
  existingStudentId?: string;
};

export type ExcelImportPreview = {
  fileName: string;
  sheetName: string;

  /*
   * Genuinely new students that will
   * be CREATED.
   */
  newStudents: number;

  /*
   * Students that already exist and
   * will be UPDATED with the Excel
   * numbers (NOT skipped).
   */
  existingToUpdate: number;

  invalidRows: number;

  /*
   * Only true duplicates - the SAME
   * name + class appearing twice
   * INSIDE the Excel file itself.
   */
  duplicateStudents: number;

  rows: ExcelImportRow[];
};


/* =========================================================
   EXCEL HEADER HELPERS
========================================================= */

const normalizeHeader = (
  value: unknown
) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');


const findColumn = (
  headers: string[],
  names: string[]
) => {
  const wanted =
    names.map(normalizeHeader);

  return headers.findIndex((header) =>
    wanted.includes(
      normalizeHeader(header)
    )
  );
};


/**
 * Supports both:
 *
 * Apr2026
 * Apr026
 *
 * and the rest of the school's
 * month column naming variations.
 */
const getMonthColumnNames = (
  monthIndex: number
) => {
  const month =
    SCHOOL_MONTHS[monthIndex];

  if (!month) {
    return [];
  }

  const legacy = [
    'Apr026',
    'May026',
    'Jun026',
    'July026',
    'Aug026',
    'Sep026',
    'Oct026',
    'Nov026',
    'Dec026',
    'Jan027',
    'Feb027',
    'Mar027',
  ];

  return [
    month.excelKey,
    legacy[monthIndex],
  ].filter(Boolean);
};


/* =========================================================
   READ EXCEL WORKBOOK
========================================================= */

async function readWorkbook() {
  const result =
    await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        '*/*',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

  if (
    result.canceled ||
    !result.assets ||
    result.assets.length === 0
  ) {
    return null;
  }

  const asset = result.assets[0];

  const base64 =
    await FileSystem.readAsStringAsync(
      asset.uri,
      {
        encoding:
          FileSystem.EncodingType.Base64,
      }
    );

  const workbook =
    XLSX.read(base64, {
      type: 'base64',
    });

  const sheetName =
    workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error(
      'The workbook has no worksheet.'
    );
  }

  const worksheet =
    workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(
      'Could not read the first worksheet.'
    );
  }

  const rows =
    XLSX.utils.sheet_to_json<
      Record<string, unknown>
    >(worksheet, {
      defval: '',
    });

  return {
    fileName:
      asset.name ||
      'Imported_Workbook.xlsx',

    sheetName,

    rows,
  };
}


/* =========================================================
   EXCEL IMPORT PREVIEW
========================================================= */

export async function pickExcelImportPreview() {
  const workbook =
    await readWorkbook();

  if (!workbook) {
    return null;
  }

  const rawRows =
    workbook.rows;

  const students =
    await schoolDb.students('');

  const importRows: ExcelImportRow[] =
    [];

  let invalidRows = 0;
  let duplicateStudents = 0;
  let existingToUpdate = 0;

  /*
   * Track duplicates inside the
   * selected workbook.
   */
  const seen = new Set<string>();

  for (const raw of rawRows) {
    const headers =
      Object.keys(raw);

    const nameColumn =
      findColumn(headers, [
        'Student_Name',
        'Student Name',
        'Name',
      ]);

    const classColumn =
      findColumn(headers, [
        'Class',
        'Class_Name',
      ]);

    const rnoColumn =
      findColumn(headers, [
        'RNo',
        'R No',
        'Roll No',
      ]);

    const feeColumn =
      findColumn(headers, [
        'Fee',
        'Monthly Fee',
      ]);

    const categoryColumn =
      findColumn(headers, [
        'Category',
      ]);

    const notesColumn =
      findColumn(headers, [
        'Notes',
      ]);

    const name =
      nameColumn >= 0
        ? String(
            raw[headers[nameColumn]] ??
              ''
          ).trim()
        : '';

    const className =
      classColumn >= 0
        ? String(
            raw[headers[classColumn]] ??
              ''
          ).trim()
        : '';

    const rno =
      rnoColumn >= 0
        ? String(
            raw[headers[rnoColumn]] ??
              ''
          ).trim()
        : '';

    const monthlyFee =
      feeColumn >= 0
        ? Number(
            raw[headers[feeColumn]] ??
              0
          )
        : 0;

    const category =
      categoryColumn >= 0
        ? String(
            raw[
              headers[categoryColumn]
            ] ?? ''
          ).trim()
        : 'Normal';

    const notes =
      notesColumn >= 0
        ? String(
            raw[headers[notesColumn]] ??
              ''
          ).trim()
        : '';

    /*
     * Completely blank rows are ignored.
     */
    if (
      !name &&
      !className &&
      !rno
    ) {
      continue;
    }

    /*
     * Basic validation.
     */
    if (
      !name ||
      !className ||
      !Number.isFinite(
        monthlyFee
      ) ||
      monthlyFee < 0
    ) {
      invalidRows++;
      continue;
    }

    const duplicateKey =
      `${name.toLowerCase()}|${className.toLowerCase()}`;

    /*
     * Duplicate inside selected Excel file.
     */
    if (
      seen.has(duplicateKey)
    ) {
      duplicateStudents++;
      continue;
    }

    seen.add(duplicateKey);

    /*
     * Student already exists in the
     * database.
     *
     * BUG FIX:
     *
     * This is NOT a duplicate to skip -
     * it means the Excel row should
     * UPDATE this student. Previously
     * this row was thrown away here,
     * which is why 167 real students
     * never got updated during import.
     */
    const existing =
      students.find(
        (student) =>
          student.name
            .trim()
            .toLowerCase() ===
            name.toLowerCase() &&
          student.className
            .trim()
            .toLowerCase() ===
            className.toLowerCase()
      );

    let existingStudentId:
      | string
      | undefined;

    if (existing) {
      existingToUpdate++;
      existingStudentId =
        existing.id;
    }

    const balancesByMonth:
      Record<string, number> = {};

    for (
      const month of SCHOOL_MONTHS
    ) {
      const columnNames =
        getMonthColumnNames(
          month.index
        );

      let value = '';

      for (
        const columnName of columnNames
      ) {
        const actualHeader =
          headers.find(
            (header) =>
              normalizeHeader(
                header
              ) ===
              normalizeHeader(
                columnName
              )
          );

        if (
  actualHeader !==
  undefined
) {
  value = String(
    raw[actualHeader] ?? ''
  );
  break;
}
      }

      const numeric =
        Number(value);

      if (
        Number.isFinite(numeric)
      ) {
        balancesByMonth[
          month.key
        ] = Math.max(
          0,
          numeric
        );
      }
    }

    importRows.push({
      rno,
      name,
      className,
      monthlyFee,
      category:
        category || 'Normal',
      notes,
      balancesByMonth,
      existingStudentId,
    });
  }

  return {
    fileName:
      workbook.fileName,

    sheetName:
      workbook.sheetName,

    newStudents:
      importRows.length -
      existingToUpdate,

    existingToUpdate,

    invalidRows,

    duplicateStudents,

    rows: importRows,
  };
}


/* =========================================================
   COMMIT EXCEL IMPORT
========================================================= */

export async function importExcelRows(
  rows: ExcelImportRow[]
) {
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      /*
       * If the preview already found the
       * exact existing student, update
       * that exact one - no need to
       * search again.
       */
      if (row.existingStudentId) {
        await schoolDb.updateStudentFromImportedExcel(
          row.existingStudentId,
          row
        );
        updated++;
        continue;
      }

      const existing =
        await schoolDb.findStudents(
          row.name,
          row.className
        );

      if (existing.length > 1) {
        // Never guess if Name + Class is duplicated.
        skipped++;
        continue;
      }

      if (existing.length === 1) {
        await schoolDb.updateStudentFromImportedExcel(
          existing[0].id,
          row
        );
        updated++;
        continue;
      }

      await schoolDb.addStudentWithImportedBalances(
        {
          rno: row.rno,
          name: row.name,
          className: row.className,
          monthlyFee: row.monthlyFee,
          category: row.category || 'Normal',
          status: 'Active',
          admissionDate: todayKarachi(),
          notes: row.notes || '',
        },
        row.balancesByMonth
      );

      imported++;
    } catch (error) {
      console.error('Excel import row failed:', error);
      skipped++;
    }
  }

  return {
    imported,
    updated,
    skipped,
  };
}


/* =========================================================
   FULL EXCEL LEDGER EXPORT
========================================================= */

export async function exportFeeLedgerExcel() {
  const settings =
    await schoolDb.settings();

  const students =
    await schoolDb.students('');

  const rows:
    Record<string, unknown>[] =
    [];

  for (
    const student of students
  ) {
    const history =
      await schoolDb.studentHistory(
        student.id
      );

    const months =
      history.months;

    const monthValues:
      Record<string, number> =
      {};

    /*
     * Create all month columns.
     */
    for (
      const schoolMonth of
        SCHOOL_MONTHS
    ) {
      const month =
        months.find(
          (item) =>
            item.monthKey ===
            schoolMonth.key
        );

      if (!month) {
        monthValues[
          schoolMonth.excelKey
        ] = 0;

        continue;
      }

      /*
       * CURRENT / PREVIOUS
       *
       * Excel stores remaining.
       */
      if (
        schoolMonth.index <=
        settings.currentFeeMonthIndex
      ) {
        monthValues[
          schoolMonth.excelKey
        ] =
          Math.max(
            0,
            month.feeDue -
              month.paidAmount
          );

        continue;
      }

      /*
       * FUTURE
       *
       * Only advance is shown.
       * Normal future fee = 0.
       */
      monthValues[
        schoolMonth.excelKey
      ] =
        month.advanceAmount > 0
          ? month.advanceAmount
          : 0;
    }

    /*
     * Find current/previous unpaid months.
     */
    const unpaidMonths =
      months
        .filter((month) => {
          const info =
            SCHOOL_MONTHS.find(
              (item) =>
                item.key ===
                month.monthKey
            );

          return (
            info !== undefined &&
            info.index <=
              settings.currentFeeMonthIndex &&
            month.remaining > 0
          );
        })
        .sort((a, b) => {
          const aIndex =
            SCHOOL_MONTHS.find(
              (item) =>
                item.key ===
                a.monthKey
            )?.index ?? 99;

          const bIndex =
            SCHOOL_MONTHS.find(
              (item) =>
                item.key ===
                b.monthKey
            )?.index ?? 99;

          return (
            aIndex - bIndex
          );
        });

    let currentMonth = '';

    /*
     * If dues exist, show them.
     */
    if (
      unpaidMonths.length > 0
    ) {
      const labels =
        unpaidMonths.map(
          (month) =>
            SCHOOL_MONTHS.find(
              (item) =>
                item.key ===
                month.monthKey
            )?.shortLabel ??
            month.monthKey
        );

      const year =
        labels[0]
          ?.split('_')[1] ??
        '26';

      const names =
        labels
          .map(
            (label) =>
              label.split('_')[0]
          )
          .join('/');

      currentMonth =
        `${names}_${year}`;
    } else {
      /*
       * No unpaid dues.
       *
       * Look for future advance.
       */
      const futureAdvance =
        months
          .filter((month) => {
            const info =
              SCHOOL_MONTHS.find(
                (item) =>
                  item.key ===
                  month.monthKey
              );

            return (
              info !== undefined &&
              info.index >
                settings.currentFeeMonthIndex &&
              month.advanceAmount > 0
            );
          })
          .sort((a, b) => {
            const aIndex =
              SCHOOL_MONTHS.find(
                (item) =>
                  item.key ===
                  a.monthKey
              )?.index ?? 99;

            const bIndex =
              SCHOOL_MONTHS.find(
                (item) =>
                  item.key ===
                  b.monthKey
              )?.index ?? 99;

            return (
              aIndex - bIndex
            );
          });

      if (
        futureAdvance.length > 0
      ) {
        currentMonth =
          SCHOOL_MONTHS.find(
            (item) =>
              item.key ===
              futureAdvance[0]
                .monthKey
          )?.shortLabel ??
          futureAdvance[0]
            .monthKey;
      } else {
        /*
         * Nothing unpaid.
         * Show next academic month.
         */
        const nextIndex =
          Math.min(
            settings.currentFeeMonthIndex +
              1,
            SCHOOL_MONTHS.length - 1
          );

        currentMonth =
          SCHOOL_MONTHS[
            nextIndex
          ]?.shortLabel ?? '';
      }
    }

    /*
     * Remaining = current/previous
     * outstanding + future advance.
     */
    const currentOutstanding =
      unpaidMonths.reduce(
        (sum, month) =>
          sum + month.remaining,
        0
      );

    const futureAdvanceAmount =
      months
        .filter((month) => {
          const info =
            SCHOOL_MONTHS.find(
              (item) =>
                item.key ===
                month.monthKey
            );

          return (
            info !== undefined &&
            info.index >
              settings.currentFeeMonthIndex &&
            month.advanceAmount > 0
          );
        })
        .reduce(
          (sum, month) =>
            sum +
            month.advanceAmount,
          0
        );

    const remaining =
      currentOutstanding +
      futureAdvanceAmount;

    rows.push({
      RNo: student.rno,
      Student_Name:
        student.name,
      Class:
        student.className,
      Fee:
        student.monthlyFee,

      ...monthValues,

      Current_Month:
        currentMonth,

      Remaining:
        remaining,

      Total_Fee:
        remaining,

      Category:
        student.category,
    });
  }

  const workbook =
    XLSX.utils.book_new();

  /*
   * Exact Excel column order.
   */
  const headers = [
    'RNo',
    'Student_Name',
    'Class',
    'Fee',

    ...SCHOOL_MONTHS.map(
      (month) =>
        month.excelKey
    ),

    'Current_Month',
    'Remaining',
    'Total_Fee',
    'Category',
  ];

  const worksheet =
    XLSX.utils.json_to_sheet(
      rows,
      {
        header: headers,
      }
    );

  /*
   * Make columns reasonably wide.
   */
  worksheet['!cols'] = headers.map(
    (header) => ({
      wch:
        header ===
        'Student_Name'
          ? 25
          : header === 'Current_Month'
            ? 22
            : 14,
    })
  );

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Fee Ledger'
  );

  const base64 =
    XLSX.write(workbook, {
      type: 'base64',
      bookType: 'xlsx',
    });

  const uri =
    `${FileSystem.documentDirectory}` +
    `School_Fee_Ledger.xlsx`;

  await FileSystem.writeAsStringAsync(
    uri,
    base64,
    {
      encoding:
        FileSystem.EncodingType.Base64,
    }
  );

  if (
    await Sharing.isAvailableAsync()
  ) {
    await Sharing.shareAsync(
      uri,
      {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }
    );
  }

  return uri;
}


/* =========================================================
   DAILY CASH REPORT
========================================================= */

export async function exportDailyReport(
  format:
    | 'csv'
    | 'txt'
    | 'xlsx' = 'csv',
  date = todayKarachi()
) {
  const settings =
    await schoolDb.settings();

  const payments =
    await schoolDb.payments(
      date
    );

  const expenses =
    await schoolDb.expenses(
      date
    );

  const totalPayments =
    payments.reduce(
      (sum: number, row: any) =>
        sum + row.amount,
      0
    );

  const totalExpenses =
    expenses.reduce(
      (sum: number, row: any) =>
        sum + row.amount,
      0
    );

  const netCash =
    totalPayments -
    totalExpenses;

  const stamp =
    date.replace(/-/g, '');


  /* -------------------------------------------------------
     TXT
  ------------------------------------------------------- */

  if (format === 'txt') {
    const lines = [
      settings.schoolName,
      settings.schoolAddress,
      settings.phone,

      '',
      '========================================',
      '          SCHOOL DAILY CASH REPORT',
      '========================================',

      `Date: ${formatDate(date)}`,

      '',
      'FEE COLLECTION',
      '----------------------------------------',

      ...payments.map(
        (row: any) =>
          `${row.name} | ${row.class_name} | ${currency(
            row.amount,
            settings.currency
          )} | ${row.allocations || ''}`
      ),

      '',
      `TOTAL FEES: ${currency(
        totalPayments,
        settings.currency
      )}`,

      '',
      'EXPENSES',
      '----------------------------------------',

      ...expenses.map(
        (row: any) =>
          `${row.name} | ${currency(
            row.amount,
            settings.currency
          )} | ${row.category}`
      ),

      '',
      `TOTAL EXPENSES: ${currency(
        totalExpenses,
        settings.currency
      )}`,

      '',
      '========================================',
      `NET CASH: ${currency(
        netCash,
        settings.currency
      )}`,
      '========================================',
    ];

    return writeAndShare(
      `Daily_Cash_Report_${stamp}.txt`,
      lines.join('\n'),
      'text/plain'
    );
  }


  /* -------------------------------------------------------
     XLSX
  ------------------------------------------------------- */

  if (format === 'xlsx') {
    const workbook =
      XLSX.utils.book_new();

    const paymentRows =
      payments.map(
        (row: any) => ({
          Student:
            row.name,

          Class:
            row.class_name,

          Amount:
            row.amount,

          Method:
            row.method,

          Date:
            row.payment_date,

          Months:
            row.allocations ||
            '',
        })
      );

    const expenseRows =
      expenses.map(
        (row: any) => ({
          Expense:
            row.name,

          Category:
            row.category,

          Amount:
            row.amount,

          Date:
            row.expense_date,

          Notes:
            row.notes || '',
        })
      );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        paymentRows
      ),
      'Fee Collection'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        expenseRows
      ),
      'Expenses'
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          TotalCollection:
            totalPayments,

          TotalExpenses:
            totalExpenses,

          NetCash:
            netCash,
        },
      ]),
      'Summary'
    );

    const base64 =
      XLSX.write(workbook, {
        type: 'base64',
        bookType: 'xlsx',
      });

    const uri =
      `${FileSystem.documentDirectory}` +
      `Daily_Cash_Report_${stamp}.xlsx`;

    await FileSystem.writeAsStringAsync(
      uri,
      base64,
      {
        encoding:
          FileSystem.EncodingType.Base64,
      }
    );

    if (
      await Sharing.isAvailableAsync()
    ) {
      await Sharing.shareAsync(
        uri,
        {
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      );
    }

    return uri;
  }


  /* -------------------------------------------------------
     CSV
  ------------------------------------------------------- */

  const rows = [
    'Section,Name,Class,Amount,Method/Category,Date,Months',

    ...payments.map(
      (row: any) =>
        `Payment,${safe(
          row.name
        )},${safe(
          row.class_name
        )},${row.amount},${safe(
          row.method
        )},${row.payment_date},${safe(
          row.allocations
        )}`
    ),

    ...expenses.map(
      (row: any) =>
        `Expense,${safe(
          row.name
        )},,${row.amount},${safe(
          row.category
        )},${row.expense_date},`
    ),

    `Total Collection,,,${totalPayments},,,`,
    `Total Expenses,,,${totalExpenses},,,`,
    `Net Cash,,,${netCash},,,`,
  ];

  return writeAndShare(
    `Daily_Cash_Report_${stamp}.csv`,
    rows.join('\n'),
    'text/csv'
  );
}


/* =========================================================
   STUDENT HISTORY EXPORT
========================================================= */

export async function exportStudentHistory(
  studentId: string
) {
  const history =
    await schoolDb.studentHistory(
      studentId
    );

  const rows = [
    'Month,Fee Due,Additional Fee,Paid,Remaining,Status',

    ...history.months.map(
      (row) =>
        `${SCHOOL_MONTHS.find(
          (month) =>
            month.key ===
            row.monthKey
        )?.label || row.monthKey},${row.baseFee},${row.additionalFee},${row.paidAmount},${row.remaining},${row.status}`
    ),

    '',

    'Date,Amount,Method,Allocation',

    ...history.payments.map(
      (row: any) =>
        `${row.payment_date},${row.amount},${row.method},${safe(
          row.allocations
        )}`
    ),
  ];

  return writeAndShare(
    `Student_History_${safe(
      history.student.name
    )}_${safe(
      history.student.className
    )}.csv`,
    rows.join('\n'),
    'text/csv'
  );
}