import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { appHref, hrefSuperAdminGamesScheduleEvent } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  createGamesScheduleEvent,
  createGamesScheduleSubject,
  fetchGamesScheduleEvents,
  fetchGamesScheduleSubjects,
  fetchRecentGamesScheduleEvents,
  setGamesScheduleEventActive,
  type GamesScheduleEvent,
  type GamesScheduleSubject,
} from '@/src/services/superadminGamesScheduleApi';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const PANEL_BG = '#F8FAFC';

type Props = {
  desktopShell?: boolean;
};

function isValidWeekStart(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

function mapSubjectError(message: string, t: (key: string) => string): string {
  const m = message.toLowerCase();
  if (m.includes('subject_name_required')) return t('superAdmin.gamesScheduleSubjectNameRequired');
  if (m.includes('subject_name_exists')) return t('superAdmin.gamesScheduleSubjectNameExists');
  return message;
}

function mapEventError(message: string, t: (key: string) => string): string {
  const m = message.toLowerCase();
  if (m.includes('event_title_required')) return t('superAdmin.gamesScheduleEventTitleRequired');
  if (m.includes('invalid_subject')) return t('superAdmin.gamesScheduleSubjectRequired');
  if (m.includes('invalid_week_start') || m.includes('invalid_event_at')) {
    return t('superAdmin.gamesScheduleEventDateInvalid');
  }
  return message;
}

function mergeEventInList(
  list: GamesScheduleEvent[],
  updated: GamesScheduleEvent,
): GamesScheduleEvent[] {
  return list.map((e) => (e.id === updated.id ? updated : e));
}

type EventRowProps = {
  event: GamesScheduleEvent;
  busy: boolean;
  formatWeekRange: (start: string, end: string) => string;
  onOpen: (event: GamesScheduleEvent) => void;
  onToggleActive: (event: GamesScheduleEvent, next: boolean) => void;
  t: (key: string) => string;
};

function EventRow({ event, busy, formatWeekRange, onOpen, onToggleActive, t }: EventRowProps) {
  return (
    <View style={[styles.eventRow, !event.is_active && styles.eventRowInactive]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('superAdmin.gamesScheduleEventOpenEditor')}
        onPress={() => onOpen(event)}
        style={({ pressed }) => [
          styles.eventRowMain,
          pressed && styles.eventRowMainPressed,
          Platform.OS === 'web' ? styles.eventRowMainWeb : null,
        ]}>
        <View style={styles.eventRowTextCol}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.eventMeta}>
            {event.subject_name} · {formatWeekRange(event.week_starts_on, event.week_ends_on)}
          </Text>
          {event.notes?.trim() ? (
            <Text style={styles.eventNotes} numberOfLines={2}>
              {event.notes}
            </Text>
          ) : null}
          {!event.is_active ? (
            <Text style={styles.eventInactiveBadge}>{t('superAdmin.gamesScheduleEventInactive')}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} style={styles.eventRowChevron} />
      </Pressable>
      <View style={styles.eventActiveWrap}>
        <Text style={styles.eventActiveLabel}>{t('superAdmin.gamesScheduleEventActive')}</Text>
        <Switch
          accessibilityLabel={t('superAdmin.gamesScheduleEventActive')}
          value={event.is_active}
          disabled={busy}
          onValueChange={(next) => onToggleActive(event, next)}
        />
      </View>
    </View>
  );
}

export default function SuperAdminGamesScheduleSection({ desktopShell }: Props) {
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<GamesScheduleSubject[]>([]);
  const [recentEvents, setRecentEvents] = useState<GamesScheduleEvent[]>([]);

  const [eventSearch, setEventSearch] = useState('');
  const [debouncedEventSearch, setDebouncedEventSearch] = useState('');
  const [searchEvents, setSearchEvents] = useState<GamesScheduleEvent[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [showNewSubjectForm, setShowNewSubjectForm] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [subjectSubmitting, setSubjectSubmitting] = useState(false);

  const [eventTitle, setEventTitle] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const searchSeqRef = useRef(0);

  const formatWeekRange = useCallback(
    (start: string, end: string) => {
      try {
        const startLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          new Date(`${start}T12:00:00`),
        );
        const endLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
          new Date(`${end}T12:00:00`),
        );
        return t('superAdmin.gamesScheduleWeekRange', { start: startLabel, end: endLabel });
      } catch {
        return `${start} – ${end}`;
      }
    },
    [i18n.language, t],
  );

  const loadRecent = useCallback(async () => {
    const { page, error } = await fetchRecentGamesScheduleEvents();
    if (error) return { error };
    setRecentEvents(page?.events ?? []);
    return { error: null };
  }, []);

  const loadSubjects = useCallback(async () => {
    const { subjects: rows, error } = await fetchGamesScheduleSubjects();
    if (error) return { error, subjects: [] as GamesScheduleSubject[] };
    setSubjects(rows);
    setSelectedSubjectId((prev) => {
      if (prev && rows.some((s) => s.id === prev)) return prev;
      return rows[0]?.id ?? null;
    });
    return { error: null, subjects: rows };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const [subjectsRes, recentRes] = await Promise.all([loadSubjects(), loadRecent()]);

    setLoading(false);

    if (subjectsRes.error) {
      setErrorMessage(subjectsRes.error);
      return;
    }
    if (recentRes.error) {
      setErrorMessage(recentRes.error);
    }
  }, [loadSubjects, loadRecent]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEventSearch(eventSearch.trim()), 400);
    return () => clearTimeout(timer);
  }, [eventSearch]);

  useEffect(() => {
    if (!debouncedEventSearch) {
      setSearchEvents([]);
      setSearchTotal(0);
      setSearchLoading(false);
      return;
    }

    searchSeqRef.current += 1;
    const seq = searchSeqRef.current;
    setSearchLoading(true);

    void (async () => {
      const { page, error } = await fetchGamesScheduleEvents({
        search: debouncedEventSearch,
        limit: 50,
        offset: 0,
      });

      if (seq !== searchSeqRef.current) return;

      setSearchLoading(false);
      if (error) {
        setErrorMessage(error);
        return;
      }
      setSearchEvents(page?.events ?? []);
      setSearchTotal(page?.total ?? 0);
    })();
  }, [debouncedEventSearch]);

  const patchEventInLists = useCallback((updated: GamesScheduleEvent) => {
    setRecentEvents((prev) => mergeEventInList(prev, updated));
    setSearchEvents((prev) => mergeEventInList(prev, updated));
  }, []);

  const toggleEventActive = async (event: GamesScheduleEvent, nextActive: boolean) => {
    setBusyEventId(event.id);
    setErrorMessage(null);

    const { event: updated, error } = await setGamesScheduleEventActive(event.id, nextActive);

    setBusyEventId(null);

    if (error) {
      setErrorMessage(error);
      return;
    }

    if (updated) patchEventInLists(updated);
  };

  const submitNewSubject = async () => {
    const trimmed = newSubjectName.trim();
    if (!trimmed) {
      setErrorMessage(t('superAdmin.gamesScheduleSubjectNameRequired'));
      return;
    }

    setSubjectSubmitting(true);
    setErrorMessage(null);

    const { subject, error } = await createGamesScheduleSubject(trimmed);

    setSubjectSubmitting(false);

    if (error) {
      setErrorMessage(mapSubjectError(error, t));
      return;
    }

    if (subject) {
      setSubjects((prev) =>
        [...prev, subject].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      );
      setSelectedSubjectId(subject.id);
    }

    setNewSubjectName('');
    setShowNewSubjectForm(false);
  };

  const submitEvent = async () => {
    if (!selectedSubjectId) {
      setErrorMessage(t('superAdmin.gamesScheduleSubjectRequired'));
      return;
    }

    const trimmedTitle = eventTitle.trim();
    if (!trimmedTitle) {
      setErrorMessage(t('superAdmin.gamesScheduleEventTitleRequired'));
      return;
    }

    const startsOn = weekStartDate.trim();
    if (!isValidWeekStart(startsOn)) {
      setErrorMessage(t('superAdmin.gamesScheduleEventDateInvalid'));
      return;
    }

    setEventSubmitting(true);
    setErrorMessage(null);

    const { event, error } = await createGamesScheduleEvent({
      subject_id: selectedSubjectId,
      title: trimmedTitle,
      week_starts_on: startsOn,
      notes: eventNotes.trim() || null,
    });

    setEventSubmitting(false);

    if (error) {
      setErrorMessage(mapEventError(error, t));
      return;
    }

    await loadRecent();

    setEventTitle('');
    setWeekStartDate('');
    setEventNotes('');
    setShowAddEventForm(false);
  };

  const closeAddEventForm = () => {
    setShowAddEventForm(false);
    setErrorMessage(null);
  };

  const showSearchResults = debouncedEventSearch.length > 0;

  const openEventEditor = useCallback((event: GamesScheduleEvent) => {
    router.push(appHref(hrefSuperAdminGamesScheduleEvent(event.id)));
  }, []);

  const renderEventsList = (items: GamesScheduleEvent[], emptyLabel: string) => {
    if (items.length === 0) {
      return <Text style={styles.eventsEmpty}>{emptyLabel}</Text>;
    }
    return (
      <View style={styles.eventsList}>
        {items.map((event, index) => (
          <View key={event.id} style={index === items.length - 1 ? styles.eventRowWrapLast : styles.eventRowWrap}>
            <EventRow
              event={event}
              busy={busyEventId === event.id}
              formatWeekRange={formatWeekRange}
              onOpen={openEventEditor}
              onToggleActive={(ev, next) => void toggleEventActive(ev, next)}
              t={t}
            />
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, desktopShell && styles.scrollContentDesktop]}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>{t('superAdmin.gamesScheduleSubtitle')}</Text>

      <View style={styles.subjectsCard}>
        <View style={styles.formHeader}>
          <Text style={styles.sectionTitle}>{t('superAdmin.gamesScheduleSubjectsList')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.gamesScheduleAddSubject')}
            onPress={() => setShowNewSubjectForm((v) => !v)}
            style={({ pressed }) => [
              styles.addSubjectBtn,
              showNewSubjectForm && styles.addSubjectBtnActive,
              pressed && styles.addSubjectBtnPressed,
              Platform.OS === 'web' ? styles.addSubjectBtnWeb : null,
            ]}>
            <Ionicons
              name={showNewSubjectForm ? 'close-outline' : 'add-outline'}
              size={18}
              color={showNewSubjectForm ? '#FFFFFF' : BRAND_BLUE_DARK}
            />
            <Text
              style={[
                styles.addSubjectBtnLabel,
                showNewSubjectForm && styles.addSubjectBtnLabelActive,
              ]}>
              {t('superAdmin.gamesScheduleAddSubject')}
            </Text>
          </Pressable>
        </View>

        {showNewSubjectForm ? (
          <View style={styles.newSubjectForm}>
            <TextInput
              value={newSubjectName}
              onChangeText={setNewSubjectName}
              placeholder={t('superAdmin.gamesScheduleSubjectNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              style={[styles.input, styles.newSubjectInput]}
              autoFocus
            />
            <View style={styles.newSubjectActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('superAdmin.cancelAddInstitute')}
                onPress={() => {
                  setShowNewSubjectForm(false);
                  setNewSubjectName('');
                }}
                style={({ pressed }) => [styles.newSubjectCancel, pressed && { opacity: 0.7 }]}>
                <Text style={styles.newSubjectCancelLabel}>{t('superAdmin.cancelAddInstitute')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('superAdmin.gamesScheduleSaveSubject')}
                disabled={subjectSubmitting}
                onPress={() => void submitNewSubject()}
                style={({ pressed }) => [
                  styles.newSubjectSave,
                  pressed && styles.newSubjectSavePressed,
                  subjectSubmitting && styles.btnDisabled,
                ]}>
                {subjectSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.newSubjectSaveLabel}>
                    {t('superAdmin.gamesScheduleSaveSubject')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {subjects.length > 0 ? (
          <View style={styles.subjectsCatalog}>
            {subjects.map((subject) => (
              <View key={subject.id} style={styles.subjectCatalogChip}>
                <Text style={styles.subjectCatalogChipLabel}>{subject.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.subjectHint}>{t('superAdmin.gamesScheduleNoSubjectsYet')}</Text>
        )}
      </View>

      {!showAddEventForm ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('superAdmin.gamesScheduleAddEvent')}
          onPress={() => setShowAddEventForm(true)}
          style={({ pressed }) => [
            styles.addEventTriggerBtn,
            pressed && styles.addEventTriggerBtnPressed,
            Platform.OS === 'web' ? styles.addEventTriggerBtnWeb : null,
          ]}>
          <Ionicons name="add-circle-outline" size={22} color={BRAND_BLUE} />
          <Text style={styles.addEventTriggerLabel}>{t('superAdmin.gamesScheduleAddEvent')}</Text>
        </Pressable>
      ) : null}

      {showAddEventForm ? (
        <View style={styles.addEventCard}>
          <View style={styles.formHeader}>
            <Text style={styles.sectionTitle}>{t('superAdmin.gamesScheduleAddEvent')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('superAdmin.cancelAddInstitute')}
              onPress={closeAddEventForm}
              style={({ pressed }) => [styles.formCancelBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.formCancelLabel}>{t('superAdmin.cancelAddInstitute')}</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleEventTitleLabel')}</Text>
          <TextInput
            value={eventTitle}
            onChangeText={setEventTitle}
            placeholder={t('superAdmin.gamesScheduleEventTitlePlaceholder')}
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleWeekStartLabel')}</Text>
          <Text style={styles.fieldHint}>{t('superAdmin.gamesScheduleWeekStartHint')}</Text>
          <TextInput
            value={weekStartDate}
            onChangeText={setWeekStartDate}
            placeholder={t('superAdmin.gamesScheduleEventDatePlaceholder')}
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleNotesLabel')}</Text>
          <TextInput
            value={eventNotes}
            onChangeText={setEventNotes}
            placeholder={t('superAdmin.gamesScheduleNotesPlaceholder')}
            placeholderTextColor="#94A3B8"
            style={[styles.input, styles.inputMultiline]}
            multiline
          />

          <Text style={styles.fieldLabel}>{t('superAdmin.gamesScheduleSubjectLabel')}</Text>
          {subjects.length > 0 ? (
            <View style={styles.subjectsList}>
              {subjects.map((subject) => {
                const selected = selectedSubjectId === subject.id;
                return (
                  <Pressable
                    key={`pick-${subject.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedSubjectId(subject.id)}
                    style={({ pressed }) => [
                      styles.subjectListChip,
                      selected && styles.subjectListChipSelected,
                      pressed && !selected && styles.subjectListChipPressed,
                    ]}>
                    <View
                      style={[
                        styles.subjectListDot,
                        { backgroundColor: selected ? '#FFFFFF' : BRAND_BLUE },
                      ]}
                    />
                    <Text
                      style={[
                        styles.subjectListChipLabel,
                        selected && styles.subjectListChipLabelSelected,
                      ]}>
                      {subject.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.subjectHint}>{t('superAdmin.gamesScheduleAddSubjectFirst')}</Text>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('superAdmin.gamesScheduleSaveEvent')}
            disabled={eventSubmitting || loading}
            onPress={() => void submitEvent()}
            style={({ pressed }) => [
              styles.saveEventBtn,
              pressed && styles.saveEventBtnPressed,
              (eventSubmitting || loading) && styles.btnDisabled,
            ]}>
            {eventSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveEventBtnLabel}>{t('superAdmin.gamesScheduleSaveEvent')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
        </View>
      ) : (
        <View style={styles.eventsSection}>
          <TextInput
            value={eventSearch}
            onChangeText={setEventSearch}
            placeholder={t('superAdmin.gamesScheduleSearchPlaceholder')}
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            accessibilityLabel={t('superAdmin.gamesScheduleSearchPlaceholder')}
          />

          {showSearchResults ? (
            searchLoading ? (
              <View style={styles.searchLoadingWrap}>
                <ActivityIndicator color={BRAND_BLUE} />
              </View>
            ) : (
              <>
                {searchTotal > 0 ? (
                  <Text style={styles.searchResultsMeta}>
                    {t('superAdmin.gamesScheduleSearchResults', {
                      count: searchEvents.length,
                      total: searchTotal,
                    })}
                  </Text>
                ) : null}
                {renderEventsList(searchEvents, t('superAdmin.gamesScheduleSearchEmpty'))}
              </>
            )
          ) : (
            renderEventsList(recentEvents, t('superAdmin.gamesScheduleEventsEmpty'))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: PANEL_BG,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  scrollContentDesktop: {
    flexGrow: 1,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 16,
  },
  subjectsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    padding: 16,
    marginBottom: 14,
  },
  addEventTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  addEventTriggerBtnPressed: {
    opacity: 0.88,
  },
  addEventTriggerBtnWeb: {
    cursor: 'pointer',
  } as const,
  addEventTriggerLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  addEventCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    padding: 16,
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 0,
    flex: 1,
  },
  formCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  formCancelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginBottom: 6,
    marginTop: -2,
  },
  input: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    minHeight: 44,
    marginBottom: 4,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  subjectsCatalog: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  subjectCatalogChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  subjectCatalogChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  addSubjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BRAND_BLUE,
    backgroundColor: '#EFF6FF',
  },
  addSubjectBtnActive: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  addSubjectBtnPressed: {
    opacity: 0.88,
  },
  addSubjectBtnWeb: {
    cursor: 'pointer',
  } as const,
  addSubjectBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  addSubjectBtnLabelActive: {
    color: '#FFFFFF',
  },
  subjectHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 10,
  },
  newSubjectForm: {
    marginTop: 4,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  newSubjectInput: {
    marginBottom: 0,
  },
  newSubjectActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  newSubjectCancel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  newSubjectCancelLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  newSubjectSave: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: BRAND_BLUE,
    minWidth: 88,
    alignItems: 'center',
  },
  newSubjectSavePressed: {
    opacity: 0.88,
  },
  newSubjectSaveLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subjectsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  subjectListChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  subjectListChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: BRAND_BLUE,
  },
  subjectListChipPressed: {
    opacity: 0.88,
  },
  subjectListDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subjectListChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
  },
  subjectListChipLabelSelected: {
    color: '#FFFFFF',
  },
  saveEventBtn: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveEventBtnPressed: {
    backgroundColor: BRAND_BLUE_DARK,
  },
  saveEventBtnLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  errorBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  eventsSection: {
    marginBottom: 24,
  },
  eventsEmpty: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  eventsList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
    overflow: 'hidden',
  },
  eventRowWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  eventRowWrapLast: {
    borderBottomWidth: 0,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: PAGE_BG,
  },
  eventRowInactive: {
    backgroundColor: '#F8FAFC',
  },
  eventRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventRowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eventRowMainPressed: {
    opacity: 0.88,
  },
  eventRowMainWeb: {
    cursor: 'pointer',
  } as const,
  eventRowChevron: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  eventMeta: {
    fontSize: 13,
    color: TEXT_MUTED,
  },
  eventNotes: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  eventInactiveBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
    marginTop: 2,
  },
  eventActiveWrap: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  eventActiveLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: PAGE_BG,
    minHeight: 44,
    marginBottom: 12,
  },
  searchLoadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  searchResultsMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 8,
  },
});
