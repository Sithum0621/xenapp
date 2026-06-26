import { supabase } from '@/src/services/supabaseClient';

export type StudentGamesScheduleEvent = {
  id: string;
  subject_name: string;
  title: string;
  week_starts_on: string;
  week_ends_on: string;
  notes: string | null;
  quiz_question_count: number | null;
  quiz_choice_count: number | null;
  quiz_time_limit_minutes: number | null;
};

export type StudentGamesScheduleQuizConfig = {
  question_count: number;
  choice_count: number;
  time_limit_minutes: number;
};

export type StudentGamesScheduleQuestion = {
  id: string;
  question: string;
  choices: string[];
  sort_order: number;
};

export type StudentGamesScheduleEventDetail = {
  event: StudentGamesScheduleEvent;
  questions: StudentGamesScheduleQuestion[];
  quiz: StudentGamesScheduleQuizConfig | null;
  attempt: StudentGamesScheduleAttempt;
};

export type StudentGamesScheduleChoiceResult = {
  is_correct: boolean;
  correct_choice_index: number;
  correct_choice_text: string;
  attempt?: StudentGamesScheduleAttempt;
};

export type StudentGamesScheduleAttemptAnswer = {
  question_id: string;
  choice_index: number;
  is_correct: boolean;
};

export type StudentGamesScheduleAttempt = {
  status: 'none' | 'in_progress' | 'completed';
  attempt_id: string | null;
  deadline_at: string | null;
  remaining_seconds: number;
  score: number;
  total_questions: number;
  completed_at: string | null;
  completion_reason: 'time_up' | 'all_answered' | null;
  answers: StudentGamesScheduleAttemptAnswer[];
};

const EMPTY_ATTEMPT: StudentGamesScheduleAttempt = {
  status: 'none',
  attempt_id: null,
  deadline_at: null,
  remaining_seconds: 0,
  score: 0,
  total_questions: 0,
  completed_at: null,
  completion_reason: null,
  answers: [],
};

function parseDateField(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

function parseOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseEvent(row: unknown): StudentGamesScheduleEvent | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.subject_name !== 'string' || typeof r.title !== 'string') {
    return null;
  }

  const weekStarts = parseDateField(r.week_starts_on);
  const weekEnds = parseDateField(r.week_ends_on);

  return {
    id: r.id,
    subject_name: r.subject_name,
    title: r.title,
    week_starts_on: weekStarts,
    week_ends_on: weekEnds || weekStarts,
    notes: typeof r.notes === 'string' ? r.notes : null,
    quiz_question_count: parseOptionalInt(r.quiz_question_count),
    quiz_choice_count: parseOptionalInt(r.quiz_choice_count),
    quiz_time_limit_minutes: parseOptionalInt(r.quiz_time_limit_minutes),
  };
}

export async function fetchStudentGamesScheduleEvents(
  studentUserId: string,
): Promise<
  { ok: true; events: StudentGamesScheduleEvent[] } | { ok: false; error: string }
> {
  const studentId = studentUserId.trim();
  if (!studentId) return { ok: false, error: 'Student is required.' };

  try {
    const { data, error } = await supabase.rpc('student_list_games_schedule_events', {
      p_student_user_id: studentId,
    });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid games schedule response.' };
    }

    const rawEvents = (data as Record<string, unknown>).events;
    if (!Array.isArray(rawEvents)) return { ok: true, events: [] };

    const events = rawEvents
      .map(parseEvent)
      .filter((event): event is StudentGamesScheduleEvent => event !== null);

    return { ok: true, events };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load games events.';
    return { ok: false, error: message };
  }
}

function parseQuestion(row: unknown): StudentGamesScheduleQuestion | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.question !== 'string') return null;

  const choices = Array.isArray(r.choices)
    ? r.choices.filter((c): c is string => typeof c === 'string')
    : [];

  return {
    id: r.id,
    question: r.question,
    choices,
    sort_order: parseOptionalInt(r.sort_order) ?? 0,
  };
}

function parseAttemptAnswer(row: unknown): StudentGamesScheduleAttemptAnswer | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.question_id !== 'string') return null;
  const choiceIndex = parseOptionalInt(r.choice_index);
  if (choiceIndex === null) return null;
  return {
    question_id: r.question_id,
    choice_index: choiceIndex,
    is_correct: r.is_correct === true,
  };
}

function parseAttempt(row: unknown): StudentGamesScheduleAttempt {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return EMPTY_ATTEMPT;
  const r = row as Record<string, unknown>;
  const status =
    r.status === 'in_progress' || r.status === 'completed' ? r.status : 'none';

  const rawAnswers = r.answers;
  const answers = Array.isArray(rawAnswers)
    ? rawAnswers
        .map(parseAttemptAnswer)
        .filter((a): a is StudentGamesScheduleAttemptAnswer => a !== null)
    : [];

  const completionReason =
    r.completion_reason === 'time_up' || r.completion_reason === 'all_answered'
      ? r.completion_reason
      : null;

  return {
    status,
    attempt_id: typeof r.attempt_id === 'string' ? r.attempt_id : null,
    deadline_at: typeof r.deadline_at === 'string' ? r.deadline_at : null,
    remaining_seconds: parseOptionalInt(r.remaining_seconds) ?? 0,
    score: parseOptionalInt(r.score) ?? 0,
    total_questions: parseOptionalInt(r.total_questions) ?? 0,
    completed_at: typeof r.completed_at === 'string' ? r.completed_at : null,
    completion_reason: completionReason,
    answers,
  };
}

function parseQuizConfig(event: StudentGamesScheduleEvent): StudentGamesScheduleQuizConfig | null {
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

export async function fetchStudentGamesScheduleEvent(
  studentUserId: string,
  eventId: string,
): Promise<
  { ok: true; detail: StudentGamesScheduleEventDetail } | { ok: false; error: string; code?: string }
> {
  const studentId = studentUserId.trim();
  const id = eventId.trim();
  if (!studentId || !id) return { ok: false, error: 'Event is required.' };

  try {
    const { data, error } = await supabase.rpc('student_get_games_schedule_event', {
      p_student_user_id: studentId,
      p_event_id: id,
    });
    if (error) {
      const code = error.message.toLowerCase().includes('event_not_available')
        ? 'event_not_available'
        : error.message.toLowerCase().includes('not_authorized')
          ? 'not_authorized'
          : undefined;
      return { ok: false, error: error.message, code };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid event response.' };
    }

    const payload = data as Record<string, unknown>;
    const event = parseEvent(payload.event);
    if (!event) return { ok: false, error: 'Invalid event response.' };

    const rawQuestions = payload.questions;
    const questions = Array.isArray(rawQuestions)
      ? rawQuestions
          .map(parseQuestion)
          .filter((q): q is StudentGamesScheduleQuestion => q !== null)
          .sort((a, b) => a.sort_order - b.sort_order)
      : [];

    return {
      ok: true,
      detail: {
        event,
        questions,
        quiz: parseQuizConfig(event),
        attempt: parseAttempt(payload.attempt),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load event.';
    return { ok: false, error: message };
  }
}

export async function checkStudentGamesScheduleChoice(
  studentUserId: string,
  questionId: string,
  choiceIndex: number,
): Promise<
  { ok: true; result: StudentGamesScheduleChoiceResult } | { ok: false; error: string }
> {
  const studentId = studentUserId.trim();
  const qId = questionId.trim();
  if (!studentId || !qId) return { ok: false, error: 'Question is required.' };

  try {
    const { data, error } = await supabase.rpc('student_check_games_schedule_choice', {
      p_student_user_id: studentId,
      p_question_id: qId,
      p_choice_index: choiceIndex,
    });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid choice response.' };
    }

    const r = data as Record<string, unknown>;
    const correctIndex = parseOptionalInt(r.correct_choice_index);
    if (correctIndex === null) return { ok: false, error: 'Invalid choice response.' };

    return {
      ok: true,
      result: {
        is_correct: r.is_correct === true,
        correct_choice_index: correctIndex,
        correct_choice_text:
          typeof r.correct_choice_text === 'string' ? r.correct_choice_text : '',
        attempt: r.attempt != null ? parseAttempt(r.attempt) : undefined,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not check answer.';
    return { ok: false, error: message };
  }
}

export async function startStudentGamesScheduleAttempt(
  studentUserId: string,
  eventId: string,
): Promise<
  { ok: true; attempt: StudentGamesScheduleAttempt } | { ok: false; error: string; code?: string }
> {
  const studentId = studentUserId.trim();
  const id = eventId.trim();
  if (!studentId || !id) return { ok: false, error: 'Event is required.' };

  try {
    const { data, error } = await supabase.rpc('student_start_games_schedule_attempt', {
      p_student_user_id: studentId,
      p_event_id: id,
    });
    if (error) {
      const msg = error.message.toLowerCase();
      const code = msg.includes('quiz_not_configured') ? 'quiz_not_configured' : undefined;
      return { ok: false, error: error.message, code };
    }
    return { ok: true, attempt: parseAttempt(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start exam.';
    return { ok: false, error: message };
  }
}

export async function syncStudentGamesScheduleAttempt(
  studentUserId: string,
  eventId: string,
): Promise<
  { ok: true; attempt: StudentGamesScheduleAttempt } | { ok: false; error: string }
> {
  const studentId = studentUserId.trim();
  const id = eventId.trim();
  if (!studentId || !id) return { ok: false, error: 'Event is required.' };

  try {
    const { data, error } = await supabase.rpc('student_sync_games_schedule_attempt', {
      p_student_user_id: studentId,
      p_event_id: id,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, attempt: parseAttempt(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not sync exam attempt.';
    return { ok: false, error: message };
  }
}

export type ActiveGamesScheduleExam = {
  student_user_id: string;
  event_id: string;
  event_title: string;
  deadline_at: string;
  remaining_seconds: number;
};

function parseActiveExam(row: unknown): ActiveGamesScheduleExam | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.student_user_id !== 'string' || typeof r.event_id !== 'string') return null;
  return {
    student_user_id: r.student_user_id,
    event_id: r.event_id,
    event_title: typeof r.event_title === 'string' ? r.event_title : '',
    deadline_at: typeof r.deadline_at === 'string' ? r.deadline_at : '',
    remaining_seconds: parseOptionalInt(r.remaining_seconds) ?? 0,
  };
}

export async function fetchActiveGamesScheduleExams(): Promise<
  { ok: true; exams: ActiveGamesScheduleExam[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.rpc('parent_list_active_games_schedule_exams');
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== 'object') {
      return { ok: true, exams: [] };
    }

    const raw = (data as Record<string, unknown>).exams;
    if (!Array.isArray(raw)) return { ok: true, exams: [] };

    const exams = raw
      .map(parseActiveExam)
      .filter((exam): exam is ActiveGamesScheduleExam => exam !== null);

    return { ok: true, exams };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load active exams.';
    return { ok: false, error: message };
  }
}
