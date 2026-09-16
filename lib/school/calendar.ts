export type SchoolMonth = {
  key: string;
  label: string;
  shortLabel: string;
  excelKey: string;
  index: number;
};

export const SCHOOL_MONTHS: SchoolMonth[] = [
  { key: '2026-04', label: 'April 2026', shortLabel: 'Apr_26', excelKey: 'Apr2026', index: 0 },
  { key: '2026-05', label: 'May 2026', shortLabel: 'May_26', excelKey: 'May2026', index: 1 },
  { key: '2026-06', label: 'June 2026', shortLabel: 'Jun_26', excelKey: 'Jun2026', index: 2 },
  { key: '2026-07', label: 'July 2026', shortLabel: 'Jul_26', excelKey: 'July2026', index: 3 },
  { key: '2026-08', label: 'August 2026', shortLabel: 'Aug_26', excelKey: 'Aug2026', index: 4 },
  { key: '2026-09', label: 'September 2026', shortLabel: 'Sep_26', excelKey: 'Sep2026', index: 5 },
  { key: '2026-10', label: 'October 2026', shortLabel: 'Oct_26', excelKey: 'Oct2026', index: 6 },
  { key: '2026-11', label: 'November 2026', shortLabel: 'Nov_26', excelKey: 'Nov2026', index: 7 },
  { key: '2026-12', label: 'December 2026', shortLabel: 'Dec_26', excelKey: 'Dec2026', index: 8 },
  { key: '2027-01', label: 'January 2027', shortLabel: 'Jan_27', excelKey: 'Jan2027', index: 9 },
  { key: '2027-02', label: 'February 2027', shortLabel: 'Feb_27', excelKey: 'Feb2027', index: 10 },
  { key: '2027-03', label: 'March 2027', shortLabel: 'Mar_27', excelKey: 'Mar2027', index: 11 },
];

export const getMonth = (key: string) => SCHOOL_MONTHS.find((month) => month.key === key);

export const getCurrentAcademicMonthIndex = () => {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return SCHOOL_MONTHS.find((month) => month.key === key)?.index ?? 5;
};

export const formatDate = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00+05:00`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date).replace(/ /g, '-');
};

export const todayKarachi = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const nowKarachiIso = () => new Date().toISOString();

export const currency = (amount: number, symbol = 'Rs.') => `${symbol} ${Math.round(amount).toLocaleString('en-PK')}`;
