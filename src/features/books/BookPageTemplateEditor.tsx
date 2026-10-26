import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BookPageField, BookPageFieldType, BookPageRepository } from '../../books/bookPageTypes';
import { journalColors as colors } from '../../theme/colors';

const types: Array<{ type: BookPageFieldType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'multiline', label: 'Notes' },
  { type: 'list', label: 'List' },
  { type: 'image', label: 'Image link' },
];

export function BookPageTemplateEditor({ onBack, pages }: { pages: BookPageRepository; onBack(): void }) {
  const [fields, setFields] = useState<BookPageField[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [type, setType] = useState<BookPageFieldType>('text');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const templateFields = await pages.listTemplateFields();
      setFields(templateFields);
      setLabelDrafts(Object.fromEntries(templateFields.map((field) => [field.id, field.label])));
      setError(null);
    } catch {
      setError('Your Book page template could not be loaded.');
    }
  }, [pages]);
  useEffect(() => { void load(); }, [load]);

  async function addField() {
    if (!label.trim()) {
      setError('Enter a field name.');
      return;
    }
    try {
      await pages.addField({ bookId: null, label: label.trim(), type, position: fields.length });
      setLabel('');
      await load();
    } catch {
      setError('The template field could not be added.');
    }
  }

  async function updateLabel(field: BookPageField, nextLabel: string) {
    const trimmedLabel = nextLabel.trim();
    if (!trimmedLabel) {
      setError('Enter a field name.');
      return;
    }
    try {
      const updated = { ...field, label: trimmedLabel };
      await pages.updateField(updated);
      setFields((current) => current.map((entry) => entry.id === field.id ? updated : entry));
      setLabelDrafts((current) => ({ ...current, [field.id]: trimmedLabel }));
      setError(null);
    } catch {
      setError('The field name could not be saved.');
    }
  }

  async function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await pages.reorderFields(null, next.map((field) => field.id));
      setFields(next.map((field, position) => ({ ...field, position })));
    } catch {
      setError('The template order could not be saved.');
    }
  }

  async function removeField(fieldId: string) {
    try {
      await pages.removeField(fieldId);
      await load();
    } catch {
      setError('The template field could not be removed.');
    }
  }

  return (
    <View style={styles.panel} testID="book-page-template">
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.secondaryText}>‹ Read Books</Text></Pressable>
      <Text style={styles.title}>Book page template</Text>
      <Text style={styles.copy}>Fields here appear on every Book page, including books already in your library. Saved values stay with each Book.</Text>
      {fields.map((field, index) => (
        <View key={field.id} style={styles.fieldRow}>
          <TextInput
            accessibilityLabel={`Template field ${index + 1}`}
            onChangeText={(value) => setLabelDrafts((current) => ({ ...current, [field.id]: value }))}
            style={styles.input}
            value={labelDrafts[field.id] ?? field.label}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Save ${field.label} field name`}
            onPress={() => void updateLabel(field, labelDrafts[field.id] ?? field.label)}
            style={styles.smallAction}
          ><Text style={styles.secondaryText}>Save field name</Text></Pressable>
          <Text style={styles.typeName}>{types.find((item) => item.type === field.type)?.label}</Text>
          <View style={styles.typeRow}>
            {types.map((item) => (
              <Pressable
                key={item.type}
                accessibilityRole="button"
                accessibilityLabel={`Change ${field.label} type to ${item.label}`}
                accessibilityState={{ selected: field.type === item.type }}
                onPress={() => {
                  const updated = { ...field, type: item.type };
                  void pages.updateField(updated).then(() => setFields((current) => current.map((entry) => entry.id === field.id ? updated : entry))).catch(() => setError('The field type could not be saved.'));
                }}
                style={[styles.typeButton, field.type === item.type && styles.selectedType]}
              ><Text style={styles.typeName}>{item.label}</Text></Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${field.label} up`} onPress={() => void moveField(index, -1)} style={styles.smallAction}><Text style={styles.secondaryText}>↑</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${field.label} down`} onPress={() => void moveField(index, 1)} style={styles.smallAction}><Text style={styles.secondaryText}>↓</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${field.label} from template`} onPress={() => void removeField(field.id)} style={styles.smallAction}><Text style={styles.removeText}>Remove</Text></Pressable>
          </View>
        </View>
      ))}
      <Text style={styles.label}>Add a shared field</Text>
      <TextInput accessibilityLabel="Template field name" onChangeText={setLabel} placeholder="For example: Favorite chapter" style={styles.input} value={label} />
      <View style={styles.typeRow}>
        {types.map((item) => <Pressable key={item.type} accessibilityRole="button" accessibilityState={{ selected: type === item.type }} onPress={() => setType(item.type)} style={[styles.typeButton, type === item.type && styles.selectedType]}><Text style={styles.secondaryText}>{item.label}</Text></Pressable>)}
      </View>
      <Pressable accessibilityRole="button" onPress={() => void addField()} style={styles.primaryButton}><Text style={styles.primaryText}>Add to all Book pages</Text></Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginTop: 12, padding: 18 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 42, paddingHorizontal: 4 },
  title: { color: colors.ink, fontFamily: 'Georgia', fontSize: 27, marginVertical: 10 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  fieldRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, paddingVertical: 12 },
  input: { backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  typeName: { color: colors.muted, fontSize: 12 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 4 },
  smallAction: { alignItems: 'center', borderColor: colors.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 38, minWidth: 42, paddingHorizontal: 8 },
  secondaryText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  removeText: { color: '#8B3F32', fontSize: 12, fontWeight: '600' },
  label: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 18 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  typeButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 10 },
  selectedType: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 11, justifyContent: 'center', marginTop: 14, minHeight: 46, paddingHorizontal: 14 },
  primaryText: { color: colors.panel, fontSize: 13, fontWeight: '700' },
  error: { color: colors.error, fontSize: 13, marginTop: 12 },
});
