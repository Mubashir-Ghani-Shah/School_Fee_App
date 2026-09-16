import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { currency } from '@/lib/school/calendar';

export const colors = {
  ink: '#17211b', muted: '#68756d', line: '#dfe7df', bg: '#f4f1e8', card: '#fffdf7', primary: '#1f6f4a', danger: '#a43f35', amber: '#be7c28', blue: '#2f5f8f', soft: '#e8f2eb',
};

export function Page({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}{children}</ScrollView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatCard({ label, value, tone = 'primary' }: { label: string; value: string | number; tone?: 'primary' | 'danger' | 'amber' | 'blue' }) {
  return <Card style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, { color: colors[tone] }]}>{typeof value === 'number' ? currency(value) : value}</Text></Card>;
}

export function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'default' | 'numeric'; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.textArea]} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} /></View>;
}

export function Button({ title, onPress, tone = 'primary', disabled = false }: { title: string; onPress: () => void; tone?: 'primary' | 'danger' | 'muted'; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, tone === 'danger' && styles.dangerButton, tone === 'muted' && styles.mutedButton, disabled && { opacity: 0.55 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}

export function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.table}><View style={styles.tr}>{headers.map((header) => <Text key={header} style={[styles.th, { width: 135 }]}>{header}</Text>)}</View>{rows.map((row, index) => <View key={index} style={styles.tr}>{row.map((cell, cellIndex) => <Text key={`${index}-${cellIndex}`} style={[styles.td, { width: 135 }]}>{cell}</Text>)}</View>)}</View></ScrollView>;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'success' }) {
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.primary : colors.blue;
  return <Text style={[styles.notice, { color, borderColor: color }]}>{text}</Text>;
}

export function Loading() { return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.subtitle}>Loading records...</Text></View>; }

export function ConfirmModal({ visible, title, body, onCancel, onConfirm }: { visible: boolean; title: string; body: ReactNode; onCancel: () => void; onConfirm: () => void }) {
  return <Modal visible={visible} transparent animationType="fade"><View style={styles.modalShade}><View style={styles.modal}><Text style={styles.modalTitle}>{title}</Text>{body}<View style={styles.row}><Button title="Cancel" tone="muted" onPress={onCancel} /><Button title="Confirm Payment" onPress={onConfirm} /></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, pageContent: { padding: 18, gap: 14, paddingBottom: 40 },
  title: { fontSize: 31, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 }, subtitle: { fontSize: 14, color: colors.muted, lineHeight: 21 },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  stat: { minWidth: 165, flex: 1 }, statLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }, statValue: { marginTop: 8, fontSize: 24, fontWeight: '900' },
  field: { gap: 6, marginBottom: 10 }, label: { color: colors.ink, fontWeight: '800' }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, backgroundColor: '#fff', fontSize: 15 }, textArea: { minHeight: 78, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', marginVertical: 4 }, dangerButton: { backgroundColor: colors.danger }, mutedButton: { backgroundColor: colors.muted }, buttonText: { color: '#fff', fontWeight: '900' },
  table: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden' }, tr: { flexDirection: 'row', backgroundColor: '#fff' }, th: { backgroundColor: colors.soft, padding: 10, fontWeight: '900', color: colors.ink }, td: { padding: 10, borderTopWidth: 1, borderTopColor: colors.line, color: colors.ink },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, backgroundColor: '#fff', fontWeight: '700' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }, modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 18 }, modal: { maxWidth: 560, width: '100%', backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 12 }, modalTitle: { fontSize: 22, fontWeight: '900', color: colors.ink },
});
