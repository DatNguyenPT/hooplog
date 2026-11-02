import {
  backupFileName,
  isBackupFileName,
  isEmptySummary,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  summaryEntries,
} from './backup';
import { BackupError } from './backupError';
import type { BackupData } from './backupSchema';

const T = '2026-11-01T08:00:00.000Z';
const ID = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
const SQUAT = '00000000-0000-4000-8000-000000000001';
const stamps = { created_at: T, updated_at: T, deleted_at: null };
const noTargets = {
  target_sets: null,
  target_reps: null,
  target_weight_kg: null,
  target_duration_s: null,
  target_distance_m: null,
  target_shots: null,
};

/** One of everything, wired together. */
function validData(): BackupData {
  return {
    profile: { id: ID(1), display_name: 'Dat', onboarded_at: T, ...stamps },
    exercise: [
      {
        id: ID(2),
        name: 'Slam',
        category: 'other',
        measurement_type: 'reps',
        is_builtin: 0,
        created_at: T,
        updated_at: T,
        deleted_at: null,
      },
    ],
    shooting_session: [{ id: ID(3), started_at: T, source: 'manual', ended_at: T, ...stamps }],
    shot: [
      {
        id: ID(4),
        session_id: ID(3),
        taken_at: T,
        result: 'made',
        source: 'manual',
        confidence: null,
        corrected: 0,
        ...stamps,
      },
      {
        id: ID(5),
        session_id: ID(3),
        taken_at: T,
        result: 'missed',
        source: 'ai',
        confidence: 0.82,
        corrected: 1,
        ...stamps,
      },
    ],
    workout_session: [{ id: ID(6), started_at: T, ended_at: T, ...stamps }],
    workout_set: [
      {
        id: ID(7),
        session_id: ID(6),
        exercise_id: SQUAT,
        logged_at: T,
        reps: 5,
        weight_kg: 60.5,
        duration_s: null,
        distance_m: null,
        ...stamps,
      },
      {
        id: ID(8),
        session_id: ID(6),
        exercise_id: ID(2),
        logged_at: T,
        reps: 12,
        weight_kg: null,
        duration_s: null,
        distance_m: null,
        ...stamps,
      },
    ],
    training_plan: [{ id: ID(9), name: 'Pre-season', is_active: 1, ...stamps }],
    plan_item: [
      {
        id: ID(10),
        plan_id: ID(9),
        weekday: 1,
        kind: 'exercise',
        exercise_id: SQUAT,
        ...noTargets,
        target_sets: 3,
        target_reps: 8,
        ...stamps,
      },
      {
        id: ID(11),
        plan_id: ID(9),
        weekday: 1,
        kind: 'shooting',
        exercise_id: null,
        ...noTargets,
        target_shots: 100,
        ...stamps,
      },
    ],
  };
}

const text = (data: unknown = validData(), header: object = {}) =>
  JSON.stringify({ app: 'hooplog', format: 1, exported_at: T, data, ...header });

function errorKey(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error instanceof BackupError ? error.key : 'not a BackupError';
  }
  return 'no error';
}

describe('reading a backup', () => {
  it('reads what serializeBackup wrote, row for row', () => {
    const file = parseBackup(serializeBackup(validData(), T).text);
    expect(file).toEqual({ app: 'hooplog', format: 1, exported_at: T, data: validData() });
  });

  it('accepts a backup of a phone with nothing saved but a missing profile', () => {
    const data = { ...validData(), profile: null };
    expect(parseBackup(text(data)).data.profile).toBeNull();
  });

  it('accepts a byte-order mark at the start', () => {
    expect(parseBackup('﻿' + text()).data.shot).toHaveLength(2);
  });

  it.each([
    ['text that is not JSON', 'hello'],
    ['a JSON list', '[]'],
    ['JSON that is not a backup', '{"name":"x"}'],
    ['another app’s backup', text(validData(), { app: 'other' })],
  ])('refuses %s as not a backup', (_name, input) => {
    expect(errorKey(() => parseBackup(input))).toBe('notBackup');
  });

  it('tells a backup from a newer app version apart from a damaged one', () => {
    expect(errorKey(() => parseBackup(text(validData(), { format: 2 })))).toBe('newerVersion');
    expect(errorKey(() => parseBackup(text(validData(), { format: 0 })))).toBe('damaged');
    expect(errorKey(() => parseBackup(text(validData(), { format: '1' })))).toBe('damaged');
  });

  const broken: [string, (data: BackupData) => void][] = [
    ['a missing table', (d) => delete (d as Partial<BackupData>).shot],
    ['a column that is not part of the format', (d) => Object.assign(d.shot[0]!, { extra: 1 })],
    ['a time without a date', (d) => (d.shot[0]!.taken_at = '08:00')],
    ['a time that is not UTC', (d) => (d.shot[0]!.taken_at = '2026-11-01T08:00:00.000+07:00')],
    ['a date that does not exist', (d) => (d.shot[0]!.taken_at = '2026-02-30T08:00:00.000Z')],
    ['an unknown shot result', (d) => ((d.shot[0] as { result: string }).result = 'maybe')],
    ['a confidence above 1', (d) => (d.shot[0]!.confidence = 1.5)],
    ['a deleted shot', (d) => ((d.shot[0] as { deleted_at: string | null }).deleted_at = T)],
    ['a weekday of 8', (d) => (d.plan_item[0]!.weekday = 8)],
    ['a negative weight', (d) => (d.workout_set[0]!.weight_kg = -1)],
    ['zero reps', (d) => (d.workout_set[0]!.reps = 0)],
    ['an exercise name that is too long', (d) => (d.exercise[0]!.name = 'x'.repeat(61))],
    ['a profile name that is too long', (d) => (d.profile!.display_name = 'x'.repeat(41))],
    ['an id that is not a UUID', (d) => (d.shot[0]!.id = 'shot-1')],
    ['a shooting item with sets', (d) => (d.plan_item[1]!.target_sets = 3)],
    ['an exercise item with no exercise', (d) => (d.plan_item[0]!.exercise_id = null)],
    ['a built-in exercise listed as custom', (d) => (d.exercise[0]!.id = SQUAT)],
    ['a repeated id', (d) => (d.shot[1]!.id = d.shot[0]!.id)],
    ['a shot of a session that is not there', (d) => (d.shot[0]!.session_id = ID(99))],
    ['a set of a session that is not there', (d) => (d.workout_set[0]!.session_id = ID(99))],
    ['a set of an exercise that is not there', (d) => (d.workout_set[1]!.exercise_id = ID(99))],
    ['a plan item of a plan that is not there', (d) => (d.plan_item[0]!.plan_id = ID(99))],
    [
      'two open shooting sessions',
      (d) =>
        d.shooting_session.push(
          { ...d.shooting_session[0]!, id: ID(20), ended_at: null },
          { ...d.shooting_session[0]!, id: ID(21), ended_at: null },
        ),
    ],
    [
      'two open workouts',
      (d) =>
        d.workout_session.push(
          { ...d.workout_session[0]!, id: ID(20), ended_at: null },
          { ...d.workout_session[0]!, id: ID(21), ended_at: null },
        ),
    ],
    ['two active plans', (d) => d.training_plan.push({ ...d.training_plan[0]!, id: ID(20) })],
    ['one exercise twice on a day', (d) => d.plan_item.push({ ...d.plan_item[0]!, id: ID(20) })],
    ['two shooting items on a day', (d) => d.plan_item.push({ ...d.plan_item[1]!, id: ID(20) })],
  ];

  it.each(broken)('refuses %s as damaged', (_name, damage) => {
    const data = validData();
    damage(data);
    expect(errorKey(() => parseBackup(text(data)))).toBe('damaged');
  });

  it('keeps a deleted custom exercise, so the sets that used it keep their name', () => {
    const data = validData();
    data.exercise[0]!.deleted_at = T;
    expect(parseBackup(text(data)).data.exercise[0]!.deleted_at).toBe(T);
  });

  it('accepts a built-in exercise in sets and plan items without listing it', () => {
    expect(validData().exercise.map((e) => e.id)).not.toContain(SQUAT);
    expect(parseBackup(text()).data.plan_item[0]!.exercise_id).toBe(SQUAT);
  });
});

describe('writing a backup', () => {
  it('refuses rows that could not be restored', () => {
    const data = validData();
    data.shot[0]!.session_id = ID(99);
    expect(errorKey(() => serializeBackup(data, T))).toBe('exportFailed');
    expect(errorKey(() => serializeBackup({ ...validData(), shot: 'x' }, T))).toBe('exportFailed');
    expect(errorKey(() => serializeBackup(validData(), 'yesterday'))).toBe('exportFailed');
  });

  it('writes one compact line', () => {
    expect(serializeBackup(validData(), T).text).not.toContain('\n');
  });

  it('counts what it wrote', () => {
    expect(serializeBackup(validData(), T).summary).toEqual(summarizeBackup(validData()));
  });
});

describe('summaries and names', () => {
  it('counts what a backup holds, leaving out deleted custom exercises', () => {
    const data = validData();
    data.exercise.push({ ...data.exercise[0]!, id: ID(30), deleted_at: T });
    expect(summarizeBackup(data)).toEqual({
      shootingSessions: 1,
      shots: 2,
      workoutSessions: 1,
      workoutSets: 2,
      plans: 1,
      customExercises: 1,
    });
  });

  it('calls a phone with no sessions, plans or custom exercises empty', () => {
    const none = {
      ...validData(),
      exercise: [],
      shooting_session: [],
      shot: [],
      workout_session: [],
      workout_set: [],
      training_plan: [],
      plan_item: [],
    };
    expect(isEmptySummary(summarizeBackup(none))).toBe(true);
    expect(isEmptySummary(summarizeBackup(validData()))).toBe(false);
  });

  it('lists only the kinds the player has any of, in screen order', () => {
    const summary = {
      shootingSessions: 2,
      shots: 0,
      workoutSessions: 0,
      workoutSets: 5,
      plans: 1,
      customExercises: 0,
    };
    expect(summaryEntries(summary)).toEqual([
      { key: 'shootingSessions', count: 2 },
      { key: 'workoutSets', count: 5 },
      { key: 'plans', count: 1 },
    ]);
    expect(summaryEntries({ ...summary, shootingSessions: 0, workoutSets: 0, plans: 0 })).toEqual(
      [],
    );
  });

  it('names the file after the phone’s own day, padded', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('hooplog-backup-2026-01-05.json');
    expect(backupFileName(new Date(2026, 10, 1, 0, 1))).toBe('hooplog-backup-2026-11-01.json');
  });

  it('recognises only its own file names', () => {
    expect(isBackupFileName('hooplog-backup-2026-11-01.json')).toBe(true);
    expect(isBackupFileName('hooplog-backup-2026-11-01-1.json')).toBe(true);
    expect(isBackupFileName('notes.json')).toBe(false);
    expect(isBackupFileName('hooplog-backup-2026-11-01.txt')).toBe(false);
    expect(isBackupFileName('x/hooplog-backup-2026-11-01.json')).toBe(false);
  });
});
