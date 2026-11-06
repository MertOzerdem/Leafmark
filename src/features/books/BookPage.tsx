import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';

import type { Book, BookDraft } from '../../books/bookTypes';
import type { BookPageField, BookPageFieldType, BookPageRepository, BookPageFieldValue } from '../../books/bookPageTypes';
import { isValidStarRating } from '../../reading/readingTypes';
import type { ReadBook, ReadingAttempt, ReadingRepository } from '../../reading/readingTypes';
import { todayDate, isValidReadingDate } from '../../reading/readingDates';
import { journalColors as colors } from '../../theme/colors';
import { RatingStars } from './RatingStars';
import { pickBookImage } from './pickBookImage';

export interface BookPageSaveStatus {
  ready: boolean;
  dirty: boolean;
  saving: boolean;
}

export function BookPageSaveButton({ onPress, status }: { onPress(): void; status: BookPageSaveStatus }) {
  const isDisabled = !status.ready || !status.dirty || status.saving;
  return (
    <View style={[styles.saveFab, fixedSaveFabPosition]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.dirty ? 'Save all Book changes. Unsaved changes.' : 'All Book changes are saved.'}
        accessibilityState={{ disabled: isDisabled }}
        disabled={isDisabled}
        onPress={onPress}
        style={[styles.saveFabButton, isDisabled && styles.saveFabDisabled]}
      >
        <Text style={styles.saveFabIcon}>{status.saving ? '…' : '💾'}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.saveStatusMark, status.dirty && styles.unsavedStatusMark]}>
        {status.saving ? '…' : status.dirty ? '●' : status.ready ? '✓' : '·'}
      </Text>
      <Text style={[styles.saveStatusLabel, status.dirty && styles.unsavedStatusLabel]}>
        {status.saving ? 'Saving' : status.dirty ? 'Unsaved' : status.ready ? 'Saved' : 'Loading'}
      </Text>
    </View>
  );
}

interface BookPageProps {
  ownerSubject: string;
  readBook: ReadBook;
  repository: ReadingRepository;
  pages: BookPageRepository;
  onBack(): void;
  onReadingChanged(): void;
  savePageActionRef?: React.MutableRefObject<() => void>;
  onSaveStatusChange?(status: BookPageSaveStatus | null): void;
}

interface AttemptDraft {
  startedOn: string;
  finishedOn: string;
  rating: number | null;
  reflection: string;
}

interface PendingIllustration {
  id: string;
  fieldId?: string;
  label: string;
  uri: string;
}

const fieldTypes: Array<{ type: BookPageFieldType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'multiline', label: 'Notes' },
  { type: 'list', label: 'List' },
  { type: 'image', label: 'Image' },
];

export function BookPage({ onBack, onReadingChanged, onSaveStatusChange, ownerSubject, pages, readBook, repository, savePageActionRef }: BookPageProps) {
  const [fields, setFields] = useState<BookPageField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [imageDisplays, setImageDisplays] = useState<Record<string, string>>({});
  const [pendingIllustrations, setPendingIllustrations] = useState<PendingIllustration[]>([]);
  const [undo, setUndo] = useState<{ field: BookPageField; before: string | null } | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<BookPageFieldType>('text');
  const [startedOn, setStartedOn] = useState(todayDate());
  const [isStarting, setIsStarting] = useState(false);
  const [isEditingBook, setIsEditingBook] = useState(false);
  const [bookDraft, setBookDraft] = useState<BookDraft>(toBookDraft(readBook.book));
  const [attemptDrafts, setAttemptDrafts] = useState<Record<string, AttemptDraft>>(() => createAttemptDrafts(readBook.attempts));
  const [hasLoadedPage, setHasLoadedPage] = useState(false);
  const [isSavingPage, setIsSavingPage] = useState(false);
  const saveActionRef = useRef<() => void>(() => undefined);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currentAttempt = readBook.attempts.find((attempt) => attempt.isCurrent);
  const sortedAttempts = [...readBook.attempts].sort((left, right) =>
    (right.finishedOn ?? right.startedOn).localeCompare(left.finishedOn ?? left.startedOn),
  );
  const latestFinishedAttempt = sortedAttempts.find((attempt) => attempt.finishedOn !== null) ?? null;
  const imageFields = fields.filter((field) => field.type === 'image');
  const noteFields = fields.filter((field) => field.type !== 'image');
  const hasUnsavedChanges = useMemo(() => {
    const hasBookEdits = !sameBookDraft(bookDraft, readBook.book);
    const hasFieldEdits = fields.some((field) => fieldHasChanges(field, drafts, values, imageDisplays));
    const hasAttemptEdits = readBook.attempts.some((attempt) => attemptHasChanges(attempt, attemptDrafts[attempt.id]));
    return hasBookEdits || hasFieldEdits || hasAttemptEdits || pendingIllustrations.length > 0;
  }, [attemptDrafts, bookDraft, drafts, fields, imageDisplays, pendingIllustrations.length, readBook.attempts, readBook.book, values]);

  const loadPage = useCallback(async () => {
    try {
      const [loadedFields, loadedValues] = await Promise.all([
        pages.listFields(readBook.book.id),
        pages.listValues(readBook.book.id),
      ]);
      const valueMap = Object.fromEntries(loadedValues.map((entry: BookPageFieldValue) => [entry.fieldId, entry.value]));
      const displayMap = Object.fromEntries(loadedValues.filter((entry) => entry.displayUrl).map((entry) => [entry.fieldId, entry.displayUrl ?? '']));
      setFields(loadedFields);
      setValues(valueMap);
      setImageDisplays(displayMap);
      setDrafts(Object.fromEntries(loadedFields.map((field) => [field.id, field.type === 'image' ? displayMap[field.id] ?? valueMap[field.id] ?? '' : valueMap[field.id] ?? ''])));
      setHasLoadedPage(true);
    } catch {
      setHasLoadedPage(false);
      setMessage('This Book page could not be loaded. Try again.');
    }
  }, [pages, readBook.book.id]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setBookDraft(toBookDraft(readBook.book));
  }, [readBook.book]);

  useEffect(() => {
    setAttemptDrafts(createAttemptDrafts(readBook.attempts));
  }, [readBook.attempts]);

  useEffect(() => {
    if (savePageActionRef) savePageActionRef.current = () => saveActionRef.current();
    return () => {
      if (savePageActionRef) savePageActionRef.current = () => undefined;
    };
  }, [savePageActionRef]);

  useEffect(() => {
    onSaveStatusChange?.({ ready: hasLoadedPage, dirty: hasUnsavedChanges, saving: isSavingPage });
  }, [hasLoadedPage, hasUnsavedChanges, isSavingPage, onSaveStatusChange]);

  useEffect(() => () => onSaveStatusChange?.(null), [onSaveStatusChange]);

  async function savePageChanges() {
    if (isSavingPage || !hasLoadedPage || !hasUnsavedChanges) return;
    if (!bookDraft.title.trim() || (bookDraft.pageCount !== null && (!Number.isInteger(bookDraft.pageCount) || bookDraft.pageCount < 1))) {
      setMessage('Add a title and a valid page count before saving.');
      return;
    }

    for (const attempt of readBook.attempts) {
      const draft = attemptDrafts[attempt.id] ?? createAttemptDraft(attempt);
      if (!isValidReadingDate(draft.startedOn) || attempt.finishedOn !== null && (
        !isValidReadingDate(draft.finishedOn) || draft.finishedOn < draft.startedOn || !isValidStarRating(draft.rating)
      )) {
        setMessage('Check the Reading attempt dates and rating before saving.');
        return;
      }
    }

    setIsSavingPage(true);
    setMessage(null);
    const nextValues = { ...values };
    const nextDrafts = { ...drafts };
    const nextImageDisplays = { ...imageDisplays };
    let lastChangedField: { field: BookPageField; before: string | null } | null = null;
    try {
      if (!sameBookDraft(bookDraft, readBook.book)) {
        await pages.updateBook(readBook.book.id, { ...bookDraft, title: bookDraft.title.trim() });
      }

      for (const field of fields) {
        if (!fieldHasChanges(field, drafts, values, imageDisplays)) continue;
        const before = values[field.id] ?? null;
        const next = (drafts[field.id] ?? '').trim();
        let savedValue: string | null = next || null;
        if (field.type === 'image' && savedValue && !savedValue.startsWith('storage://')) {
          const uploaded = await pages.uploadImage(ownerSubject, readBook.book.id, field.id, savedValue);
          savedValue = uploaded.value;
          nextImageDisplays[field.id] = uploaded.displayUrl;
          nextDrafts[field.id] = uploaded.displayUrl;
        }
        await pages.saveValue(readBook.book.id, field.id, savedValue);
        nextValues[field.id] = savedValue ?? '';
        if (field.type === 'image' && savedValue === null) nextImageDisplays[field.id] = '';
        lastChangedField = { field, before };
      }

      for (let index = 0; index < pendingIllustrations.length; index += 1) {
        const illustration = pendingIllustrations[index];
        const field = illustration.fieldId
          ? (await pages.listFields(readBook.book.id)).find((candidate) => candidate.id === illustration.fieldId)
          : await pages.addField({
            bookId: readBook.book.id,
            label: illustration.label,
            type: 'image',
            position: fields.length + index,
          });
        if (!field) throw new Error('The illustration field could not be found.');
        if (!illustration.fieldId) {
          setPendingIllustrations((current) => current.map((item) => item.id === illustration.id ? { ...item, fieldId: field.id } : item));
        }
        const uploaded = await pages.uploadImage(ownerSubject, readBook.book.id, field.id, illustration.uri);
        await pages.saveValue(readBook.book.id, field.id, uploaded.value);
      }

      for (const attempt of readBook.attempts) {
        const draft = attemptDrafts[attempt.id] ?? createAttemptDraft(attempt);
        const startChanged = draft.startedOn !== attempt.startedOn;
        const finishChanged = attempt.finishedOn !== null && (draft.finishedOn !== attempt.finishedOn || draft.rating !== attempt.rating);
        const reflectionChanged = draft.reflection !== attempt.reflection;

        if (attempt.finishedOn !== null && finishChanged && (!startChanged || draft.finishedOn >= attempt.startedOn)) {
          await repository.updateAttemptFinish(attempt.id, draft.finishedOn, draft.rating as number);
        }
        if (startChanged) await repository.updateAttemptStart(attempt.id, draft.startedOn);
        if (attempt.finishedOn !== null && finishChanged && startChanged && draft.finishedOn < attempt.startedOn) {
          await repository.updateAttemptFinish(attempt.id, draft.finishedOn, draft.rating as number);
        }
        if (reflectionChanged) await repository.updateAttemptReflection(attempt.id, draft.reflection);
      }

      setBookDraft({ ...bookDraft, title: bookDraft.title.trim() });
      setValues(nextValues);
      setDrafts(nextDrafts);
      setImageDisplays(nextImageDisplays);
      setPendingIllustrations([]);
      setAttemptDrafts(createAttemptDrafts(readBook.attempts.map((attempt) => ({
        ...attempt,
        ...attemptDrafts[attempt.id],
      }))));
      setUndo(lastChangedField);
      setIsEditingBook(false);
      await loadPage();
      setMessage('Changes saved.');
      onReadingChanged();
    } catch {
      setMessage('Some changes could not be saved. Review them and try again.');
    } finally {
      setIsSavingPage(false);
    }
  }

  async function undoLastFieldEdit() {
    if (!undo) return;
    try {
      await pages.saveValue(readBook.book.id, undo.field.id, undo.before);
      const restored = undo.before ?? '';
      await loadPage();
      setValues((current) => ({ ...current, [undo.field.id]: restored }));
      if (undo.field.type !== 'image') setDrafts((current) => ({ ...current, [undo.field.id]: restored }));
      setMessage('Last field edit undone.');
      setUndo(null);
    } catch {
      setMessage('The previous value could not be restored. Try again.');
    }
  }

  async function addBookField() {
    if (!newLabel.trim()) {
      setMessage('Add a name for this Book-only field.');
      return;
    }
    try {
      await pages.addField({
        bookId: readBook.book.id,
        label: newLabel.trim(),
        type: newType,
        position: fields.filter((field) => field.bookId === readBook.book.id).length,
      });
      setNewLabel('');
      await loadPage();
      setMessage('Book-only field added.');
    } catch {
      setMessage('The Book-only field could not be added.');
    }
  }

  async function chooseBookCover() {
    try {
      const image = await pickBookImage();
      if (image) setBookDraft((current) => ({ ...current, coverUrl: image }));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'The cover image could not be opened.');
    }
  }

  async function startReread() {
    if (currentAttempt || !isValidReadingDate(startedOn)) {
      setMessage(currentAttempt ? 'This Book is already the Current book.' : 'Enter a valid reread start date.');
      return;
    }
    setIsStarting(true);
    try {
      await repository.startReread(readBook.book.id, startedOn);
      onReadingChanged();
      setMessage('A new Reading attempt has started.');
    } catch {
      setMessage('A new Reading attempt could not be started. Try again.');
    } finally {
      setIsStarting(false);
    }
  }

  function updateAttemptDraft(attemptId: string, changes: Partial<AttemptDraft>) {
    setAttemptDrafts((current) => ({
      ...current,
      [attemptId]: { ...(current[attemptId] ?? { startedOn: '', finishedOn: '', rating: null, reflection: '' }), ...changes },
    }));
  }

  async function deleteBookPage() {
    try {
      await pages.deleteBookPage(readBook.book.id);
      onReadingChanged();
      onBack();
    } catch {
      setMessage('The Book page could not be deleted. Try again.');
    }
  }

  async function chooseIllustration(field: BookPageField) {
    try {
      const image = await pickBookImage();
      if (image) setDrafts((current) => ({ ...current, [field.id]: image }));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Photos could not be opened. Check photo access and try again.');
    }
  }

  async function addIllustration() {
    try {
      const uri = await pickBookImage();
      if (!uri) return;
      const label = `Illustration ${imageFields.length + pendingIllustrations.length + 1}`;
      setPendingIllustrations((current) => [...current, { id: `pending-${Date.now()}-${Math.random()}`, label, uri }]);
      setMessage(null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Photos could not be opened. Check photo access and try again.');
    }
  }

  saveActionRef.current = () => { void savePageChanges(); };

  return (
    <View style={styles.detailPanel} testID="book-page">
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.secondaryButtonText}>‹ Read Books</Text>
      </Pressable>
      <Text style={styles.detailTitle}>{readBook.book.title}</Text>
      <View style={styles.bookFeatureSheet}>
        <View style={styles.bookOverview}>
          <View style={styles.coverColumn}>
            <BookCover book={readBook.book} large />
          </View>
          <View style={styles.metadata}>
            <View accessibilityLabel={`Latest rating: ${formatRating(latestRating(readBook.attempts))}`} style={styles.overviewStars}>
              <RatingStars rating={latestRating(readBook.attempts)} size={28} />
            </View>
            <MetadataRow label="Author" value={readBook.book.authors.join(', ') || 'Not listed'} />
            <MetadataRow label="Series" value={valueForLabel(fields, values, 'Series') || 'Not listed'} />
            <MetadataRow label="Couple" value={valueForLabel(fields, values, 'Couple') || 'Not listed'} />
            <MetadataRow label="Categories" value={readBook.book.categories.join(', ') || 'Not listed'} />
            <MetadataRow label="Paperback pages" value={readBook.book.pageCount === null ? 'Not listed' : String(readBook.book.pageCount)} />
            {latestFinishedAttempt?.finishedOn ? <MetadataRow label="Finished" value={latestFinishedAttempt.finishedOn} /> : null}
          </View>
        </View>

        <View style={styles.illustrationGallery} testID="book-illustrations">
          {imageFields.map((field) => {
            const uri = drafts[field.id] ?? imageDisplays[field.id] ?? '';
            return (
              <View key={field.id} style={[styles.illustrationItem, imageFields.length === 1 && pendingIllustrations.length === 0 && styles.singleIllustrationItem]}>
                {isImageUri(uri) ? (
                  <Image accessibilityLabel={field.label} source={{ uri }} resizeMode="contain" style={styles.galleryImage} />
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => void chooseIllustration(field)} style={styles.emptyIllustration}>
                    <Text style={styles.emptyIllustrationIcon}>▧</Text>
                    <Text style={styles.emptyIllustrationText}>Choose an image</Text>
                  </Pressable>
                )}
                {isImageUri(uri) ? (
                  <View style={styles.imageActions}>
                    <Pressable accessibilityRole="button" onPress={() => void chooseIllustration(field)} style={styles.imageActionButton}><Text style={styles.imageActionText}>Replace</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setDrafts((current) => ({ ...current, [field.id]: '' }))} style={styles.imageActionButton}><Text style={styles.imageActionText}>Remove</Text></Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          {pendingIllustrations.map((illustration) => (
            <View key={illustration.id} style={[styles.illustrationItem, styles.singleIllustrationItem]}>
              <Image accessibilityLabel={illustration.label} source={{ uri: illustration.uri }} resizeMode="contain" style={styles.galleryImage} />
              <Pressable accessibilityRole="button" onPress={() => setPendingIllustrations((current) => current.filter((item) => item.id !== illustration.id))} style={styles.imageActionButton}><Text style={styles.imageActionText}>Remove</Text></Pressable>
            </View>
          ))}
          {imageFields.length === 0 && pendingIllustrations.length === 0 ? (
            <Pressable accessibilityRole="button" onPress={() => void addIllustration()} style={styles.emptyIllustration}>
              <Text style={styles.emptyIllustrationIcon}>▧</Text>
              <Text style={styles.emptyIllustrationText}>Add a photo or illustration</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => void addIllustration()} style={[styles.secondaryButton, styles.addImageButton]}>
          <Text style={styles.secondaryButtonText}>＋ Add image</Text>
        </Pressable>
      </View>

      {isEditingBook ? (
        <View style={styles.rereadPanel}>
          <Text style={styles.sectionTitle}>Edit saved Book details</Text>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput accessibilityLabel="Book title" onChangeText={(title) => setBookDraft((current) => ({ ...current, title }))} style={styles.input} value={bookDraft.title} />
          <Text style={styles.fieldLabel}>Authors · comma separated</Text>
          <TextInput accessibilityLabel="Book authors" onChangeText={(value) => setBookDraft((current) => ({ ...current, authors: splitLines(value) }))} style={styles.input} value={bookDraft.authors.join(', ')} />
          <Text style={styles.fieldLabel}>Categories · comma separated</Text>
          <TextInput accessibilityLabel="Book categories" onChangeText={(value) => setBookDraft((current) => ({ ...current, categories: splitLines(value) }))} style={styles.input} value={bookDraft.categories.join(', ')} />
          <Text style={styles.fieldLabel}>Paperback page count</Text>
          <TextInput accessibilityLabel="Book page count" keyboardType="number-pad" onChangeText={(value) => setBookDraft((current) => ({ ...current, pageCount: value.trim() ? Number(value) : null }))} style={styles.input} value={bookDraft.pageCount === null ? '' : String(bookDraft.pageCount)} />
          <Text style={styles.fieldLabel}>Cover image · JPG, JPEG, or PNG</Text>
          <BookCover book={{ ...readBook.book, ...bookDraft }} large />
          <Pressable accessibilityRole="button" onPress={() => void chooseBookCover()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{bookDraft.coverUrl ? 'Choose a different cover image' : 'Upload cover image'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setBookDraft(toBookDraft(readBook.book)); setIsEditingBook(false); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel editing</Text></Pressable>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" onPress={() => setIsEditingBook(true)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Edit Book details</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowDeleteConfirmation(true)} style={styles.destructiveButton}><Text style={styles.destructiveText}>Delete Book page</Text></Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Book page notes</Text>
      {noteFields.map((field) => (
        <View key={field.id} style={styles.fieldPanel}>
          <Text style={styles.fieldLabel}>{field.label}{field.isTemplate ? ' · template' : ' · this Book'}</Text>
          <TextInput
            accessibilityLabel={field.label}
            multiline={field.type === 'multiline' || field.type === 'list'}
            onChangeText={(value) => setDrafts((current) => ({ ...current, [field.id]: value }))}
            placeholder={field.type === 'list' ? 'One item on each line' : `Write ${field.label.toLowerCase()}…`}
            style={[styles.input, (field.type === 'multiline' || field.type === 'list') && styles.multilineInput]}
            value={drafts[field.id] ?? ''}
          />
        </View>
      ))}
      {undo ? <Pressable accessibilityRole="button" onPress={() => void undoLastFieldEdit()} style={styles.undoButton}><Text style={styles.secondaryButtonText}>Undo last edit to {undo.field.label}</Text></Pressable> : null}

      <View style={styles.fieldPanel}>
        <Text style={styles.sectionTitle}>Add a field to this Book only</Text>
        <TextInput accessibilityLabel="Book-only field name" onChangeText={setNewLabel} placeholder="For example: Favorite chapter" style={styles.input} value={newLabel} />
        <View style={styles.buttonRow}>
          {fieldTypes.map(({ label, type }) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: newType === type }} onPress={() => setNewType(type)} style={[styles.typeButton, newType === type && styles.selectedType]}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>)}
        </View>
        <Pressable accessibilityRole="button" onPress={() => void addBookField()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Add Book-only field</Text></Pressable>
      </View>

      <Text style={styles.sectionTitle}>Reading attempts · {readBook.attempts.length}</Text>
      {sortedAttempts.map((attempt) => (
        <AttemptDetails
          key={attempt.id}
          attempt={attempt}
          draft={attemptDrafts[attempt.id] ?? createAttemptDraft(attempt)}
          onChange={(changes) => updateAttemptDraft(attempt.id, changes)}
        />
      ))}
      {currentAttempt ? (
        <Text style={styles.helpText}>This Book is currently being read. Finish it to add its next rating and finish date.</Text>
      ) : (
        <View style={styles.rereadPanel}>
          <Text style={styles.sectionTitle}>Read this Book again</Text>
          <Text style={styles.fieldLabel}>Reread start date</Text>
          <TextInput accessibilityLabel="Reread start date" keyboardType="numbers-and-punctuation" onChangeText={setStartedOn} placeholder="YYYY-MM-DD" style={styles.input} value={startedOn} />
          <Pressable accessibilityRole="button" accessibilityLabel="Read this Book again" disabled={isStarting} onPress={() => void startReread()} style={[styles.primaryButton, isStarting && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>{isStarting ? 'Starting…' : 'Start reread'}</Text>
          </Pressable>
        </View>
      )}
      {showDeleteConfirmation ? (
        <View accessibilityRole="alert" style={styles.confirmPanel}>
          <Text style={styles.confirmTitle}>Delete “{readBook.book.title}”?</Text>
          <Text style={styles.helpText}>This also removes its reading attempts, daily logs, notes, and bookshelf placement.</Text>
          <View style={styles.buttonRow}>
            <Pressable accessibilityRole="button" onPress={() => void deleteBookPage()} style={styles.destructiveButton}><Text style={styles.destructiveText}>Delete permanently</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowDeleteConfirmation(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Keep Book</Text></Pressable>
          </View>
        </View>
      ) : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      <View style={styles.saveFooterSpacer} />
    </View>
  );
}

function AttemptDetails({
  attempt,
  draft,
  onChange,
}: {
  attempt: ReadingAttempt;
  draft: AttemptDraft;
  onChange(changes: Partial<AttemptDraft>): void;
}) {
  return (
    <View style={styles.attemptPanel}>
      <View style={styles.attemptSummary}>
        <Text style={styles.attemptLine}>{attempt.finishedOn ? `${attempt.startedOn} → ${attempt.finishedOn}` : `In progress · started ${attempt.startedOn}`}</Text>
        {attempt.finishedOn ? <View accessibilityLabel={`Rating ${formatRating(attempt.rating)}`} style={styles.attemptStars}><RatingStars rating={attempt.rating} size={18} /></View> : null}
      </View>
      <Text style={styles.fieldLabel}>Start date</Text>
      <TextInput accessibilityLabel={`Start date for ${attempt.startedOn}`} keyboardType="numbers-and-punctuation" onChangeText={(startedOn) => onChange({ startedOn })} style={styles.input} value={draft.startedOn} />
      {attempt.finishedOn ? (
        <>
          <Text style={styles.fieldLabel}>Finish date</Text>
          <TextInput accessibilityLabel={`Finish date for ${attempt.startedOn}`} keyboardType="numbers-and-punctuation" onChangeText={(finishedOn) => onChange({ finishedOn })} style={styles.input} value={draft.finishedOn} />
          <Text style={styles.fieldLabel}>Rating · half stars</Text>
          <View style={styles.buttonRow}>
            {Array.from({ length: 9 }, (_, index) => (index + 2) / 2).map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Edit rating ${value} stars for ${attempt.startedOn}`} accessibilityState={{ selected: draft.rating === value }} onPress={() => onChange({ rating: value })} style={[styles.typeButton, draft.rating === value && styles.selectedType]}>
                <RatingStars rating={value} size={16} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.fieldLabel}>Reflection for this Reading attempt</Text>
      <TextInput accessibilityLabel={`Reflection for ${attempt.startedOn}`} multiline onChangeText={(reflection) => onChange({ reflection })} placeholder="How did this reading feel?" style={[styles.input, styles.multilineInput]} value={draft.reflection} />
    </View>
  );
}

export function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  return (
    <View style={[styles.cover, large && styles.largeCover]}>
      {book.coverUrl ? <Image accessibilityLabel={`${book.title} cover`} resizeMode="cover" source={{ uri: book.coverUrl }} style={styles.coverImage} /> : <Text numberOfLines={4} style={styles.coverPlaceholder}>{book.title}</Text>}
    </View>
  );
}

function toBookDraft(book: Book): BookDraft {
  const { id: _id, ...draft } = book;
  return draft;
}

function isImageUri(value: string | undefined): boolean {
  return Boolean(value && /^(https?:\/\/|file:\/\/|blob:|data:image\/)/i.test(value));
}

function splitLines(value: string): string[] {
  return value.split(',').map((line) => line.trim()).filter(Boolean);
}

function latestRating(attempts: ReadingAttempt[]): number | null {
  const rated = attempts.filter((attempt) => attempt.finishedOn !== null && attempt.rating !== null)
    .sort((left, right) => (right.finishedOn ?? '').localeCompare(left.finishedOn ?? ''));
  return rated[0]?.rating ?? null;
}

function formatRating(rating: number | null): string {
  return rating === null ? 'Not rated' : `${rating} ${rating === 1 ? 'star' : 'stars'}`;
}

function valueForLabel(fields: BookPageField[], values: Record<string, string>, label: string): string | null {
  const field = fields.find((entry) => entry.label.trim().toLowerCase() === label.toLowerCase());
  return field ? values[field.id] ?? null : null;
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metadataLine}>
      <Text style={styles.metadataLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.metadataValue}>{value}</Text>
    </View>
  );
}

function createAttemptDraft(attempt: ReadingAttempt): AttemptDraft {
  return {
    startedOn: attempt.startedOn,
    finishedOn: attempt.finishedOn ?? '',
    rating: attempt.rating,
    reflection: attempt.reflection,
  };
}

function createAttemptDrafts(attempts: ReadingAttempt[]): Record<string, AttemptDraft> {
  return Object.fromEntries(attempts.map((attempt) => [attempt.id, createAttemptDraft(attempt)]));
}

function sameBookDraft(draft: BookDraft, book: Book): boolean {
  return draft.title === book.title &&
    arraysEqual(draft.authors, book.authors) &&
    draft.coverUrl === book.coverUrl &&
    arraysEqual(draft.categories, book.categories) &&
    draft.pageCount === book.pageCount &&
    draft.description === book.description;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fieldHasChanges(
  field: BookPageField,
  drafts: Record<string, string>,
  values: Record<string, string>,
  imageDisplays: Record<string, string>,
): boolean {
  const draft = drafts[field.id] ?? '';
  if (field.type === 'image') return draft !== (imageDisplays[field.id] ?? values[field.id] ?? '');
  return draft !== (values[field.id] ?? '');
}

function attemptHasChanges(attempt: ReadingAttempt, draft?: AttemptDraft): boolean {
  if (!draft) return false;
  return draft.startedOn !== attempt.startedOn ||
    draft.finishedOn !== (attempt.finishedOn ?? '') ||
    draft.rating !== attempt.rating ||
    draft.reflection !== attempt.reflection;
}

const fixedSaveFabPosition: ViewStyle = Platform.OS === 'web'
  ? ({ bottom: 22, position: 'fixed', right: 22, zIndex: 1000 } as unknown as ViewStyle)
  : { bottom: 22, position: 'absolute', right: 22, zIndex: 1000 };

const styles = StyleSheet.create({
  detailPanel: { backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginTop: 12, padding: 22 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  detailTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 36, marginBottom: 22, marginTop: 8, textAlign: 'center' },
  bookFeatureSheet: { backgroundColor: '#FBF6E3', borderRadius: 20, padding: 18 },
  bookOverview: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  coverColumn: { alignItems: 'center', gap: 5 },
  overviewStars: { alignItems: 'flex-start', marginBottom: 4, marginTop: 2 },
  metadata: { flex: 1, gap: 1, minWidth: 210, paddingTop: 3 },
  metadataLine: { alignItems: 'baseline', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 34, paddingVertical: 7 },
  metadataLabel: { color: colors.muted, fontSize: 13, minWidth: 112 },
  metadataValue: { color: colors.ink, flex: 1, fontSize: 14 },
  cover: { alignItems: 'center', alignSelf: 'center', aspectRatio: 0.68, backgroundColor: '#F0EDDF', borderColor: colors.ink, borderRadius: 6, borderWidth: 1, justifyContent: 'center', maxWidth: 190, overflow: 'hidden', width: '100%' },
  largeCover: { aspectRatio: undefined, height: 220, maxWidth: undefined, width: 145 },
  coverImage: { height: '100%', width: '100%' },
  coverPlaceholder: { color: colors.ink, fontFamily: 'Georgia', fontSize: 15, padding: 12, textAlign: 'center' },
  sectionTitle: { color: colors.ink, fontFamily: 'Baskerville', fontSize: 25, marginTop: 24 },
  illustrationGallery: { alignItems: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  addImageButton: { alignSelf: 'flex-start', marginTop: 12 },
  illustrationItem: { flexGrow: 1, minWidth: 230, width: '47%' },
  singleIllustrationItem: { width: '100%' },
  galleryImage: { aspectRatio: 1.65, backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 12, borderWidth: 1, maxHeight: 520, width: '100%' },
  emptyIllustration: { alignItems: 'center', backgroundColor: '#FFFDF6', borderColor: '#B8B29E', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, height: 190, justifyContent: 'center', width: '100%' },
  emptyIllustrationIcon: { color: colors.olive, fontSize: 32 },
  emptyIllustrationText: { color: colors.ink, fontSize: 14, fontWeight: '600', marginTop: 5 },
  imageActions: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 4 },
  imageActionButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', marginTop: 6, minHeight: 34, paddingHorizontal: 11 },
  imageActionText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  fieldPanel: { backgroundColor: '#FBF6E3', borderColor: '#E7E0C9', borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 18 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  multilineInput: { minHeight: 100, textAlignVertical: 'top' },
  buttonRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 11, justifyContent: 'center', marginTop: 12, minHeight: 46, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.panel, fontSize: 13, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  destructiveButton: { alignItems: 'center', backgroundColor: '#FAECE7', borderColor: '#C48A7C', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 14 },
  destructiveText: { color: '#8B3F32', fontSize: 13, fontWeight: '700' },
  typeButton: { borderColor: colors.line, borderRadius: 9, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 },
  selectedType: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  undoButton: { alignSelf: 'flex-start', backgroundColor: '#E9E8DA', borderRadius: 10, marginTop: 12, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  attemptPanel: { backgroundColor: '#FBF6E3', borderColor: '#E7E0C9', borderRadius: 14, borderWidth: 1, marginTop: 12, padding: 14 },
  attemptSummary: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  attemptLine: { color: colors.ink, flex: 1, fontSize: 14, paddingVertical: 6 },
  attemptStars: { alignItems: 'flex-end' },
  rereadPanel: { backgroundColor: colors.paper, borderRadius: 14, marginTop: 14, padding: 14 },
  disabledButton: { opacity: 0.55 },
  helpText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9 },
  confirmPanel: { backgroundColor: '#FAECE7', borderColor: '#C48A7C', borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 16 },
  confirmTitle: { color: '#8B3F32', fontFamily: 'Georgia', fontSize: 20 },
  message: { color: colors.olive, fontSize: 13, marginTop: 12 },
  saveFooterSpacer: { height: 88 },
  saveFab: { alignItems: 'center', backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 18, borderWidth: 1, minWidth: 82, paddingHorizontal: 8, paddingVertical: 7, shadowColor: '#403B2B', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.24, shadowRadius: 6, elevation: 8 },
  saveFabButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  saveFabDisabled: { opacity: 0.9 },
  saveFabIcon: { color: colors.panel, fontSize: 27, lineHeight: 34 },
  saveStatusMark: { color: '#54805A', fontSize: 17, fontWeight: '800', lineHeight: 19, marginTop: 1 },
  unsavedStatusMark: { color: '#B47A34', fontSize: 12, lineHeight: 19 },
  saveStatusLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', lineHeight: 13 },
  unsavedStatusLabel: { color: '#9A622A' },
});
