import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  Card,
  ConfirmModal,
  Field,
  Loading,
  Notice,
  Page,
  Table,
  colors,
} from '@/components/school/Ui';
import { SCHOOL_MONTHS, currency, todayKarachi } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { useAsyncData } from '@/lib/school/useSchoolData';
import type { AllocationPreview, Student } from '@/lib/school/types';

export default function PaymentsScreen() {
  const [form, setForm] = useState({
    name: '',
    className: '',
    amount: '',
    date: todayKarachi(),
    method: 'Cash',
    reference: '',
    notes: '',
  });

  const [matches, setMatches] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);

  const [preview, setPreview] = useState<{
    allocations: AllocationPreview[];
    excessAmount: number;
  } | null>(null);

  const [message, setMessage] = useState('');

  const today = useAsyncData(
    () => schoolDb.payments(todayKarachi()),
    []
  );

  const buildPreview = async (chosen?: Student) => {
    try {
      setMessage('');

      const selected = chosen || student;

      if (!selected) {
        const found = await schoolDb.findStudents(
          form.name,
          form.className
        );

        setMatches(found);

        if (found.length === 0) {
          setMessage(
            'No matching student found. Check name and class.'
          );
          return;
        }

        if (found.length > 1) {
          setMessage(
            'Multiple exact matches found. Select the correct student.'
          );
          return;
        }

        setStudent(found[0]);
        return buildPreview(found[0]);
      }

      const amount = Number(form.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        setMessage('Payment amount must be greater than zero.');
        return;
      }

      const result = await schoolDb.paymentPreview(
        selected.id,
        amount
      );

      setPreview(result);

      if (result.allocations.length === 0) {
        setMessage(
          'No month is available for this payment.'
        );
      }

      if (result.excessAmount > 0) {
        setMessage(
          `The academic year has no more available months. Excess: ${currency(
            result.excessAmount
          )}`
        );
      }
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Could not preview payment.'
      );
    }
  };

  const savePayment = async () => {
    if (!student || !preview) return;

    if (preview.excessAmount > 0) {
      setMessage(
        'This payment is larger than the remaining academic-year months.'
      );
      return;
    }

    try {
      await schoolDb.addPayment({
        studentId: student.id,
        amount: Number(form.amount),
        paymentDate: form.date,
        method: form.method as any,
        reference: form.reference,
        notes: form.notes,
      });

      setPreview(null);
      setStudent(null);
      setMatches([]);

      setForm({
        name: '',
        className: '',
        amount: '',
        date: todayKarachi(),
        method: 'Cash',
        reference: '',
        notes: '',
      });

      setMessage(
        'Payment saved successfully. Oldest dues were cleared first and extra money was added as advance.'
      );

      await today.reload();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Could not save payment.'
      );
    }
  };

  const monthLabel = (monthKey: string) =>
    SCHOOL_MONTHS.find(
      (month) => month.key === monthKey
    )?.label || monthKey;

  const allocationLabel = (allocation: AllocationPreview) => {
    if (allocation.status === 'ADVANCE') {
      return `${monthLabel(allocation.monthKey)} — ADVANCE`;
    }

    return monthLabel(allocation.monthKey);
  };

  return (
    <Page
      title="Add Payment"
      subtitle="Oldest unpaid months are paid first. Extra money automatically becomes advance."
    >
      {message ? (
        <Notice
          text={message}
          tone={
            message.includes('successfully')
              ? 'success'
              : 'error'
          }
        />
      ) : null}

      <Card>
        <Field
          label="Student Name"
          value={form.name}
          onChangeText={(v) => {
            setForm({ ...form, name: v });
            setStudent(null);
            setPreview(null);
          }}
          placeholder="Enter exact student name"
        />

        <Field
          label="Class"
          value={form.className}
          onChangeText={(v) => {
            setForm({ ...form, className: v });
            setStudent(null);
            setPreview(null);
          }}
          placeholder="Example: 8th"
        />

        <Field
          label="Payment Amount"
          value={form.amount}
          onChangeText={(v) =>
            setForm({ ...form, amount: v })
          }
          keyboardType="numeric"
          placeholder="Example: 2500"
        />

        <Field
          label="Payment Date"
          value={form.date}
          onChangeText={(v) =>
            setForm({ ...form, date: v })
          }
        />

        <Field
          label="Payment Method"
          value={form.method}
          onChangeText={(v) =>
            setForm({
              ...form,
              method: v || 'Cash',
            })
          }
        />

        <Field
          label="Reference"
          value={form.reference}
          onChangeText={(v) =>
            setForm({
              ...form,
              reference: v,
            })
          }
        />

        <Field
          label="Notes"
          value={form.notes}
          onChangeText={(v) =>
            setForm({
              ...form,
              notes: v,
            })
          }
          multiline
        />

        <Button
          title="Preview Allocation"
          onPress={() => void buildPreview()}
        />
      </Card>

      {matches.map((item) => (
        <Button
          key={item.id}
          title={`Use ${item.name} - ${item.className} RNo ${item.rno}`}
          tone="muted"
          onPress={() => {
            setStudent(item);
            void buildPreview(item);
          }}
        />
      ))}

      {preview ? (
        <Card>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: colors.ink,
            }}
          >
            Payment Preview
          </Text>

          <Text style={{ marginTop: 6 }}>
            Student: {student?.name}
          </Text>

          <Text>
            Class: {student?.className}
          </Text>

          <Text>
            Total Payment:{' '}
            {currency(Number(form.amount || 0))}
          </Text>

          <View style={{ height: 12 }} />

          <Table
            headers={[
              'Month',
              'Before',
              'Applied',
              'After',
              'Type',
            ]}
            rows={(preview.allocations || []).map(
              (allocation) => [
                allocationLabel(allocation),
                currency(
                  allocation.beforeRemaining
                ),
                currency(allocation.applied),
                currency(
                  allocation.afterRemaining
                ),
                allocation.status,
              ]
            )}
          />

          {preview.excessAmount > 0 ? (
            <Text
              style={{
                marginTop: 12,
                fontWeight: '900',
              }}
            >
              Excess not allocated:{' '}
              {currency(preview.excessAmount)}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '900',
            color: colors.ink,
          }}
        >
          Today's Payments
        </Text>

        {today.loading ? (
          <Loading />
        ) : (
          <Table
            headers={[
              'Student',
              'Class',
              'Payment',
              'Method',
              'Month(s)',
              'Time',
            ]}
            rows={(today.data || []).map(
              (p: any) => [
                p.name,
                p.class_name,
                currency(p.amount),
                p.method,
                p.allocations || '',
                new Date(
                  p.created_at
                ).toLocaleTimeString('en-PK', {
                  timeZone: 'Asia/Karachi',
                }),
              ]
            )}
          />
        )}

        <Text
          style={{
            marginTop: 12,
            fontWeight: '900',
          }}
        >
          TOTAL PAYMENTS RECEIVED:{' '}
          {currency(
            (today.data || []).reduce(
              (sum: number, p: any) =>
                sum + p.amount,
              0
            )
          )}
        </Text>
      </Card>

      <ConfirmModal
        visible={
          !!preview &&
          preview.excessAmount === 0
        }
        title="Confirm payment?"
        onCancel={() => setPreview(null)}
        onConfirm={() => void savePayment()}
        body={
          <View>
            <Text>
              Student: {student?.name}
            </Text>

            <Text>
              Class: {student?.className}
            </Text>

            <Text>
              Payment:{' '}
              {currency(
                Number(form.amount || 0)
              )}
            </Text>

            <View style={{ height: 10 }} />

            <Text
              style={{
                fontWeight: '900',
                marginBottom: 8,
              }}
            >
              Allocation
            </Text>

            <Table
              headers={[
                'Month',
                'Applied',
                'Type',
              ]}
              rows={(preview?.allocations || []).map(
                (allocation) => [
                  allocationLabel(allocation),
                  currency(
                    allocation.applied
                  ),
                  allocation.status,
                ]
              )}
            />
          </View>
        }
      />
    </Page>
  );
}