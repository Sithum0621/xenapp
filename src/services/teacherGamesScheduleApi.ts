import type {
  GamesScheduleEvent,
  GamesScheduleEventDetail,
  GamesScheduleEventQuestion,
  GamesScheduleEventsPage,
  GamesScheduleQuizConfig,
  GamesScheduleSubject,
} from '@/src/services/superadminGamesScheduleApi';
import { GAMES_SCHEDULE_RECENT_LIMIT } from '@/src/services/superadminGamesScheduleApi';
import { supabase } from '@/src/services/supabaseClient';

export type {
  GamesScheduleEvent,
  GamesScheduleEventDetail,
  GamesScheduleEventQuestion,
  GamesScheduleEventsPage,
  GamesScheduleQuizConfig,
  GamesScheduleSubject,
};

export { GAMES_SCHEDULE_RECENT_LIMIT };

export async function fetchGamesScheduleSubjects(): Promise<{
  subjects: GamesScheduleSubject[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('teacher_list_games_schedule_subjects');
  if (error) return { subjects: [], error: error.message };
  if (!Array.isArray(data)) return { subjects: [], error: 'invalid_subjects_response' };
  const subjects = data
    .map((row) => {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
      const r = row as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
      return {
        id: r.id,
        name: r.name,
        created_at: typeof r.created_at === 'string' ? r.created_at : '',
      } satisfies GamesScheduleSubject;
    })
    .filter((s): s is GamesScheduleSubject => s !== null);
  return { subjects, error: null };
}

export async function createGamesScheduleSubject(name: string): Promise<{
  subject: GamesScheduleSubject | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('teacher_create_games_schedule_subject', {
    p_name: name.trim(),
  });
  if (error) return { subject: null, error: error.message };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { subject: null, error: 'invalid_subject_response' };
  }
  const r = data as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') {
    return { subject: null, error: 'invalid_subject_response' };
  }
  return {
    subject: {
      id: r.id,
      name: r.name,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
    },
    error: null,
  };
}

export async function fetchGamesScheduleEvents(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ page: GamesScheduleEventsPage | null; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_list_games_schedule_events', {
    p_filters: {
      search: filters.search?.trim() ?? '',
      limit: filters.limit ?? GAMES_SCHEDULE_RECENT_LIMIT,
      offset: filters.offset ?? 0,
    },
  });
  if (error) return { page: null, error: error.message };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { page: null, error: 'invalid_events_response' };
  }
  const row = data as Record<string, unknown>;
  const total =
    typeof row.total === 'number'
      ? row.total
      : typeof row.total === 'string'
        ? Number(row.total)
        : 0;
  const rawEvents = row.events;
  if (!Array.isArray(rawEvents)) return { page: null, error: 'invalid_events_response' };

  const events = rawEvents
    .map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
      const r = item as Record<string, unknown>;
      if (
        typeof r.id !== 'string' ||
        typeof r.subject_id !== 'string' ||
        typeof r.subject_name !== 'string' ||
        typeof r.title !== 'string' ||
        typeof r.event_at !== 'string'
      ) {
        return null;
      }
      const weekStarts =
        typeof r.week_starts_on === 'string' ? r.week_starts_on.slice(0, 10) : '';
      const weekEnds = typeof r.week_ends_on === 'string' ? r.week_ends_on.slice(0, 10) : weekStarts;
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
        week_starts_on: weekStarts || r.event_at.slice(0, 10),
        week_ends_on: weekEnds,
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
      } satisfies GamesScheduleEvent;
    })
    .filter((e): e is GamesScheduleEvent => e !== null);

  return { page: { events, total: Number.isFinite(total) ? total : events.length }, error: null };
}

export async function fetchRecentGamesScheduleEvents(): Promise<{
  page: GamesScheduleEventsPage | null;
  error: string | null;
}> {
  return fetchGamesScheduleEvents({ limit: GAMES_SCHEDULE_RECENT_LIMIT, offset: 0, search: '' });
}

export async function createGamesScheduleEvent(payload: {
  subject_id: string;
  title: string;
  week_starts_on: string;
  notes?: string | null;
  target_group_source: 'institute' | 'personal';
  target_group_id: string;
}): Promise<{ event: GamesScheduleEvent | null; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_create_games_schedule_event', {
    p_payload: {
      subject_id: payload.subject_id,
      title: payload.title.trim(),
      week_starts_on: payload.week_starts_on.trim(),
      notes: payload.notes?.trim() || null,
      target_group_source: payload.target_group_source,
      target_group_id: payload.target_group_id,
    },
  });
  if (error) return { event: null, error: error.message };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { event: null, error: 'invalid_event_response' };
  }
  const r = data as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.subject_id !== 'string' ||
    typeof r.subject_name !== 'string' ||
    typeof r.title !== 'string' ||
    typeof r.event_at !== 'string'
  ) {
    return { event: null, error: 'invalid_event_response' };
  }
  const weekStarts =
    typeof r.week_starts_on === 'string' ? r.week_starts_on.slice(0, 10) : r.event_at.slice(0, 10);
  const weekEnds = typeof r.week_ends_on === 'string' ? r.week_ends_on.slice(0, 10) : weekStarts;
  return {
    event: {
      id: r.id,
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      title: r.title,
      event_at: r.event_at,
      week_starts_on: weekStarts,
      week_ends_on: weekEnds,
      is_active: r.is_active !== false,
      notes: typeof r.notes === 'string' ? r.notes : null,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      quiz_question_count: null,
      quiz_choice_count: null,
      quiz_time_limit_minutes: null,
    },
    error: null,
  };
}

export async function setGamesScheduleEventActive(
  eventId: string,
  isActive: boolean,
): Promise<{ event: GamesScheduleEvent | null; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_set_games_schedule_event_active', {
    p_payload: { event_id: eventId, is_active: isActive },
  });
  if (error) return { event: null, error: error.message };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { event: null, error: 'invalid_event_response' };
  }
  const r = data as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.subject_id !== 'string' ||
    typeof r.subject_name !== 'string' ||
    typeof r.title !== 'string' ||
    typeof r.event_at !== 'string'
  ) {
    return { event: null, error: 'invalid_event_response' };
  }
  const weekStarts =
    typeof r.week_starts_on === 'string' ? r.week_starts_on.slice(0, 10) : r.event_at.slice(0, 10);
  const weekEnds = typeof r.week_ends_on === 'string' ? r.week_ends_on.slice(0, 10) : weekStarts;
  return {
    event: {
      id: r.id,
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      title: r.title,
      event_at: r.event_at,
      week_starts_on: weekStarts,
      week_ends_on: weekEnds,
      is_active: r.is_active !== false,
      notes: typeof r.notes === 'string' ? r.notes : null,
      created_at: typeof r.created_at === 'string' ? r.created_at : '',
      quiz_question_count: null,
      quiz_choice_count: null,
      quiz_time_limit_minutes: null,
    },
    error: null,
  };
}

export async function fetchGamesScheduleEventDetail(
  eventId: string,
): Promise<{ detail: GamesScheduleEventDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc('teacher_get_games_schedule_event', {
    p_event_id: eventId,
  });
  if (error) return { detail: null, error: error.message };
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { detail: null, error: 'invalid_event_detail_response' };
  }
  const row = data as Record<string, unknown>;
  const eventRaw = row.event;
  if (eventRaw === null || typeof eventRaw !== 'object' || Array.isArray(eventRaw)) {
    return { detail: null, error: 'invalid_event_detail_response' };
  }
  const er = eventRaw as Record<string, unknown>;
  if (
    typeof er.id !== 'string' ||
    typeof er.subject_id !== 'string' ||
    typeof er.subject_name !== 'string' ||
    typeof er.title !== 'string' ||
    typeof er.event_at !== 'string'
  ) {
    return { detail: null, error: 'invalid_event_detail_response' };
  }
  const weekStarts =
    typeof er.week_starts_on === 'string' ? er.week_starts_on.slice(0, 10) : er.event_at.slice(0, 10);
  const weekEnds = typeof er.week_ends_on === 'string' ? er.week_ends_on.slice(0, 10) : weekStarts;
  const parseOptionalInt = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const event: GamesScheduleEvent = {
    id: er.id,
    subject_id: er.subject_id,
    subject_name: er.subject_name,
    title: er.title,
    event_at: er.event_at,
    week_starts_on: weekStarts,
    week_ends_on: weekEnds,
    is_active: er.is_active !== false,
    notes: typeof er.notes === 'string' ? er.notes : null,
    created_at: typeof er.created_at === 'string' ? er.created_at : '',
    quiz_question_count: parseOptionalInt(er.quiz_question_count),
    quiz_choice_count: parseOptionalInt(er.quiz_choice_count),
    quiz_time_limit_minutes: parseOptionalInt(er.quiz_time_limit_minutes),
  };
  const rawQuestions = row.questions;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions
        .map((q) => {
          if (q === null || typeof q !== 'object' || Array.isArray(q)) return null;
          const qr = q as Record<string, unknown>;
          if (typeof qr.id !== 'string' || typeof qr.question !== 'string') return null;
          const choices = Array.isArray(qr.choices)
            ? qr.choices.filter((c): c is string => typeof c === 'string')
            : [];
          return {
            id: qr.id,
            question: qr.question,
            choices,
            correct_choice_index: Number(qr.correct_choice_index) || 0,
            sort_order: Number(qr.sort_order) || 0,
          } satisfies GamesScheduleEventQuestion;
        })
        .filter((q): q is GamesScheduleEventQuestion => q !== null)
    : [];
  const quiz =
    event.quiz_question_count !== null &&
    event.quiz_choice_count !== null &&
    event.quiz_time_limit_minutes !== null
      ? {
          question_count: event.quiz_question_count,
          choice_count: event.quiz_choice_count,
          time_limit_minutes: event.quiz_time_limit_minutes,
        }
      : null;
  return { detail: { event, questions, quiz }, error: null };
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
  const { data, error } = await supabase.rpc('teacher_save_games_schedule_event_questions', {
    p_payload: { event_id: eventId, quiz, questions },
  });
  if (error) return { questions: [], quiz: null, error: error.message };

  let savedQuestions: GamesScheduleEventQuestion[] = [];
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    const raw = row.questions;
    if (Array.isArray(raw)) {
      savedQuestions = raw
        .map((q) => {
          if (q === null || typeof q !== 'object' || Array.isArray(q)) return null;
          const qr = q as Record<string, unknown>;
          if (typeof qr.id !== 'string' || typeof qr.question !== 'string') return null;
          return {
            id: qr.id,
            question: qr.question,
            choices: Array.isArray(qr.choices)
              ? qr.choices.filter((c): c is string => typeof c === 'string')
              : [],
            correct_choice_index: Number(qr.correct_choice_index) || 0,
            sort_order: Number(qr.sort_order) || 0,
          } satisfies GamesScheduleEventQuestion;
        })
        .filter((q): q is GamesScheduleEventQuestion => q !== null);
    }
  }

  return { questions: savedQuestions, quiz, error: null };
}
