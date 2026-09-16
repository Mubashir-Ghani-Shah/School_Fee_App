import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Notice, Page, Table } from '@/components/school/Ui';
import { exportDailyReport, importExcelRows, pickExcelImportPreview } from '@/lib/school/exporters';
import { todayKarachi } from '@/lib/school/calendar';

type Preview = Awaited<ReturnType<typeof pickExcelImportPreview>>;

export default function ImportExportScreen() {
  const [preview, setPreview] = useState<Preview>(null);
  const [message, setMessage] = useState('');
  const pick = async () => { try { const result = await pickExcelImportPreview(); setPreview(result); setMessage(result ? 'Import preview ready. Review before committing.' : 'Import cancelled.'); } catch { setMessage('Could not inspect workbook. If it is open in Excel, close it and retry.'); } };
  const commit = async () => { if (!preview) return; try { const result = await importExcelRows(preview.rows); setMessage(`Imported ${result.imported} students. Skipped ${result.skipped} duplicate or invalid rows.`); setPreview(null); } catch { setMessage('Could not import records safely. No partial workbook changes were made.'); } };
  return <Page title="Import / Export" subtitle="Inspect Excel files before import, preserve the old workbook, and export real application data.">
    {message ? <Notice text={message} tone={message.includes('Could') ? 'error' : 'success'} /> : null}
    <Card><Text style={{ fontSize: 20, fontWeight: '900' }}>Excel Import Preview</Text><Text>Expected columns: RNo, Student_Name, Class, Fee, Apr2026 through Mar2027, Current_Month, Remaining, Total_Fee, Category.</Text><Button title="Choose Excel Workbook" onPress={pick} />{preview ? <><Table headers={['File', 'Sheet', 'Students Found', 'Invalid Rows', 'Duplicates']} rows={[[preview.fileName, preview.sheetName, preview.studentsFound, preview.invalidRows, preview.duplicateStudents]]} /><Button title="Commit Import" onPress={commit} /></> : null}</Card>
    <Card><Text style={{ fontSize: 20, fontWeight: '900' }}>Exports and Backups</Text><Text>Excel, CSV, and TXT exports contain real ledger data. Before writing back to Excel, keep a timestamped backup such as Fee_Database_Backup_2026-09-16_153000.xlsx.</Text><Button title="Export Daily Report Excel" onPress={() => void exportDailyReport('xlsx', todayKarachi())} /><Button title="Export Daily Report CSV" onPress={() => void exportDailyReport('csv', todayKarachi())} /><Button title="Export Daily Report TXT" tone="muted" onPress={() => void exportDailyReport('txt', todayKarachi())} /></Card>
  </Page>;
}
