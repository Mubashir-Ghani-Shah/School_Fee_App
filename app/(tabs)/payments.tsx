import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ConfirmModal, Field, Loading, Notice, Page, Table, colors } from '@/components/school/Ui';
import { SCHOOL_MONTHS, currency, todayKarachi } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { useAsyncData } from '@/lib/school/useSchoolData';
import type { AllocationPreview, Student } from '@/lib/school/types';

export default function PaymentsScreen() {
  const [form, setForm] = useState({ name: '', className: '', amount: '', date: todayKarachi(), method: 'Cash', reference: '', notes: '' });
  const [matches, setMatches] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [preview, setPreview] = useState<{ allocations: AllocationPreview[]; excessAmount: number } | null>(null);
  const [message, setMessage] = useState('');
  const today = useAsyncData(() => schoolDb.payments(todayKarachi()), []);

  const buildPreview = async (chosen?: Student) => {
    try {
      const selected = chosen || student;
      setMessage('');
      if (!selected) {
        const found = await schoolDb.findStudents(form.name, form.className);
        setMatches(found);
        if (found.length !== 1) return setMessage(found.length === 0 ? 'No matching student found. Check name and class.' : 'Multiple exact matches found. Select the correct student.');
        setStudent(found[0]);
        return buildPreview(found[0]);
      }
      const result = await schoolDb.paymentPreview(selected.id, Number(form.amount));
      setPreview(result);
      if (result.excessAmount > 0) setMessage(`Excess amount ${currency(result.excessAmount)} cannot be silently applied to future months.`);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not preview payment.'); }
  };
  const savePayment = async () => {
    if (!student || !preview || preview.excessAmount > 0) return;
    try {
      await schoolDb.addPayment({ studentId: student.id, amount: Number(form.amount), paymentDate: form.date, method: form.method as any, reference: form.reference, notes: form.notes });
      setPreview(null); setStudent(null); setMatches([]); setForm({ name: '', className: '', amount: '', date: todayKarachi(), method: 'Cash', reference: '', notes: '' }); setMessage('Payment saved once and allocated to the oldest unpaid months.'); await today.reload();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save payment.'); }
  };

  return <Page title="Add Payment" subtitle="Payments are previewed first and always clear the oldest unpaid due month before any later month.">
    {message ? <Notice text={message} tone={message.includes('saved') ? 'success' : 'error'} /> : null}
    <Card><Field label="Student Name" value={form.name} onChangeText={(v) => { setForm({ ...form, name: v }); setStudent(null); }} /><Field label="Class" value={form.className} onChangeText={(v) => { setForm({ ...form, className: v }); setStudent(null); }} /><Field label="Payment Amount" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} keyboardType="numeric" /><Field label="Payment Date" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} /><Field label="Payment Method" value={form.method} onChangeText={(v) => setForm({ ...form, method: v || 'Cash' })} /><Field label="Reference" value={form.reference} onChangeText={(v) => setForm({ ...form, reference: v })} /><Field label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline /><Button title="Preview Allocation" onPress={() => void buildPreview()} /></Card>
    {matches.map((item) => <Button key={item.id} title={`Use ${item.name} - ${item.className} RNo ${item.rno}`} tone="muted" onPress={() => { setStudent(item); void buildPreview(item); }} />)}
    <Card><Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>Today's Payments</Text>{today.loading ? <Loading /> : <Table headers={['Student', 'Class', 'Payment', 'Method', 'Allocated Months', 'Time']} rows={(today.data || []).map((p: any) => [p.name, p.class_name, currency(p.amount), p.method, p.allocations || '', new Date(p.created_at).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })])} />}<Text style={{ marginTop: 12, fontWeight: '900' }}>TOTAL PAYMENTS RECEIVED: {currency((today.data || []).reduce((sum: number, p: any) => sum + p.amount, 0))}</Text></Card>
    <ConfirmModal visible={!!preview && preview.excessAmount === 0} title="Confirm payment?" onCancel={() => setPreview(null)} onConfirm={() => void savePayment()} body={<View><Text>Student: {student?.name}</Text><Text>Class: {student?.className}</Text><Text>Payment: {currency(Number(form.amount || 0))}</Text><Table headers={['Month', 'Before', 'Applied', 'After', 'Status']} rows={(preview?.allocations || []).map((a) => [SCHOOL_MONTHS.find((m) => m.key === a.monthKey)?.label || a.monthKey, currency(a.beforeRemaining), currency(a.applied), currency(a.afterRemaining), a.status])} /></View>} />
  </Page>;
}
