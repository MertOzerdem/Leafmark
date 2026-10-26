import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { journalColors as colors } from '../../theme/colors';
import type {
  ReadingCategory,
  ReadingConfiguration,
  ReadingConfigurationDraft,
  ReadingLog,
  ReadingMeasure,
  ReadingRepository,
  ReadingSnapshot,
} from '../../reading/readingTypes';
import { isValidReadingDate, padDatePart, todayDate } from '../../reading/readingDates';

interface ReadingTrackerScreenProps {
  repository: ReadingRepository;
  refreshToken: number;
  onBookFinished(): void;
}

const categoryPalette = ['#EFE4E7', '#D7B5C0', '#B98598', '#896878', '#5A4351'];
const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const emptySnapshot: ReadingSnapshot = {
  books: [],
  configurations: [],
  currentAttempt: null,
  logs: [],
  usedConfigurationIds: [],
};

export function ReadingTrackerScreen({ onBookFinished, refreshToken, repository }: ReadingTrackerScreenProps) {
  const [year, setYear] = useState(2027);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState<ReadingConfigurationDraft>(defaultConfiguration('minutes'));
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [bookStartDate, setBookStartDate] = useState(todayDate());
  const [currentStartDate, setCurrentStartDate] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [readingDate, setReadingDate] = useState(todayDate());
  const [amount, setAmount] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [finishDate, setFinishDate] = useState(todayDate());
  const [finishRating, setFinishRating] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isFinishFormOpen, setIsFinishFormOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (selectSavedConfiguration = false) => {
    setIsLoading(true);
    try {
      const next = await repository.loadSnapshot(year);
      setSnapshot(next);
      if (selectSavedConfiguration && next.configurations.length > 0) {
        const latest = [...next.configurations].sort(compareConfigurationDates).at(-1);
        if (latest) {
          setSettingsDraft(toConfigurationDraft(latest));
          setSettingsDirty(false);
        }
      }
      setSelectedBookId((current) => next.currentAttempt?.bookId ?? (current || next.books[0]?.id || ''));
      if (next.currentAttempt) setCurrentStartDate(next.currentAttempt.startedOn);
      return next;
    } catch {
      setMessage('Your reading tracker could not be loaded. Try again.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [repository, year]);

  useEffect(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  useEffect(() => {
    if (refreshToken > 0) void loadSnapshot(false);
  }, [loadSnapshot, refreshToken]);

  const configurationForDate = useMemo(() => {
    if (settingsDirty && readingDate >= settingsDraft.startsOn) return { ...settingsDraft, id: null };
    return findConfigurationForDate(snapshot.configurations, readingDate) ??
      (settingsDraft.id ? settingsDraft : null);
  }, [readingDate, settingsDirty, settingsDraft, snapshot.configurations]);
  const rangesLocked = settingsDraft.id !== null && snapshot.usedConfigurationIds.includes(settingsDraft.id);
  const unitName = configurationForDate?.measure ?? settingsDraft.measure;

  async function saveSettings() {
    if (!isValidReadingDate(settingsDraft.startsOn)) {
      setMessage('Enter a valid date for this reading-measure baseline.');
      return;
    }
    if (!areCategoriesValid(settingsDraft.categories)) {
      setMessage('Reading categories must start at 1, use increasing limits, and end with an open range.');
      return;
    }
    if (rangesLocked && settingsDraft.measure === configurationForDate?.measure) {
      setMessage('These category ranges are fixed because reading logs already use them. You can still change their colors.');
      return;
    }

    setIsSavingSettings(true);
    setMessage(null);
    try {
      await repository.saveConfiguration(settingsDraft);
      const next = await loadSnapshot(true);
      if (next) setMessage('Reading settings saved.');
    } catch {
      setMessage('Reading settings could not be saved. Try again.');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function changeCategoryColor(position: number, color: string) {
    const updatedCategories = settingsDraft.categories.map((category) =>
      category.position === position ? { ...category, color } : category,
    );
    setSettingsDraft((current) => ({ ...current, categories: updatedCategories }));
    setMessage(null);
    try {
      if (settingsDraft.id) await repository.updateCategoryColor(position, color);
      if (settingsDraft.id) await loadSnapshot(false);
      else setSettingsDirty(true);
    } catch {
      setMessage('The category color could not be saved. Try again.');
    }
  }

  async function startBook(bookId: string) {
    if (!isValidReadingDate(bookStartDate)) {
      setMessage('Enter a valid book start date.');
      return;
    }
    setMessage(null);
    try {
      await repository.startBook(bookId, bookStartDate);
      setSelectedBookId(bookId);
      await loadSnapshot(false);
    } catch {
      setMessage('The Current book could not be updated. Try again.');
    }
  }

  async function saveCurrentStartDate() {
    const attempt = snapshot.currentAttempt;
    if (!attempt || !isValidReadingDate(currentStartDate)) {
      setMessage('Enter a valid book start date.');
      return;
    }
    try {
      await repository.updateAttemptStart(attempt.id, currentStartDate);
      await loadSnapshot(false);
      setMessage('Book start date updated.');
    } catch {
      setMessage('The book start date could not be updated. Try again.');
    }
  }

  async function saveDailyTotal() {
    const numericAmount = Number(amount.trim());
    if (!selectedBookId) {
      setMessage('Choose a book for this daily total.');
      return;
    }
    if (!isValidReadingDate(readingDate)) {
      setMessage('Enter a valid reading date.');
      return;
    }
    if (!Number.isInteger(numericAmount) || numericAmount < 1) {
      setMessage(`Enter a positive whole number of ${unitName}.`);
      return;
    }
    if (!configurationForDate?.id) {
      setMessage('Save reading settings before adding a daily total.');
      return;
    }
    if (!findCategory(configurationForDate.categories, numericAmount)) {
      setMessage(`No Reading category includes ${numericAmount} ${unitName}.`);
      return;
    }

    setIsSavingLog(true);
    setMessage(null);
    try {
      await repository.saveDailyTotal({
        id: editingLogId,
        bookId: selectedBookId,
        configurationId: configurationForDate.id,
        date: readingDate,
        amount: numericAmount,
      });
      await loadSnapshot(false);
      setEditingLogId(null);
      setAmount('');
      setMessage('Daily total saved.');
    } catch {
      setMessage('The daily total could not be saved. Try again.');
    } finally {
      setIsSavingLog(false);
    }
  }

  async function finishCurrentBook() {
    const attempt = snapshot.currentAttempt;
    if (!attempt) return;
    if (!isValidReadingDate(finishDate) || finishDate < attempt.startedOn) {
      setMessage('Finish date must be a valid date on or after the book start date.');
      return;
    }
    if (finishRating === null) {
      setMessage('Choose a rating from 0.5 to 5 stars.');
      return;
    }

    setIsFinishing(true);
    setMessage(null);
    try {
      await repository.finishAttempt(attempt.id, finishDate, finishRating);
      setIsFinishFormOpen(false);
      setFinishRating(null);
      await loadSnapshot(false);
      onBookFinished();
      setMessage('Book finished and added to Read Books.');
    } catch {
      setMessage('The Book could not be marked finished. Try again.');
    } finally {
      setIsFinishing(false);
    }
  }

  function editLog(log: ReadingLog) {
    setEditingLogId(log.id);
    setSelectedBookId(log.bookId);
    setReadingDate(log.date);
    setAmount(String(log.amount));
    setMessage(null);
  }

  function selectCalendarDate(date: string) {
    setReadingDate(date);
    setEditingLogId(null);
    setAmount('');
    const firstLog = snapshot.logs.find((log) => log.date === date);
    if (firstLog) setSelectedBookId(firstLog.bookId);
  }

  function changeMeasure(measure: ReadingMeasure) {
    if (settingsDraft.measure === measure) return;
    const defaults = defaultConfiguration(measure);
    const startsOn = `${year}-01-01`;
    setSettingsDraft({
      ...defaults,
      startsOn,
      categories: defaults.categories.map((category) => ({
        ...category,
        color: settingsDraft.categories[category.position]?.color ?? category.color,
      })),
    });
    setSettingsDirty(true);
    setMessage(null);
  }

  function updateCategoryLimit(position: number, value: string) {
    const parsed = value.trim() ? Number(value) : null;
    const categories = settingsDraft.categories.map((category, index) => ({
      ...category,
      minimum: index === 0 ? 1 : 0,
      maximum: index === position ? parsed : category.maximum,
    }));
    let nextMinimum = 1;
    const resequenced = categories.map((category, index) => {
      const next = { ...category, position: index, minimum: nextMinimum };
      if (index === categories.length - 1) next.maximum = null;
      if (next.maximum !== null) nextMinimum = next.maximum + 1;
      return next;
    });
    setSettingsDraft((current) => ({ ...current, categories: resequenced }));
    setSettingsDirty(true);
  }

  function addCategory() {
    const categories = settingsDraft.categories.map((category) => ({ ...category }));
    const last = categories.at(-1);
    if (!last) return;
    const splitAt = last.minimum + 29;
    last.maximum = splitAt;
    categories.push({
      position: categories.length,
      minimum: splitAt + 1,
      maximum: null,
      color: categoryPalette[categories.length % categoryPalette.length],
    });
    setSettingsDraft((current) => ({ ...current, categories }));
    setSettingsDirty(true);
  }

  function removeLastCategory() {
    if (settingsDraft.categories.length <= 1) return;
    const categories = settingsDraft.categories.slice(0, -1).map((category) => ({ ...category }));
    categories[categories.length - 1] = { ...categories[categories.length - 1], maximum: null };
    setSettingsDraft((current) => ({ ...current, categories }));
    setSettingsDirty(true);
  }

  const totalByDate = useMemo(
    () => aggregateLogsByDate(snapshot.logs, snapshot.configurations, settingsDraft),
    [settingsDraft, snapshot.configurations, snapshot.logs],
  );
  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>{year} Reading Log</Text>
      <Text style={styles.pageIntro}>Keep one daily total for each Book and Reading attempt.</Text>

      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Reading settings</Text>
        <Text style={styles.fieldLabel}>Primary Reading measure</Text>
        <View style={styles.buttonRow}>
          {(['minutes', 'pages', 'chapters'] as const).map((measure) => (
            <Pressable
              key={measure}
              accessibilityRole="button"
              accessibilityLabel={`Set reading measure to ${capitalize(measure)}`}
              onPress={() => changeMeasure(measure)}
              style={[styles.choiceButton, settingsDraft.measure === measure && styles.selectedChoice]}
            >
              <Text style={[styles.choiceText, settingsDraft.measure === measure && styles.selectedChoiceText]}>{capitalize(measure)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Reading measure baseline starts on</Text>
        <TextInput
          accessibilityLabel="Reading baseline starts on"
          keyboardType="numbers-and-punctuation"
          onChangeText={(startsOn) => {
            setSettingsDraft((current) => ({ ...current, startsOn }));
            setSettingsDirty(true);
          }}
          placeholder="YYYY-MM-DD"
          style={styles.input}
          value={settingsDraft.startsOn}
        />
        <Text style={styles.helpText}>{capitalize(settingsDraft.measure)} · starting {settingsDraft.startsOn}</Text>

        <Text style={styles.fieldLabel}>Fixed Reading categories · color applies to every year</Text>
        <View style={styles.categoryRows}>
          {settingsDraft.categories.map((category, index) => (
            <View key={category.position} style={styles.categoryRow}>
              <View style={styles.categoryCopy}>
                <Text style={styles.categoryLabel}>{formatCategory(category, settingsDraft.measure)}</Text>
                {index < settingsDraft.categories.length - 1 ? (
                  <TextInput
                    accessibilityLabel={`Category ${index + 1} upper limit`}
                    editable={!rangesLocked}
                    keyboardType="number-pad"
                    onChangeText={(value) => updateCategoryLimit(index, value)}
                    style={[styles.limitInput, rangesLocked && styles.disabledInput]}
                    value={category.maximum === null ? '' : String(category.maximum)}
                  />
                ) : <Text style={styles.openRange}>and above</Text>}
              </View>
              <View style={styles.swatches}>
                {categoryPalette.map((color) => (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityLabel={`Change category ${index + 1} color to ${color}`}
                    onPress={() => void changeCategoryColor(index, color)}
                    style={[styles.swatch, { backgroundColor: color }, category.color === color && styles.selectedSwatch]}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" disabled={rangesLocked} onPress={addCategory} style={[styles.secondaryButton, rangesLocked && styles.disabledButton]}>
            <Text style={styles.secondaryButtonText}>Add category</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={rangesLocked || settingsDraft.categories.length <= 1} onPress={removeLastCategory} style={[styles.secondaryButton, (rangesLocked || settingsDraft.categories.length <= 1) && styles.disabledButton]}>
            <Text style={styles.secondaryButtonText}>Remove last</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save reading settings"
            disabled={isSavingSettings || rangesLocked && !settingsDirty}
            onPress={() => void saveSettings()}
            style={[styles.primaryButton, (isSavingSettings || rangesLocked && !settingsDirty) && styles.disabledButton]}
          >
            {isSavingSettings ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryButtonText}>Save reading settings</Text>}
          </Pressable>
        </View>
        {rangesLocked ? <Text style={styles.helpText}>Used ranges stay fixed. Change the measure to create a new baseline; category colors remain editable.</Text> : null}
      </View>

      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Current book</Text>
        {snapshot.currentAttempt ? (
          <>
            <Text style={styles.currentBookTitle}>Current book: {snapshot.currentAttempt.bookTitle}</Text>
            <Text style={styles.fieldLabel}>Current book start date</Text>
            <View style={styles.dateActionRow}>
              <TextInput
                accessibilityLabel="Current book start date"
                keyboardType="numbers-and-punctuation"
                onChangeText={setCurrentStartDate}
                placeholder="YYYY-MM-DD"
                style={[styles.input, styles.dateInput]}
                value={currentStartDate}
              />
              <Pressable accessibilityRole="button" onPress={() => void saveCurrentStartDate()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Save start date</Text>
              </Pressable>
            </View>
            {isFinishFormOpen ? (
              <View style={styles.finishPanel}>
                <Text style={styles.fieldLabel}>Finish date</Text>
                <TextInput
                  accessibilityLabel="Finish date"
                  keyboardType="numbers-and-punctuation"
                  onChangeText={setFinishDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.input}
                  value={finishDate}
                />
                <Text style={styles.fieldLabel}>Rating · choose half-star increments</Text>
                <View style={styles.buttonRow}>
                  {Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((rating) => (
                    <Pressable
                      key={rating}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${rating} stars`}
                      accessibilityState={{ selected: finishRating === rating }}
                      onPress={() => setFinishRating(rating)}
                      style={[styles.ratingChoice, finishRating === rating && styles.selectedChoice]}
                    >
                      <Text style={styles.ratingText}>{starsForRating(rating)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Finish book"
                  disabled={isFinishing}
                  onPress={() => void finishCurrentBook()}
                  style={[styles.primaryButton, styles.finishButton, isFinishing && styles.disabledButton]}
                >
                  {isFinishing ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryButtonText}>Finish book</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setIsFinishFormOpen(false); setFinishRating(null); }} style={styles.cancelFinishButton}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Finish current book"
                onPress={() => { setFinishDate(todayDate()); setIsFinishFormOpen(true); }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Finish current book</Text>
              </Pressable>
            )}
          </>
        ) : <Text style={styles.helpText}>Choose a Book and start it, or select a Book when you enter its first daily total.</Text>}

        <Text style={styles.fieldLabel}>{snapshot.currentAttempt ? 'Start another Book' : 'Choose a Book to start'}</Text>
        {snapshot.books.length === 0 ? (
          <Text style={styles.helpText}>Add a Book to your TBR list before you start reading it.</Text>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Book start date"
              keyboardType="numbers-and-punctuation"
              onChangeText={setBookStartDate}
              placeholder="YYYY-MM-DD"
              style={styles.input}
              value={bookStartDate}
            />
            <View style={styles.bookChoices}>
              {snapshot.books.map((book) => (
                <Pressable key={book.id} accessibilityRole="button" accessibilityLabel={`Start ${book.title}`} onPress={() => void startBook(book.id)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Start {book.title}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>{editingLogId ? 'Edit daily total' : 'Add daily total'}</Text>
        <Text style={styles.fieldLabel}>Book for this total</Text>
        <View style={styles.bookChoices}>
          {snapshot.books.map((book) => (
            <Pressable
              key={book.id}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${book.title} for daily total`}
              onPress={() => setSelectedBookId(book.id)}
              style={[styles.choiceButton, selectedBookId === book.id && styles.selectedChoice]}
            >
              <Text style={[styles.choiceText, selectedBookId === book.id && styles.selectedChoiceText]}>{book.title}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Reading date</Text>
        <TextInput
          accessibilityLabel="Reading date"
          keyboardType="numbers-and-punctuation"
          onChangeText={setReadingDate}
          placeholder="YYYY-MM-DD"
          style={styles.input}
          value={readingDate}
        />
        <Text style={styles.fieldLabel}>{capitalize(unitName)} read</Text>
        <TextInput
          accessibilityLabel={`${capitalize(unitName)} read`}
          keyboardType="number-pad"
          onChangeText={setAmount}
          placeholder={`Total ${unitName} for this Book and day`}
          style={styles.input}
          value={amount}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editingLogId ? 'Save changes' : 'Save daily total'}
          disabled={isSavingLog || isLoading}
          onPress={() => void saveDailyTotal()}
          style={[styles.primaryButton, styles.saveLogButton, (isSavingLog || isLoading) && styles.disabledButton]}
        >
          {isSavingLog ? <ActivityIndicator color={colors.panel} /> : <Text style={styles.primaryButtonText}>{editingLogId ? 'Save changes' : 'Save daily total'}</Text>}
        </Pressable>
        {editingLogId ? (
          <Pressable accessibilityRole="button" onPress={() => { setEditingLogId(null); setAmount(''); }} style={styles.cancelButton}>
            <Text style={styles.secondaryButtonText}>Cancel edit</Text>
          </Pressable>
        ) : null}
      </View>

      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      {isLoading ? <ActivityIndicator color={colors.olive} style={styles.loader} /> : null}

      <View style={styles.sectionPanel}>
        <View style={styles.yearHeading}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous year" onPress={() => setYear((value) => value - 1)} style={styles.yearButton}>
            <Text style={styles.yearButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>{year} at a glance</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next year" onPress={() => setYear((value) => value + 1)} style={styles.yearButton}>
            <Text style={styles.yearButtonText}>›</Text>
          </Pressable>
        </View>
        <AnnualReadingGrid year={year} totals={totalByDate} onSelectDate={selectCalendarDate} />
        {configurationForDate ? (
          <View style={styles.legend} accessibilityLabel="Reading category legend">
            {configurationForDate.categories.map((category) => (
              <View key={category.position} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: category.color }]} />
                <Text style={styles.legendLabel}>{formatCategory(category, configurationForDate.measure)}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={styles.helpText}>Save reading settings to see the activity color key.</Text>}
      </View>

      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Daily totals · {year}</Text>
        {snapshot.logs.length === 0 ? <Text style={styles.helpText}>No Reading logs for this year yet.</Text> : snapshot.logs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <Text style={styles.logText}>{log.bookTitle} · {log.date} · {log.amount} {log.measure}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit reading log for ${log.bookTitle} dated ${log.date}`} onPress={() => editLog(log)} style={styles.smallAction}>
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnnualReadingGrid({
  onSelectDate,
  totals,
  year,
}: {
  onSelectDate(date: string): void;
  totals: Map<string, { amount: number; measure: ReadingMeasure; categoryLabel: string; color: string }>;
  year: number;
}) {
  return (
    <View testID="annual-reading-grid" style={styles.calendar}>
      <View style={styles.calendarRow}>
        <View style={styles.dayNumberCell} />
        {months.map((month) => <Text key={month} style={styles.monthHeader}>{month.slice(0, 3)}</Text>)}
      </View>
      {Array.from({ length: 31 }, (_, dayIndex) => {
        const day = dayIndex + 1;
        return (
          <View key={day} style={styles.calendarRow}>
            <Text style={styles.dayNumberCell}>{day}</Text>
            {months.map((month, monthIndex) => {
              const date = `${year}-${padDatePart(monthIndex + 1)}-${padDatePart(day)}`;
              const isValidDay = day <= daysInMonth(year, monthIndex);
              const activity = isValidDay ? totals.get(date) : undefined;
              const label = activity
                ? `${month} ${day}: ${activity.amount} ${activity.measure}, category ${activity.categoryLabel}`
                : `${month} ${day}: no reading total`;
              return (
                <Pressable
                  key={month}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  disabled={!isValidDay}
                  onPress={() => onSelectDate(date)}
                  style={styles.calendarDay}
                >
                  <Text style={[styles.calendarHeart, activity && { color: activity.color }]}>{activity ? '♥' : '♡'}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function defaultConfiguration(measure: ReadingMeasure): ReadingConfigurationDraft {
  const upperLimits = measure === 'chapters' ? [1, 3, 5, 10, null] : [10, 30, 60, 120, null];
  let minimum = 1;
  return {
    id: null,
    measure,
    startsOn: '2027-01-01',
    categories: upperLimits.map((maximum, position) => {
      const category = { position, minimum, maximum, color: categoryPalette[position] };
      if (maximum !== null) minimum = maximum + 1;
      return category;
    }),
  };
}

function toConfigurationDraft(configuration: ReadingConfiguration): ReadingConfigurationDraft {
  return {
    id: configuration.id,
    measure: configuration.measure,
    startsOn: configuration.startsOn,
    categories: configuration.categories.map((category) => ({ ...category })),
  };
}

function findConfigurationForDate(configurations: ReadingConfiguration[], date: string): ReadingConfiguration | undefined {
  if (configurations.length === 0) return undefined;
  const sorted = [...configurations].sort(compareConfigurationDates);
  return sorted.filter((configuration) => configuration.startsOn <= date).at(-1) ?? sorted[0];
}

function compareConfigurationDates(left: ReadingConfiguration, right: ReadingConfiguration): number {
  return left.startsOn.localeCompare(right.startsOn);
}

function aggregateLogsByDate(
  logs: ReadingLog[],
  configurations: ReadingConfiguration[],
  draft: ReadingConfigurationDraft,
) {
  const grouped = new Map<string, { amount: number; configurationId: string; measure: ReadingMeasure }>();
  for (const log of logs) {
    const current = grouped.get(log.date);
    grouped.set(log.date, {
      amount: (current?.amount ?? 0) + log.amount,
      configurationId: current?.configurationId ?? log.configurationId,
      measure: current?.measure ?? log.measure,
    });
  }

  const totals = new Map<string, { amount: number; measure: ReadingMeasure; categoryLabel: string; color: string }>();
  for (const [date, total] of grouped) {
    const configuration = configurations.find((entry) => entry.id === total.configurationId) ??
      (draft.id === total.configurationId ? draft : null);
    if (!configuration) continue;
    const category = findCategory(configuration.categories, total.amount);
    if (!category) continue;
    totals.set(date, {
      amount: total.amount,
      measure: total.measure,
      categoryLabel: formatCategory(category, configuration.measure),
      color: category.color,
    });
  }
  return totals;
}

function findCategory(categories: ReadingCategory[], amount: number): ReadingCategory | undefined {
  return categories.find((category) => amount >= category.minimum && (category.maximum === null || amount <= category.maximum));
}

function formatCategory(category: ReadingCategory, measure: ReadingMeasure): string {
  const range = category.maximum === null
    ? `${category.minimum}+`
    : `${category.minimum}–${category.maximum}`;
  return `${range} ${measure}`;
}

function areCategoriesValid(categories: ReadingCategory[]): boolean {
  if (categories.length === 0 || categories[0].minimum !== 1 || categories.at(-1)?.maximum !== null) return false;
  return categories.every((category, index) => {
    const expectedMinimum = index === 0 ? 1 : (categories[index - 1].maximum ?? 0) + 1;
    if (category.position !== index || category.minimum !== expectedMinimum) return false;
    if (index === categories.length - 1) return category.maximum === null;
    return category.maximum !== null && Number.isInteger(category.maximum) && category.maximum >= category.minimum;
  });
}

function daysInMonth(year: number, zeroBasedMonth: number): number {
  return new Date(year, zeroBasedMonth + 1, 0).getDate();
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function starsForRating(rating: number): string {
  const wholeStars = Math.floor(rating);
  return `${'★'.repeat(wholeStars)}${rating % 1 === 0.5 ? '½' : ''}`;
}

const styles = StyleSheet.create({
  container: { marginTop: 30 },
  pageTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 30 },
  pageIntro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  sectionPanel: { backgroundColor: '#FFFCF2', borderColor: colors.line, borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 18 },
  sectionTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21 },
  currentBookTitle: { color: colors.olive, fontFamily: 'Georgia', fontSize: 18, marginTop: 12 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 15 },
  buttonRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  choiceButton: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  selectedChoice: { backgroundColor: '#E9E8DA', borderColor: colors.olive },
  choiceText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  selectedChoiceText: { color: colors.ink },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 11, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  categoryRows: { gap: 9, marginTop: 2 },
  categoryRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingBottom: 9 },
  categoryCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  categoryLabel: { color: colors.ink, fontSize: 13, minWidth: 90 },
  limitInput: { backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 8, borderWidth: 1, color: colors.ink, minHeight: 38, paddingHorizontal: 8, textAlign: 'center', width: 62 },
  openRange: { color: colors.muted, fontSize: 12 },
  disabledInput: { opacity: 0.55 },
  swatches: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  swatch: { borderColor: colors.line, borderRadius: 10, borderWidth: 1, height: 20, width: 20 },
  selectedSwatch: { borderColor: colors.ink, borderWidth: 2 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 11, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.panel, fontSize: 13, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
  helpText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  dateActionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateInput: { flex: 1, minWidth: 140 },
  bookChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  saveLogButton: { alignSelf: 'flex-start', marginTop: 14 },
  finishPanel: { backgroundColor: colors.paper, borderRadius: 14, marginTop: 14, padding: 14 },
  ratingChoice: { alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 42, minWidth: 42, paddingHorizontal: 6 },
  ratingText: { color: '#806C3E', fontSize: 13 },
  finishButton: { alignSelf: 'flex-start', marginTop: 14 },
  cancelFinishButton: { alignSelf: 'flex-start', marginTop: 8, minHeight: 38, justifyContent: 'center', paddingHorizontal: 8 },
  cancelButton: { alignSelf: 'flex-start', marginTop: 8, minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  message: { color: colors.error, fontSize: 13, lineHeight: 19, marginTop: 10 },
  loader: { marginVertical: 16 },
  yearHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  yearButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 12, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  yearButtonText: { color: colors.ink, fontSize: 25, lineHeight: 28 },
  calendar: { alignSelf: 'flex-start', borderColor: colors.line, borderRadius: 10, borderWidth: 1, maxWidth: '100%', overflow: 'hidden', paddingBottom: 6, paddingHorizontal: 4, paddingTop: 5 },
  calendarRow: { alignItems: 'center', flexDirection: 'row', height: 22 },
  dayNumberCell: { color: colors.muted, fontSize: 9, textAlign: 'right', width: 19 },
  monthHeader: { color: colors.ink, fontSize: 9, textAlign: 'center', width: 23 },
  calendarDay: { alignItems: 'center', height: 21, justifyContent: 'center', width: 23 },
  calendarHeart: { color: '#D6D1C2', fontSize: 13, lineHeight: 16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  legendSwatch: { borderColor: colors.line, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, height: 11, width: 11 },
  legendLabel: { color: colors.muted, fontSize: 10 },
  logRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 9 },
  logText: { color: colors.ink, flex: 1, fontSize: 13, lineHeight: 18 },
  smallAction: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 44 },
});
