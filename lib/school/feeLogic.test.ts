import { describe, expect, test } from 'bun:test';
import { SCHOOL_MONTHS } from './calendar';
import { calculateCurrentMonth, createPaymentPreview, withStatus } from './feeLogic';

const month = (monthKey: string, remaining: number, fee = 1400) => withStatus({
  id: monthKey,
  studentId: 'student',
  monthKey,
  baseFee: fee,
  additionalFee: 0,
  paidAmount: fee - remaining,
  createdAt: '',
  updatedAt: '',
});

describe('oldest unpaid payment allocation', () => {
  test('clears June and July before August for 2800', () => {
    const preview = createPaymentPreview([month('2026-06', 1400), month('2026-07', 1400), month('2026-08', 1400)], 2800, 4);
    expect(preview.excessAmount).toBe(0);
    expect(preview.allocations.map((item) => [item.monthKey, item.applied, item.afterRemaining])).toEqual([
      ['2026-06', 1400, 0],
      ['2026-07', 1400, 0],
    ]);
  });

  test('partially pays the oldest unpaid month and stops', () => {
    const preview = createPaymentPreview([month('2026-06', 1400), month('2026-07', 1400), month('2026-08', 1400)], 500, 4);
    expect(preview.allocations).toHaveLength(1);
    expect(preview.allocations[0]).toMatchObject({ monthKey: '2026-06', applied: 500, afterRemaining: 900, status: 'PARTIAL' });
  });

  test('reports excess instead of silently applying future payments', () => {
    const preview = createPaymentPreview([month('2026-08', 1400)], 2000, 4);
    expect(preview.allocations[0].afterRemaining).toBe(0);
    expect(preview.excessAmount).toBe(600);
  });

  test('current month joins unpaid months in readable order', () => {
    const value = calculateCurrentMonth([month('2026-06', 0), month('2026-07', 800), month('2026-08', 1400)], 4);
    expect(value).toBe('Jul/Aug_26');
  });

  test('moves to next current month after due months are paid', () => {
    const value = calculateCurrentMonth(SCHOOL_MONTHS.slice(0, 5).map((item) => month(item.key, 0)), 4);
    expect(value).toBe('Sep_26');
  });
});
