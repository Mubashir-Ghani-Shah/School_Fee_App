import { useEffect, useState } from 'react';
import { Button, Card, Field, Loading, Notice, Page } from '@/components/school/Ui';
import { SCHOOL_MONTHS } from '@/lib/school/calendar';
import { schoolDb } from '@/lib/school/database';
import { useSettings } from '@/lib/school/useSchoolData';
import type { Settings } from '@/lib/school/types';

export default function SettingsScreen() {
  const loaded = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (loaded.data) setForm(loaded.data); }, [loaded.data]);
  const save = async () => { if (!form) return; try { await schoolDb.saveSettings(form); setMessage('Settings saved.'); await loaded.reload(); } catch { setMessage('Could not save settings.'); } };
  if (loaded.loading || !form) return <Loading />;
  return <Page title="Settings" subtitle="School identity, academic year, currency, current fee month, and local role.">{message ? <Notice text={message} tone={message.includes('saved') ? 'success' : 'error'} /> : null}<Card><Field label="School Name" value={form.schoolName} onChangeText={(v) => setForm({ ...form, schoolName: v })} /><Field label="School Address" value={form.schoolAddress} onChangeText={(v) => setForm({ ...form, schoolAddress: v })} /><Field label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} /><Field label="Current Academic Year" value={form.academicYear} onChangeText={(v) => setForm({ ...form, academicYear: v })} /><Field label="Default Monthly Fee" value={String(form.defaultMonthlyFee)} onChangeText={(v) => setForm({ ...form, defaultMonthlyFee: Number(v) || 0 })} keyboardType="numeric" /><Field label={`Current Fee Month Index (0-11). Current: ${SCHOOL_MONTHS[form.currentFeeMonthIndex]?.label}`} value={String(form.currentFeeMonthIndex)} onChangeText={(v) => setForm({ ...form, currentFeeMonthIndex: Math.max(0, Math.min(11, Number(v) || 0)) })} keyboardType="numeric" /><Field label="Currency" value={form.currency} onChangeText={(v) => setForm({ ...form, currency: v })} /><Field label="Role (Admin, Fee Clerk, Viewer)" value={form.role} onChangeText={(v) => setForm({ ...form, role: v as Settings['role'] })} /><Button title="Save Settings" onPress={save} /></Card></Page>;
}
