import { useState } from 'react';
import { Text } from 'react-native';

import {
  Button,
  Card,
  Notice,
  Page,
  Table,
} from '@/components/school/Ui';

import {
  exportDailyReport,
  exportFeeLedgerExcel,
  importExcelRows,
  pickExcelImportPreview,
} from '@/lib/school/exporters';

import { todayKarachi } from '@/lib/school/calendar';

type Preview = Awaited<ReturnType<typeof pickExcelImportPreview>>;

export default function ImportExportScreen() {
  const [preview, setPreview] = useState<Preview>(null);
  const [message, setMessage] = useState('');

  const pick = async () => {
    try {
      const result = await pickExcelImportPreview();

      setPreview(result);

      setMessage(
        result
          ? 'Import preview ready. Review the information before importing.'
          : 'Import cancelled.'
      );
    } catch (error) {
      console.log(error);
      setMessage(
        'Could not inspect the Excel file. Please make sure it is a valid Excel workbook.'
      );
    }
  };

  const commit = async () => {
    if (!preview) return;

    try {
      const result = await importExcelRows(preview.rows);

      setMessage(
        `Created ${result.imported} new students. Updated ${result.updated} existing students. Skipped ${result.skipped} invalid/duplicate rows.`
      );

      setPreview(null);
    } catch (error) {
      console.log(error);

      setMessage(
        'Could not import the Excel records safely.'
      );
    }
  };

  const exportLedger = async () => {
    try {
      await exportFeeLedgerExcel();

      setMessage(
        'Full fee ledger Excel file created successfully.'
      );
    } catch (error) {
      console.log(error);

      setMessage(
        'Could not create the fee ledger Excel file.'
      );
    }
  };

  const exportDailyExcel = async () => {
    try {
      await exportDailyReport('xlsx', todayKarachi());

      setMessage(
        'Daily Excel report created successfully.'
      );
    } catch (error) {
      console.log(error);

      setMessage(
        'Could not create the daily Excel report.'
      );
    }
  };

  const exportDailyCsv = async () => {
    try {
      await exportDailyReport('csv', todayKarachi());

      setMessage(
        'Daily CSV report created successfully.'
      );
    } catch (error) {
      console.log(error);

      setMessage(
        'Could not create the daily CSV report.'
      );
    }
  };

  const exportDailyTxt = async () => {
    try {
      await exportDailyReport('txt', todayKarachi());

      setMessage(
        'Daily TXT report created successfully.'
      );
    } catch (error) {
      console.log(error);

      setMessage(
        'Could not create the daily TXT report.'
      );
    }
  };

  return (
    <Page
      title="Import / Export"
      subtitle="Import your school Excel file and export the latest fee ledger."
    >
      {message ? (
        <Notice
          text={message}
          tone={
            message.includes('Could not')
              ? 'error'
              : 'success'
          }
        />
      ) : null}

      <Card>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '900',
            marginBottom: 8,
          }}
        >
          Excel Import
        </Text>

        <Text style={{ marginBottom: 12 }}>
          Import your existing school fee Excel file.
          The app will inspect the workbook before importing it.
        </Text>

        <Button
          title="Choose Excel Workbook"
          onPress={pick}
        />

        {preview ? (
          <>
            <Table
              headers={[
                'File',
                'Sheet',
                'New Students',
                'To Update',
                'Invalid',
                'Duplicates in File',
              ]}
              rows={[
                [
                  preview.fileName,
                  preview.sheetName,
                  preview.newStudents,
                  preview.existingToUpdate,
                  preview.invalidRows,
                  preview.duplicateStudents,
                ],
              ]}
            />

            <Button
              title="Commit Import"
              onPress={commit}
            />
          </>
        ) : null}
      </Card>

      <Card>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '900',
            marginBottom: 8,
          }}
        >
          Full Fee Ledger
        </Text>

        <Text style={{ marginBottom: 12 }}>
          Export the latest student balances into an Excel
          file using your school fee format.
        </Text>

        <Button
          title="Export Full Fee Ledger Excel"
          onPress={() => void exportLedger()}
        />
      </Card>

      <Card>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '900',
            marginBottom: 8,
          }}
        >
          Daily Reports
        </Text>

        <Text style={{ marginBottom: 12 }}>
          Export today's fee collection, expenses and net
          cash report.
        </Text>

        <Button
          title="Export Daily Report Excel"
          onPress={() => void exportDailyExcel()}
        />

        <Button
          title="Export Daily Report CSV"
          onPress={() => void exportDailyCsv()}
        />

        <Button
          title="Export Daily Report TXT"
          tone="muted"
          onPress={() => void exportDailyTxt()}
        />
      </Card>
    </Page>
  );
}