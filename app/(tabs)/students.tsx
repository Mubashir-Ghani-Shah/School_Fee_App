import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Field, Loading, Notice, Page, Table, colors } from '@/components/school/Ui';
import { SCHOOL_MONTHS, currency, todayKarachi } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { calculateCurrentMonth, calculateRemaining } from '@/lib/school/feeLogic';
import { exportStudentHistory } from '@/lib/school/exporters';
import { useAsyncData } from '@/lib/school/useSchoolData';

export default function StudentsScreen() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ rno: '', name: '', className: '', monthlyFee: '1400', category: 'Normal', notes: '' });
  const [message, setMessage] = useState('');
  const students = useAsyncData(() => schoolDb.students(search), [search]);
  const history = useAsyncData(() => selectedId ? schoolDb.studentHistory(selectedId) : Promise.resolve(null), [selectedId]);
  const settings = useAsyncData(() => schoolDb.settings(), []);

  const addStudent = async () => {
    try {
      await schoolDb.addStudent({ ...form, monthlyFee: Number(form.monthlyFee), status: 'Active', admissionDate: todayKarachi() });
      setMessage('Student added with full monthly ledger.');
      setForm({ rno: '', name: '', className: '', monthlyFee: '1400', category: 'Normal', notes: '' });
      await students.reload();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not add student.'); }
  };

  return <Page title="Student Management" subtitle="Add, search, inspect balances, and export individual histories.">
    {message ? <Notice text={message} tone={message.includes('Could') || message.includes('cannot') ? 'error' : 'success'} /> : null}
    <Card><Field label="Search by name, class, RNo, or student ID" value={search} onChangeText={setSearch} placeholder="Ali, 8th, 101..." />{students.loading ? <Loading /> : <Table headers={['RNo', 'Student', 'Class', 'Monthly Fee', 'Category']} rows={(students.data || []).map((s) => [s.rno, s.name, s.className, currency(s.monthlyFee), s.category])} />}{(students.data || []).map((s) => <Button key={s.id} title={`View ${s.name} - ${s.className}`} tone="muted" onPress={() => setSelectedId(s.id)} />)}</Card>
    <Card><Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>Add Student</Text><View style={{ height: 8 }} /><Field label="RNo" value={form.rno} onChangeText={(v) => setForm({ ...form, rno: v })} /><Field label="Student Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} /><Field label="Class" value={form.className} onChangeText={(v) => setForm({ ...form, className: v })} /><Field label="Monthly Fee" value={form.monthlyFee} onChangeText={(v) => setForm({ ...form, monthlyFee: v })} keyboardType="numeric" /><Field label="Category" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} /><Field label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline /><Button title="Add Student" onPress={addStudent} /></Card>
    {history.data ? <Card><Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{history.data.student.name} - {history.data.student.className}</Text><Text style={{ color: colors.muted }}>Total fee obligation, payments, and current unpaid period are calculated from month balances.</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }}><Text>Total Fee: {currency(history.data.months.reduce((s, m) => s + m.feeDue, 0))}</Text><Text>Total Paid: {currency(history.data.months.reduce((s, m) => s + m.paidAmount, 0))}</Text><Text>Remaining: {currency(calculateRemaining(history.data.months, settings.data?.currentFeeMonthIndex ?? 11))}</Text><Text>Current Month: {calculateCurrentMonth(history.data.months, settings.data?.currentFeeMonthIndex ?? 11)}</Text></View><Table headers={['Month', 'Fee Due', 'Additional', 'Paid', 'Remaining', 'Status']} rows={history.data.months.map((m) => [SCHOOL_MONTHS.find((x) => x.key === m.monthKey)?.label || m.monthKey, currency(m.baseFee), currency(m.additionalFee), currency(m.paidAmount), currency(m.remaining), m.status])} /><View style={{ height: 12 }} /><Table headers={['Date', 'Amount', 'Method', 'Allocation']} rows={history.data.payments.map((p: any) => [p.payment_date, currency(p.amount), p.method, p.allocations || ''])} /><Button title="Export Student History CSV" onPress={() => void exportStudentHistory(history.data!.student.id)} /></Card> : null}
  </Page>;
}
