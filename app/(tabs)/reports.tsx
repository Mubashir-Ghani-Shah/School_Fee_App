import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Field, Loading, Notice, Page, StatCard, Table } from '@/components/school/Ui';
import { SCHOOL_MONTHS, currency, todayKarachi } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { calculateCurrentMonth } from '@/lib/school/feeLogic';
import { exportDailyReport } from '@/lib/school/exporters';
import { useAsyncData } from '@/lib/school/useSchoolData';

export default function ReportsScreen() {
  const [date, setDate] = useState(todayKarachi());
  const [className, setClassName] = useState('');
  const [message, setMessage] = useState('');
  const daily = useAsyncData(async () => ({ payments: await schoolDb.payments(date), expenses: await schoolDb.expenses(date), settings: await schoolDb.settings() }), [date]);
  const defaulters = useAsyncData(() => schoolDb.defaulters(className), [className]);
  const exportReport = async (format: 'csv' | 'txt' | 'xlsx') => { try { const uri = await exportDailyReport(format, date); setMessage(`Report exported: ${uri}`); } catch { setMessage('Could not export report. The file may be unavailable. Please retry.'); } };
  const totalPayments = (daily.data?.payments || []).reduce((sum: number, row: any) => sum + row.amount, 0);
  const totalExpenses = (daily.data?.expenses || []).reduce((sum: number, row: any) => sum + row.amount, 0);
  return <Page title="Reports" subtitle="Daily cash, combined report, defaulters, and monthly collection views with real ledger data.">
    {message ? <Notice text={message} tone={message.includes('exported') ? 'success' : 'error'} /> : null}
    <Card><Field label="Report Date" value={date} onChangeText={setDate} /><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Button title="Export Excel" onPress={() => void exportReport('xlsx')} /><Button title="Export CSV" onPress={() => void exportReport('csv')} /><Button title="Export TXT" tone="muted" onPress={() => void exportReport('txt')} /></View></Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><StatCard label="Total Payments" value={totalPayments} /><StatCard label="Total Expenses" value={totalExpenses} tone="danger" /><StatCard label="Net Cash" value={totalPayments - totalExpenses} tone="blue" /></View>
    <Card><Text style={{ fontSize: 20, fontWeight: '900' }}>Combined Daily Cash Report</Text>{daily.loading ? <Loading /> : <><Table headers={['Student', 'Class', 'Amount', 'Method']} rows={(daily.data?.payments || []).map((p: any) => [p.name, p.class_name, currency(p.amount), p.method])} /><View style={{ height: 12 }} /><Table headers={['Expense', 'Category', 'Amount', 'Date']} rows={(daily.data?.expenses || []).map((e: any) => [e.name, e.category, currency(e.amount), e.expense_date])} /></>}</Card>
    <Card><Field label="Filter defaulters by class" value={className} onChangeText={setClassName} placeholder="Optional" />{defaulters.loading ? <Loading /> : <Table headers={['Student', 'Class', 'Monthly Fee', 'Remaining Amount', 'Current Month']} rows={(defaulters.data || []).map((d: any) => [d.name, d.class_name, currency(d.monthly_fee), currency(d.remaining), 'View student history'])} />}</Card>
    <Card><Text style={{ fontSize: 20, fontWeight: '900' }}>Monthly Collection Months</Text><Table headers={['Month', 'Report Status']} rows={SCHOOL_MONTHS.map((m) => [m.label, 'Available through payment history filters'])} /></Card>
  </Page>;
}
