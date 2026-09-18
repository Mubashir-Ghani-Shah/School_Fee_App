import { SCHOOL_MONTHS } from './calendar';
import type {
  AllocationPreview,
  MonthlyFeeStatus,
} from './types';

/**
 * Get academic month index.
 */
const getMonthIndex = (monthKey: string) => {
  return (
    SCHOOL_MONTHS.find(
      (item) => item.key === monthKey
    )?.index ?? 99
  );
};

/**
 * Calculate the status of one month.
 *
 * IMPORTANT:
 * Future months are NOT unpaid.
 * If a future month has advance money, its status is ADVANCE.
 */
export const withStatus = (
  row: Omit<
    MonthlyFeeStatus,
    'feeDue' | 'remaining' | 'status'
  >,
  dueThroughIndex = SCHOOL_MONTHS.length - 1
): MonthlyFeeStatus => {
  const feeDue =
    row.baseFee + row.additionalFee;

  const monthIndex = getMonthIndex(
    row.monthKey
  );

  const isFuture =
    monthIndex > dueThroughIndex;

  /**
   * FUTURE MONTH
   */
  if (isFuture) {
    if (row.advanceAmount > 0) {
      return {
        ...row,
        feeDue,
        remaining: 0,
        status: 'Advance',
      };
    }

    return {
      ...row,
      feeDue,
      remaining: 0,
      status: 'Not due',
    };
  }

  /**
   * CURRENT / PREVIOUS MONTH
   */
  const remaining = Math.max(
    0,
    feeDue - row.paidAmount
  );

  let status:
    | 'Paid'
    | 'Partial'
    | 'Unpaid';

  if (remaining === 0) {
    status = 'Paid';
  } else if (row.paidAmount > 0) {
    status = 'Partial';
  } else {
    status = 'Unpaid';
  }

  return {
    ...row,
    feeDue,
    remaining,
    status,
  };
};

/**
 * Calculate outstanding amount.
 *
 * Only current and previous months are counted.
 * Future normal fees are NOT counted.
 *
 * Future advance money is also not counted as unpaid.
 */
export const calculateRemaining = (
  months: MonthlyFeeStatus[],
  dueThroughIndex = SCHOOL_MONTHS.length - 1
) => {
  return months
    .filter((month) => {
      const index = getMonthIndex(
        month.monthKey
      );

      return (
        index <= dueThroughIndex &&
        month.remaining > 0
      );
    })
    .reduce(
      (sum, month) =>
        sum + month.remaining,
      0
    );
};

/**
 * Calculate Current_Month.
 *
 * Example:
 *
 * June unpaid + July unpaid + August unpaid
 * -> Jun/Jul/Aug_26
 *
 * No unpaid current/previous month:
 * -> next month
 *
 * Future advance exists:
 * -> show that future advance month.
 */
export const calculateCurrentMonth = (
  months: MonthlyFeeStatus[],
  dueThroughIndex: number
) => {
  /**
   * First find unpaid current/previous months.
   */
  const unpaidMonths = months
    .filter((month) => {
      const index = getMonthIndex(
        month.monthKey
      );

      return (
        index <= dueThroughIndex &&
        month.remaining > 0
      );
    })
    .sort(
      (a, b) =>
        getMonthIndex(a.monthKey) -
        getMonthIndex(b.monthKey)
    );

  if (unpaidMonths.length > 0) {
    const labels = unpaidMonths.map(
      (month) =>
        SCHOOL_MONTHS.find(
          (item) =>
            item.key === month.monthKey
        )?.shortLabel ?? month.monthKey
    );

    /**
     * Convert:
     * Jun_26, Jul_26, Aug_26
     *
     * into:
     * Jun/Jul/Aug_26
     */
    const year =
      labels[0]?.split('_')[1] ?? '26';

    const monthNames = labels
      .map(
        (label) =>
          label.split('_')[0]
      )
      .join('/');

    return `${monthNames}_${year}`;
  }

  /**
   * No unpaid current/previous month.
   *
   * Look for the first future month
   * containing advance money.
   */
  const futureAdvance = months
    .filter((month) => {
      const index = getMonthIndex(
        month.monthKey
      );

      return (
        index > dueThroughIndex &&
        month.advanceAmount > 0
      );
    })
    .sort(
      (a, b) =>
        getMonthIndex(a.monthKey) -
        getMonthIndex(b.monthKey)
    );

  if (futureAdvance.length > 0) {
    return (
      SCHOOL_MONTHS.find(
        (item) =>
          item.key ===
          futureAdvance[0].monthKey
      )?.shortLabel ??
      futureAdvance[0].monthKey
    );
  }

  /**
   * Nothing unpaid and no advance.
   *
   * Show the next academic month.
   */
  const nextIndex = Math.min(
    dueThroughIndex + 1,
    SCHOOL_MONTHS.length - 1
  );

  return (
    SCHOOL_MONTHS[nextIndex]?.shortLabel ??
    SCHOOL_MONTHS[SCHOOL_MONTHS.length - 1]
      .shortLabel
  );
};

/**
 * Create payment allocation preview.
 *
 * RULE:
 *
 * 1. Oldest unpaid month first.
 * 2. Then next unpaid month.
 * 3. Once all current/previous dues are cleared,
 *    extra money becomes ADVANCE.
 * 4. Advance goes to the earliest future month.
 */
export const createPaymentPreview = (
  months: MonthlyFeeStatus[],
  paymentAmount: number,
  dueThroughIndex: number
) => {
  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    throw new Error(
      'Payment amount must be greater than zero.'
    );
  }

  let remainingPayment =
    paymentAmount;

  const allocations: AllocationPreview[] =
    [];

  /**
   * STEP 1
   *
   * Find current + previous unpaid months.
   */
  const dueMonths = [...months]
    .filter((month) => {
      const index = getMonthIndex(
        month.monthKey
      );

      return (
        index <= dueThroughIndex &&
        month.remaining > 0
      );
    })
    .sort(
      (a, b) =>
        getMonthIndex(a.monthKey) -
        getMonthIndex(b.monthKey)
    );

  /**
   * Pay old dues first.
   */
  for (const month of dueMonths) {
    if (remainingPayment <= 0) {
      break;
    }

    const applied = Math.min(
      month.remaining,
      remainingPayment
    );

    const afterRemaining =
      month.remaining - applied;

    allocations.push({
      monthKey: month.monthKey,
      applied,
      beforeRemaining:
        month.remaining,
      afterRemaining,
      status:
        afterRemaining === 0
          ? 'PAID'
          : 'PARTIAL',
    });

    remainingPayment -= applied;
  }

  /**
   * STEP 2
   *
   * If money is still left, it becomes ADVANCE.
   *
   * Example:
   *
   * September current.
   * Student pays 2500.
   *
   * September = 0
   * October = 2500 ADVANCE
   */
  if (remainingPayment > 0) {
    const futureMonths = [...months]
      .filter((month) => {
        const index = getMonthIndex(
          month.monthKey
        );

        return index > dueThroughIndex;
      })
      .sort(
        (a, b) =>
          getMonthIndex(a.monthKey) -
          getMonthIndex(b.monthKey)
      );

    for (const month of futureMonths) {
      if (remainingPayment <= 0) {
        break;
      }

      /**
       * We put the remaining payment
       * into the earliest future month.
       *
       * It is marked ADVANCE, not PAID.
       */
      allocations.push({
        monthKey: month.monthKey,
        applied: remainingPayment,
        beforeRemaining:
          month.advanceAmount,
        afterRemaining:
          month.advanceAmount +
          remainingPayment,
        status: 'ADVANCE',
      });

      remainingPayment = 0;
    }
  }

  return {
    allocations,
    excessAmount: remainingPayment,
  };
};
