import { supabase } from '@/src/services/supabaseClient';

export type GamesScheduleSubject = {
  id: string;
  name: string;
  created_at: string;
};

export type GamesScheduleQuizConfig = {
  question_count: number;
  choice_count: number;
  time_limit_minutes: number;
};

export type GamesScheduleEvent = {
  id: string;
  subject_id: string;
  subject_name: string;
  title: string;
  event_at: string;
  week_starts_on: string;
  week_ends_on: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  quiz_question_count: number | null;
  quiz_choice_count: number | null;
  quiz_time_limit_minutes: number | null;
  target_group_source?: 'institute' | 'personal' | null;
  target_group_id?: string | null;
};

export type GamesScheduleEventsPage = {
  events: GamesScheduleEvent[];
  total: number;
};

export type GamesScheduleEventQuestion = {
  id: string;
  question: string;
  choices: string[];
  correct_choice_index: number;
  sort_order: number;
};

export type GamesScheduleEventDetail = {
  event: GamesScheduleEvent;
  questions: GamesScheduleEventQuestion[];
  quiz: GamesScheduleQuizConfig | null;
};

const RECENT_EVENTS_LIMIT = 10;

function parseSubject(row: unknown): GamesScheduleSubject | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  return {
    id: r.id,
    name: r.name,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  };
}

function parseDateField(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

function parseEvent(row: unknown): GamesScheduleEvent | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.subject_id !== 'string' ||
    typeof r.subject_name !== 'string' ||
    typeof r.title !== 'string' ||
    typeof r.event_at !== 'string'
  ) {
    return null;
  }

  const weekStarts = parseDateField(r.week_starts_on);
  const weekEnds = parseDateField(r.week_ends_on);

  const parseOptionalInt = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  return {
    id: r.id,
    subject_id: r.subject_id,
    subject_name: r.subject_name,
    title: r.title,
    event_at: r.event_at,
    week_starts_on: weekStarts || parseDateField(r.event_at),
    week_ends_on: weekEnds || weekStarts,
    is_active: r.is_active !== false,
    notes: typeof r.notes === 'string' ? r.notes : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    quiz_question_count: parseOptionalInt(r.quiz_question_count),
    quiz_choice_count: parseOptionalInt(r.quiz_choice_count),
    quiz_time_limit_minutes: parseOptionalInt(r.quiz_time_limit_minutes),
    target_group_source:
      r.target_group_source === 'personal' || r.target_group_source === 'institute'
        ? r.target_group_source
        : null,
    target_group_id: typeof r.target_group_id === 'string' ? r.target_group_id : null,
  };
}

function parseQuizConfig(event: GamesScheduleEvent): GamesScheduleQuizConfig | null {
  if (
    event.quiz_question_count === null ||
    event.quiz_choice_count === null ||
    event.quiz_time_limit_minutes === null
  ) {
    return null;
  }
  return {
    question_count: event.quiz_question_count,
    choice_count: event.quiz_choice_count,
    time_limit_minutes: event.quiz_time_limit_minutes,
  };
}

function parseQuestion(row: unknown): GamesScheduleEventQuestion | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.question !== 'string') {
    return null;
  }
  const sortOrder =
    typeof r.sort_order === 'number'
      ? r.sort_order
      : typeof r.sort_order === 'string'
        ? Number(r.sort_order)
        : 0;
  const correctChoiceIndex =
    typeof r.correct_choice_index === 'number'
      ? r.correct_choice_index
      : typeof r.correct_choice_index === 'string'
        ? Number(r.correct_choice_index)
        : 0;
  let choices: string[] = [];
  if (Array.isArray(r.choices)) {
    choices = r.choices.filter((c): c is string => typeof c === 'string');
  }
  return {
    id: r.id,
    question: r.question,
    choices,
    correct_choice_index: Number.isFinite(correctChoiceIndex) ? correctChoiceIndex : 0,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

function parseEventDetail(data: unknown): GamesScheduleEventDetail | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const event = parseEvent(row.event);
  if (!event) return null;
  const rawQuestions = row.questions;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions.map(parseQuestion).filter((q): q is GamesScheduleEventQuestion => q !== null)
    : [];
  return { event, questions, quiz: parseQuizConfig(event) };
}

function parseQuestionsList(data: unknown): GamesScheduleEventQuestion[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  const row = data as Record<string, unknown>;
  const raw = row.questions;
  if (!Array.isArray(raw)) return [];
  return raw.map(parseQuestion).filter((q): q is GamesScheduleEventQuestion => q !== null);
}

function parseEventsPage(data: unknown): GamesScheduleEventsPage | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const total =
    typeof row.total === 'number'
      ? row.total
      : typeof row.total === 'string'
        ? Number(row.total)
        : 0;
  const rawEvents = row.events;
  if (!Array.isArray(rawEvents)) return null;
  const events = rawEvents.map(parseEvent).filter((e): e is GamesScheduleEvent => e !== null);
  return { events, total: Number.isFinite(total) ? total : events.length };
}

export async function fetchGamesScheduleSubjects(): Promise<{
  subjects: GamesScheduleSubject[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('superadmin_list_games_schedule_subjects');
  if (error) return { subjects: [], error: error.message };
  if (!Array.isArray(data)) return { subjects: [], error: 'invalid_subjects_response' };
  const subjects = data.map(parseSubject).filter((s): s is GamesScheduleSubject => s !== null);
  return { subjects, error: null };
}

export async function createGamesScheduleSubject(name: string): Promise<{
  subject: GamesScheduleSubject | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('superadmin_create_games_schedule_subject', {
    p_name: name.trim(),
  });
  if (error) return { subject: null, error: error.message };
  const subject = parseSubject(data);
  if (!subject) return { subject: null, error: 'invalid_subject_response' };
  return { subject, error: null };
}

export async function fetchGamesScheduleEvents(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ page: GamesScheduleEventsPage | null; error: string | null }> {
  const { data, error } = await supabase.rpc('superadmin_list_games_schedule_events', {
    p_filters: {
      search: filters.search?.trim() ?? '',
      limit: filters.limit ?? RECENT_EVENTS_LIMIT,
      offset: filters.offset ?? 0,
    },
  });
  if (error) return { page: null, error: error.message };
  const page = parseEventsPage(data);
  if (!page) return { page: null, error: 'invalid_events_response' };
  return { page, error: null };
}

export async function fetchRecentGamesScheduleEvents(): Promise<{
  page: GamesScheduleEventsPage | null;
  error: string | null;
}> {
  return fetchGamesScheduleEvents({ limit: RECENT_EVENTS_LIMIT, offset: 0, search: '' });
}

export const GAMES_SCHEDULE_RECENT_LIMIT = RECENT_EVENTS_LIMIT;

export async function createGamesScheduleEvent(payload: {
  subject_id: string;
  title: string;
  week_starts_on: string;
  notes?: string | null;
}): Promise<{ event: GamesScheduleEvent | null; error: string | null }> {
  const { data, error } = await supabase.rpc('superadmin_create_games_schedule_event', {
    p_payload: {
      subject_id: payload.subject_id,
      title: payload.title.trim(),
      week_starts_on: payload.week_starts_on.trim(),
      notes: payload.notes?.trim() || null,
    },
  });
  if (error) return { event: null, error: error.message };
  const event = parseEvent(data);
  if (!event) return { event: null, error: 'invalid_event_response' };
  return { event, error: null };
}

export async function setGamesScheduleEventActive(
  eventId: string,
  isActive: boolean,
): Promise<{ event: GamesScheduleEvent | null; error: string | null }> {
  const { data, error } = await supabase.rpc('superadmin_set_games_schedule_event_active', {
    p_payload: {
      event_id: eventId,
      is_active: isActive,
    },
  });
  if (error) return { event: null, error: error.message };
  const event = parseEvent(data);
  if (!event) return { event: null, error: 'invalid_event_response' };
  return { event, error: null };
}

export async function fetchGamesScheduleEventDetail(
  eventId: string,
): Promise<{ detail: GamesScheduleEventDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc('superadmin_get_games_schedule_event', {
    p_event_id: eventId,
  });
  if (error) return { detail: null, error: error.message };
  const detail = parseEventDetail(data);
  if (!detail) return { detail: null, error: 'invalid_event_detail_response' };
  return { detail, error: null };
}

export async function saveGamesScheduleEventQuiz(
  eventId: string,
  quiz: GamesScheduleQuizConfig,
  questions: {
    question: string;
    choices: string[];
    correct_choice_index: number;
    sort_order: number;
  }[],
): Promise<{
  questions: GamesScheduleEventQuestion[];
  quiz: GamesScheduleQuizConfig | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('superadmin_save_games_schedule_event_questions', {
    p_payload: {
      event_id: eventId,
      quiz,
      questions,
    },
  });
  if (error) return { questions: [], quiz: null, error: error.message };

  const savedQuestions = parseQuestionsList(data);
  let savedQuiz: GamesScheduleQuizConfig | null = null;
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    const rawQuiz = row.quiz;
    if (rawQuiz !== null && typeof rawQuiz === 'object' && !Array.isArray(rawQuiz)) {
      const q = rawQuiz as Record<string, unknown>;
      const question_count = Number(q.question_count);
      const choice_count = Number(q.choice_count);
      const time_limit_minutes = Number(q.time_limit_minutes);
      if (
        Number.isFinite(question_count) &&
        Number.isFinite(choice_count) &&
        Number.isFinite(time_limit_minutes)
      ) {
        savedQuiz = { question_count, choice_count, time_limit_minutes };
      }
    }
  }

  return { questions: savedQuestions, quiz: savedQuiz ?? quiz, error: null };
}

/** @deprecated Use saveGamesScheduleEventQuiz */
export const saveGamesScheduleEventQuestions = saveGamesScheduleEventQuiz;
