import { describe, expect, test } from 'bun:test';
import {
  createPaymentPreview,
  withStatus,
} from './feeLogic';

const makeMonth = (
  monthKey: string,
  paidAmount = 0,
  advanceAmount = 0
) => {
  return withStatus({
    id: monthKey,
    studentId: 'student-1',
    monthKey,
    baseFee: 1400,
    additionalFee: 0,
    paidAmount,
    advanceAmount,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
};

describe('oldest unpaid payment allocation', () => {

  test('clears June and July before August for 2800', () => {
    const months = [
      makeMonth('2026-06'),
      makeMonth('2026-07'),
      makeMonth('2026-08'),
    ];

    const result = createPaymentPreview(
      months,
      2800,
      4
    );

    expect(result.allocations).toEqual([
      {
        monthKey: '2026-06',
        applied: 1400,
        beforeRemaining: 1400,
        afterRemaining: 0,
        status: 'PAID',
      },
      {
        monthKey: '2026-07',
        applied: 1400,
        beforeRemaining: 1400,
        afterRemaining: 0,
        status: 'PAID',
      },
    ]);

    expect(result.excessAmount).toBe(0);
  });


  test('partially pays the oldest unpaid month and stops', () => {
    const months = [
      makeMonth('2026-06'),
      makeMonth('2026-07'),
      makeMonth('2026-08'),
    ];

    const result = createPaymentPreview(
      months,
      500,
      4
    );

    expect(result.allocations).toEqual([
      {
        monthKey: '2026-06',
        applied: 500,
        beforeRemaining: 1400,
        afterRemaining: 900,
        status: 'PARTIAL',
      },
    ]);

    expect(result.excessAmount).toBe(0);
  });


  test('extra payment becomes advance after all dues are cleared', () => {
    const months = [
      makeMonth('2026-09'),
      makeMonth('2026-10'),
      makeMonth('2026-11'),
    ];

    const result = createPaymentPreview(
      months,
      2500,
      5
    );

    expect(result.allocations).toEqual([
      {
        monthKey: '2026-09',
        applied: 1400,
        beforeRemaining: 1400,
        afterRemaining: 0,
        status: 'PAID',
      },
      {
        monthKey: '2026-10',
        applied: 1100,
        beforeRemaining: 0,
        afterRemaining: 1100,
        status: 'ADVANCE',
      },
    ]);

    expect(result.excessAmount).toBe(0);
  });


  test('future month with advance is not unpaid', () => {
    const month = withStatus(
      {
        id: 'oct',
        studentId: 'student-1',
        monthKey: '2026-10',
        baseFee: 1400,
        additionalFee: 0,
        paidAmount: 0,
        advanceAmount: 2500,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      5
    );

    expect(month.status).toBe('Advance');
    expect(month.remaining).toBe(0);
  });


  test('future month without advance is not due', () => {
    const month = withStatus(
      {
        id: 'oct',
        studentId: 'student-1',
        monthKey: '2026-10',
        baseFee: 1400,
        additionalFee: 0,
        paidAmount: 0,
        advanceAmount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      5
    );

    expect(month.status).toBe('Not due');
    expect(month.remaining).toBe(0);
  });

});