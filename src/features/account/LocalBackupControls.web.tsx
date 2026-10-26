import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocalBackupRepository } from '../../data/local/localBackup';
import { journalColors as colors } from '../../theme/colors';

interface LocalBackupControlsProps {
  repository: LocalBackupRepository;
  onRestoreComplete(): void;
}

export function LocalBackupControls({ repository, onRestoreComplete }: LocalBackupControlsProps) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function exportBackup() {
    setIsBusy(true);
    setMessage(null);
    try {
      const backup = await repository.createExport();
      const file = new File([backup.content], backup.fileName, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: 'Leafmark backup',
            text: 'Save this private Leafmark backup in Files.',
          });
          setMessage('Choose Save to Files to keep your backup. It contains every local profile and journal entry.');
        } catch (error) {
          if (isShareCancelled(error)) {
            setMessage('Backup sharing cancelled. Your journal remains on this iPad.');
          } else {
            throw error;
          }
        }
      } else {
        downloadFile(file);
        setMessage('Backup file downloaded. Save it somewhere private; it contains every local profile and journal entry.');
      }
    } catch (error) {
      setMessage(getReadableError(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await repository.restore(file.text ? await file.text() : await readFile(file), async () => (
        window.confirm('This backup will replace all local profiles and journal data on this iPad. Continue?')
      ));
      if (result === 'cancelled') {
        setMessage('Restore cancelled. Your current data is unchanged.');
        return;
      }
      onRestoreComplete();
    } catch (error) {
      setMessage(getReadableError(error));
    } finally {
      setIsBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Backup and restore</Text>
      <Text style={styles.description}>Keep one backup in Files to move your private journal to a new or reset iPad. Backups contain all local profiles, reading history, Book pages, images, and bookshelf layout.</Text>
      <Text style={styles.privacy}>Anyone with the backup file can view its contents. Keep the file somewhere private.</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => void exportBackup()} style={styles.button}>
          <Text style={styles.buttonText}>{isBusy ? 'Working…' : 'Export backup'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => fileInput.current?.click()} style={styles.button}>
          <Text style={styles.buttonText}>Restore backup</Text>
        </Pressable>
      </View>
      <input
        ref={fileInput}
        accept="application/json,.json"
        aria-label="Choose a Leafmark backup file"
        onChange={(event) => void restoreBackup(event.currentTarget.files?.[0])}
        style={styles.fileInput}
        type="file"
      />
      {message ? <Text accessibilityRole="alert" style={styles.message} testID="backup-status">{message}</Text> : null}
    </View>
  );
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Leafmark could not read this backup file.'));
    reader.onerror = () => reject(new Error('Leafmark could not read this backup file.'));
    reader.readAsText(file);
  });
}

function isShareCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Leafmark could not complete this backup action. Try again.';
}

const styles = StyleSheet.create({
  container: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 22, paddingTop: 18 },
  title: { color: colors.ink, fontFamily: 'Georgia', fontSize: 18 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 7 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  button: { alignItems: 'center', borderColor: colors.olive, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  buttonText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  fileInput: { display: 'none' },
  message: { color: colors.olive, fontSize: 13, lineHeight: 19, marginTop: 10 },
});
