import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Field, Loading, Notice, Page, Table } from '@/components/school/Ui';
import { currency, todayKarachi } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { useAsyncData } from '@/lib/school/useSchoolData';

export default function ExpensesScreen() {
  const [form, setForm] = useState({ name: '', amount: '', date: todayKarachi(), category: 'Electricity', notes: '' });
  const [message, setMessage] = useState('');
  const expenses = useAsyncData(() => schoolDb.expenses(todayKarachi()), []);
  const save = async () => {
    try { await schoolDb.addExpense({ name: form.name, amount: Number(form.amount), expenseDate: form.date, category: form.category, notes: form.notes }); setMessage('Expense saved in daily cash records only.'); setForm({ name: '', amount: '', date: todayKarachi(), category: 'Electricity', notes: '' }); await expenses.reload(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save expense.'); }
  };
  return <Page title="School Expenses" subtitle="Expenses affect daily net cash but never modify student fee records.">{message ? <Notice text={message} tone={message.includes('saved') ? 'success' : 'error'} /> : null}<Card><Field label="Expense Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} /><Field label="Amount" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} keyboardType="numeric" /><Field label="Date" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} /><Field label="Category" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} /><Field label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline /><Button title="Add Expense" onPress={save} /></Card><Card><Text style={{ fontWeight: '900', fontSize: 20 }}>Today's Expenses</Text>{expenses.loading ? <Loading /> : <Table headers={['Date', 'Expense', 'Category', 'Amount', 'Notes']} rows={(expenses.data || []).map((e: any) => [e.expense_date, e.name, e.category, currency(e.amount), e.notes])} />}<Text style={{ marginTop: 12, fontWeight: '900' }}>TOTAL EXPENSES: {currency((expenses.data || []).reduce((sum: number, e: any) => sum + e.amount, 0))}</Text></Card></Page>;
}
