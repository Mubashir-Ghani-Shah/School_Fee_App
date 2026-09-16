import { View } from 'react-native';
import { Card, Loading, Notice, Page, StatCard, Table } from '@/components/school/Ui';
import { currency, todayKarachi } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { useAsyncData } from '@/lib/school/useSchoolData';

export default function DashboardScreen() {
  const { data, loading, error } = useAsyncData(() => schoolDb.dashboard(todayKarachi()), []);
  if (loading) return <Loading />;
  if (error || !data) return <Page title="Dashboard"><Notice tone="error" text={error || 'Unable to load dashboard.'} /></Page>;
  return (
    <Page title="School Cash Dashboard" subtitle="Production ledger for student fees, daily collection, expenses, and outstanding balances.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <StatCard label="Today's Collection" value={data.todayCollection} />
        <StatCard label="Today's Expenses" value={data.todayExpenses} tone="danger" />
        <StatCard label="Net Cash" value={data.netCash} tone="blue" />
        <StatCard label="Total Outstanding" value={data.totalOutstanding} tone="amber" />
        <StatCard label="Students" value={String(data.studentCount)} />
        <StatCard label="Unpaid Students" value={String(data.studentsWithUnpaid)} tone="danger" />
      </View>
      <Card>
        <Table headers={['Recent Payments', 'Class', 'Amount', 'Method']} rows={data.recentPayments.map((row: any) => [row.name, row.class_name, currency(row.amount), row.method])} />
      </Card>
      <Card>
        <Table headers={['Recent Expenses', 'Category', 'Amount', 'Date']} rows={data.recentExpenses.map((row: any) => [row.name, row.category, currency(row.amount), row.expenseDate])} />
      </Card>
    </Page>
  );
}
