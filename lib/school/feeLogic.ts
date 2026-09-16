import { SCHOOL_MONTHS } from './calendar';
import type { AllocationPreview, MonthlyFeeStatus } from './types';

export const withStatus = (row: Omit<MonthlyFeeStatus, 'feeDue' | 'remaining' | 'status'>): MonthlyFeeStatus => {
  const feeDue = row.baseFee + row.additionalFee;
  const remaining = Math.max(0, feeDue - row.paidAmount);
  const status = remaining === 0 ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid';
  return { ...row, feeDue, remaining, status };
};

export const calculateRemaining = (months: MonthlyFeeStatus[], dueThroughIndex = SCHOOL_MONTHS.length - 1) =>
  months
    .filter((month) => (SCHOOL_MONTHS.find((item) => item.key === month.monthKey)?.index ?? 99) <= dueThroughIndex)
    .reduce((sum, month) => sum + month.remaining, 0);

export const calculateCurrentMonth = (months: MonthlyFeeStatus[], dueThroughIndex: number) => {
  const dueMonths = months.filter((month) => {
    const index = SCHOOL_MONTHS.find((item) => item.key === month.monthKey)?.index ?? 99;
    return index <= dueThroughIndex && month.remaining > 0;
  });

  if (dueMonths.length > 0) {
    const labels = dueMonths.map((month) => SCHOOL_MONTHS.find((item) => item.key === month.monthKey)?.shortLabel.replace('_', '/') ?? month.monthKey);
    const suffix = labels[0]?.split('/')[1] ?? '26';
    const names = labels.map((label) => label.split('/')[0]).join('/');
    return `${names}_${suffix}`;
  }

  const next = SCHOOL_MONTHS[Math.min(dueThroughIndex + 1, SCHOOL_MONTHS.length - 1)];
  return next.shortLabel;
};

export const createPaymentPreview = (months: MonthlyFeeStatus[], paymentAmount: number, dueThroughIndex: number) => {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  let remainingPayment = paymentAmount;
  const allocations: AllocationPreview[] = [];
  const dueMonths = [...months]
    .filter((month) => {
      const index = SCHOOL_MONTHS.find((item) => item.key === month.monthKey)?.index ?? 99;
      return index <= dueThroughIndex && month.remaining > 0;
    })
    .sort((a, b) => (SCHOOL_MONTHS.find((item) => item.key === a.monthKey)?.index ?? 0) - (SCHOOL_MONTHS.find((item) => item.key === b.monthKey)?.index ?? 0));

  for (const month of dueMonths) {
    if (remainingPayment <= 0) break;
    const applied = Math.min(month.remaining, remainingPayment);
    const afterRemaining = month.remaining - applied;
    allocations.push({
      monthKey: month.monthKey,
      applied,
      beforeRemaining: month.remaining,
      afterRemaining,
      status: afterRemaining === 0 ? 'PAID' : 'PARTIAL',
    });
    remainingPayment -= applied;
  }

  return { allocations, excessAmount: remainingPayment };
};
