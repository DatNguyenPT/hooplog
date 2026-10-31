import type { Exercise } from '@/features/workouts/domain/exercise';
import {
  addDays,
  bucketActivity,
  buildWeek,
  dayKey,
  findItem,
  itemProgress,
  parseShotTarget,
  parseTargetInput,
  parseWeekday,
  startOfDay,
  startOfWeek,
  targetToInput,
  validatePlanName,
  weekdayOf,
  weekSummary,
  type PlanItem,
} from './plan';

const SQUAT: Exercise = {
  id: 'ex-squat',
  name: 'squat',
  category: 'strength',
  measurementType: 'reps_weight',
  isBuiltin: true,
};
const PUSH_UP: Exercise = {
  id: 'ex-push-up',
  name: 'push_up',
  category: 'strength',
  measurementType: 'reps',
  isBuiltin: true,
};

const NO_TARGET = { reps: null, weightKg: null, durationS: null, distanceM: null };

const exerciseItem = (
  id: string,
  weekday: PlanItem['weekday'],
  exercise: Exercise,
  sets: number,
): PlanItem => ({ kind: 'exercise', id, weekday, exercise, sets, target: NO_TARGET });

/** Local-time dates, so the tests hold in any time zone. 2026-01-05 is a Monday. */
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

describe('calendar helpers', () => {
  it('numbers weekdays Monday=1 to Sunday=7', () => {
    expect(weekdayOf(at(2026, 1, 5))).toBe(1);
    expect(weekdayOf(at(2026, 1, 7))).toBe(3);
    expect(weekdayOf(at(2026, 1, 10))).toBe(6);
    expect(weekdayOf(at(2026, 1, 11))).toBe(7);
  });

  it('finds the Monday of a week, also across month and year ends', () => {
    expect(dayKey(startOfWeek(at(2026, 1, 5, 0, 1)))).toBe('2026-01-05');
    expect(dayKey(startOfWeek(at(2026, 1, 11, 23, 59)))).toBe('2026-01-05');
    expect(dayKey(startOfWeek(at(2026, 2, 1)))).toBe('2026-01-26');
    expect(dayKey(startOfWeek(at(2026, 1, 1)))).toBe('2025-12-29');
  });

  it('adds whole local days and returns local midnight', () => {
    const next = addDays(at(2026, 1, 31, 18, 45), 1);
    expect(dayKey(next)).toBe('2026-02-01');
    expect([next.getHours(), next.getMinutes()]).toEqual([0, 0]);
    expect(dayKey(addDays(at(2026, 12, 31), 1))).toBe('2027-01-01');
    expect(dayKey(addDays(at(2026, 3, 1), -1))).toBe('2026-02-28');
  });

  it('moves exactly one calendar day across daylight-saving changes in any zone', () => {
    // Clocks change on these dates in the US and the EU, which makes that day 23 or 25 hours long.
    const cases: [Date, string][] = [
      [at(2026, 3, 7), '2026-03-08'],
      [at(2026, 3, 28), '2026-03-29'],
      [at(2026, 10, 24), '2026-10-25'],
      [at(2026, 10, 31), '2026-11-01'],
    ];
    for (const [from, expected] of cases) {
      const next = addDays(from, 1);
      expect(dayKey(next)).toBe(expected);
      expect(next.getHours()).toBe(0);
    }
  });

  it('truncates a moment to local midnight', () => {
    const day = startOfDay(at(2026, 1, 5, 18, 45));
    expect([dayKey(day), day.getHours(), day.getMinutes()]).toEqual(['2026-01-05', 0, 0]);
  });

  it('formats the local calendar day with zero padding', () => {
    expect(dayKey(at(2026, 3, 4, 23, 59))).toBe('2026-03-04');
    expect(dayKey(at(2026, 11, 20, 0, 0))).toBe('2026-11-20');
  });
});

describe('bucketActivity', () => {
  it('counts sets per exercise and shots per local day', () => {
    const days = bucketActivity(
      [
        { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 5, 9).toISOString() },
        { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 5, 9, 30).toISOString() },
        { exerciseId: PUSH_UP.id, loggedAt: at(2026, 1, 5, 10).toISOString() },
        { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 6, 9).toISOString() },
      ],
      [
        { takenAt: at(2026, 1, 5, 17).toISOString() },
        { takenAt: at(2026, 1, 5, 17, 1).toISOString() },
      ],
    );
    const monday = days.get('2026-01-05');
    expect(monday?.setsByExercise.get(SQUAT.id)).toBe(2);
    expect(monday?.setsByExercise.get(PUSH_UP.id)).toBe(1);
    expect(monday?.shots).toBe(2);
    expect(days.get('2026-01-06')?.setsByExercise.get(SQUAT.id)).toBe(1);
    expect(days.get('2026-01-06')?.shots).toBe(0);
    expect(days.size).toBe(2);
  });

  it('puts late-evening and just-after-midnight activity on different days', () => {
    const days = bucketActivity(
      [
        { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 5, 23, 30).toISOString() },
        { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 6, 0, 30).toISOString() },
      ],
      [],
    );
    expect(days.get('2026-01-05')?.setsByExercise.get(SQUAT.id)).toBe(1);
    expect(days.get('2026-01-06')?.setsByExercise.get(SQUAT.id)).toBe(1);
  });

  it('is empty without activity', () => {
    expect(bucketActivity([], []).size).toBe(0);
  });
});

describe('itemProgress', () => {
  const squats = exerciseItem('i1', 1, SQUAT, 3);
  const shooting: PlanItem = { kind: 'shooting', id: 'i2', weekday: 1, shots: 50 };
  const activity = (sets: number, shots: number) => ({
    setsByExercise: new Map([[SQUAT.id, sets]]),
    shots,
  });

  it('counts the sets of that exercise against the planned sets', () => {
    expect(itemProgress(squats, activity(2, 99))).toEqual({ done: 2, target: 3, complete: false });
    expect(itemProgress(squats, activity(3, 0))).toEqual({ done: 3, target: 3, complete: true });
  });

  it('stays complete when more than planned was done', () => {
    expect(itemProgress(squats, activity(5, 0))).toEqual({ done: 5, target: 3, complete: true });
  });

  it('counts the shots taken that day for a shooting item', () => {
    expect(itemProgress(shooting, activity(9, 20))).toEqual({
      done: 20,
      target: 50,
      complete: false,
    });
    expect(itemProgress(shooting, activity(0, 50)).complete).toBe(true);
  });

  it('reports nothing done without any activity', () => {
    expect(itemProgress(squats, undefined)).toEqual({ done: 0, target: 3, complete: false });
    expect(itemProgress(shooting, undefined)).toEqual({ done: 0, target: 50, complete: false });
  });

  it('ignores sets of other exercises', () => {
    const other = { setsByExercise: new Map([[PUSH_UP.id, 10]]), shots: 0 };
    expect(itemProgress(squats, other).done).toBe(0);
  });
});

describe('buildWeek', () => {
  const items: PlanItem[] = [
    exerciseItem('mon-squat', 1, SQUAT, 3),
    exerciseItem('mon-push', 1, PUSH_UP, 2),
    { kind: 'shooting', id: 'wed-shots', weekday: 3, shots: 20 },
    exerciseItem('fri-squat', 5, SQUAT, 3),
  ];
  const wednesday = at(2026, 1, 7, 10);

  const activity = bucketActivity(
    [
      // This week's Monday: two of three squat sets.
      { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 5, 9).toISOString() },
      { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 5, 9, 10).toISOString() },
      // The Monday before must not count towards this week.
      { exerciseId: SQUAT.id, loggedAt: at(2025, 12, 29, 9).toISOString() },
      { exerciseId: SQUAT.id, loggedAt: at(2025, 12, 29, 9, 10).toISOString() },
      // Friday has not happened yet; activity there (a stray future-dated row) is not shown.
      { exerciseId: SQUAT.id, loggedAt: at(2026, 1, 9, 9).toISOString() },
    ],
    Array.from({ length: 25 }, () => ({ takenAt: at(2026, 1, 7, 8).toISOString() })),
  );

  it('lists Monday to Sunday with past, today and future days', () => {
    const week = buildWeek(items, activity, wednesday);
    expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(week.map((d) => d.state)).toEqual([
      'past',
      'past',
      'today',
      'future',
      'future',
      'future',
      'future',
    ]);
  });

  it('groups the items under their weekday in the given order', () => {
    const week = buildWeek(items, activity, wednesday);
    expect(week[0].items.map((i) => i.item.id)).toEqual(['mon-squat', 'mon-push']);
    expect(week[1].items).toEqual([]);
    expect(week[2].items.map((i) => i.item.id)).toEqual(['wed-shots']);
    expect(week[4].items.map((i) => i.item.id)).toEqual(['fri-squat']);
  });

  it('shows progress for past and current days only, from that day alone', () => {
    const week = buildWeek(items, activity, wednesday);
    expect(week[0].items[0].progress).toEqual({ done: 2, target: 3, complete: false });
    expect(week[0].items[1].progress).toEqual({ done: 0, target: 2, complete: false });
    expect(week[2].items[0].progress).toEqual({ done: 25, target: 20, complete: true });
    expect(week[4].items[0].progress).toBeNull();
  });

  it('shows no progress at all for a plan that is not being followed', () => {
    const week = buildWeek(items, null, wednesday);
    expect(week.flatMap((d) => d.items.map((i) => i.progress)).every((p) => p === null)).toBe(true);
    expect(week.map((d) => d.state)[2]).toBe('today');
  });

  it('handles Monday and Sunday as today', () => {
    const monday = buildWeek(items, activity, at(2026, 1, 5, 0, 5));
    expect(monday.map((d) => d.state)).toEqual([
      'today',
      'future',
      'future',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(monday[0].items[0].progress).toEqual({ done: 2, target: 3, complete: false });

    const sunday = buildWeek(items, activity, at(2026, 1, 11, 23, 55));
    expect(sunday.map((d) => d.state)).toEqual([
      'past',
      'past',
      'past',
      'past',
      'past',
      'past',
      'today',
    ]);
    expect(sunday[4].items[0].progress).toEqual({ done: 1, target: 3, complete: false });
  });

  it('is seven empty days for an empty plan', () => {
    const week = buildWeek([], activity, wednesday);
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.items.length === 0)).toBe(true);
  });
});

describe('weekSummary', () => {
  const items: PlanItem[] = [
    exerciseItem('a', 1, SQUAT, 1),
    exerciseItem('b', 2, SQUAT, 2),
    exerciseItem('c', 5, SQUAT, 1),
  ];

  it('counts completed items against all scheduled ones, future days included', () => {
    const activity = bucketActivity(
      [{ exerciseId: SQUAT.id, loggedAt: at(2026, 1, 5, 9).toISOString() }],
      [],
    );
    const week = buildWeek(items, activity, at(2026, 1, 7));
    expect(weekSummary(week)).toEqual({ done: 1, total: 3 });
  });

  it('counts nothing as done when progress is not tracked', () => {
    expect(weekSummary(buildWeek(items, null, at(2026, 1, 7)))).toEqual({ done: 0, total: 3 });
  });

  it('is 0 of 0 for an empty plan', () => {
    expect(weekSummary(buildWeek([], null, at(2026, 1, 7)))).toEqual({ done: 0, total: 0 });
  });
});

describe('findItem', () => {
  const items: PlanItem[] = [
    exerciseItem('a', 1, SQUAT, 3),
    exerciseItem('b', 2, SQUAT, 3),
    { kind: 'shooting', id: 'c', weekday: 1, shots: 10 },
  ];

  it('finds an exercise item by day and exercise', () => {
    expect(findItem(items, 1, { kind: 'exercise', exerciseId: SQUAT.id })?.id).toBe('a');
    expect(findItem(items, 2, { kind: 'exercise', exerciseId: SQUAT.id })?.id).toBe('b');
  });

  it('finds the shooting item of a day', () => {
    expect(findItem(items, 1, { kind: 'shooting' })?.id).toBe('c');
  });

  it('does not mix up kinds, days or exercises', () => {
    expect(findItem(items, 2, { kind: 'shooting' })).toBeUndefined();
    expect(findItem(items, 3, { kind: 'exercise', exerciseId: SQUAT.id })).toBeUndefined();
    expect(findItem(items, 1, { kind: 'exercise', exerciseId: PUSH_UP.id })).toBeUndefined();
  });
});

describe('parseWeekday', () => {
  it('accepts 1 to 7', () => {
    expect(['1', '2', '3', '4', '5', '6', '7'].map(parseWeekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects anything else', () => {
    for (const raw of [undefined, '', '0', '8', '-1', '1.5', 'mon', 'NaN']) {
      expect(parseWeekday(raw)).toBeNull();
    }
  });
});

describe('parseTargetInput', () => {
  it('reads sets plus the optional per-set targets of the measurement type', () => {
    expect(parseTargetInput('reps_weight', { sets: '3', reps: '10', weight: '40' })).toEqual({
      ok: true,
      sets: 3,
      target: { reps: 10, weightKg: 40, durationS: null, distanceM: null },
    });
    expect(parseTargetInput('duration', { sets: '4', duration: '90' })).toMatchObject({
      ok: true,
      target: { durationS: 90 },
    });
    expect(parseTargetInput('distance', { sets: '2', distance: '12,5' })).toMatchObject({
      ok: true,
      target: { distanceM: 12.5 },
    });
  });

  it('treats blank per-set fields as no target', () => {
    expect(parseTargetInput('reps_weight', { sets: '3', reps: '  ', weight: '' })).toEqual({
      ok: true,
      sets: 3,
      target: NO_TARGET,
    });
    expect(parseTargetInput('reps', { sets: ' 5 ' })).toMatchObject({ ok: true, sets: 5 });
  });

  it('allows an unloaded weight target of 0', () => {
    expect(parseTargetInput('reps_weight', { sets: '3', weight: '0' })).toMatchObject({
      ok: true,
      target: { weightKg: 0 },
    });
  });

  it('requires sets, as a whole number from 1 to 50', () => {
    const sets = (value: string | undefined) => {
      const parsed = parseTargetInput('reps', { sets: value });
      return parsed.ok ? 'ok' : parsed.errors.sets;
    };
    expect(sets(undefined)).toBe('required');
    expect(sets('')).toBe('required');
    expect(sets('0')).toBe('range');
    expect(sets('51')).toBe('range');
    expect(sets('2.5')).toBe('invalid');
    expect(sets('-3')).toBe('invalid');
    expect(sets('three')).toBe('invalid');
    expect(sets('1')).toBe('ok');
    expect(sets('50')).toBe('ok');
  });

  it('rejects filled per-set values that break the set limits', () => {
    const errors = (input: Parameters<typeof parseTargetInput>[1]) => {
      const parsed = parseTargetInput('reps_weight', { sets: '3', ...input });
      return parsed.ok ? null : parsed.errors;
    };
    expect(errors({ reps: '0' })).toEqual({ reps: 'range' });
    expect(errors({ reps: '1.5' })).toEqual({ reps: 'invalid' });
    expect(errors({ weight: '-5' })).toEqual({ weight: 'invalid' });
    expect(errors({ weight: '1001' })).toEqual({ weight: 'range' });
  });

  it('reports every problem at once', () => {
    const parsed = parseTargetInput('reps_weight', { sets: '', reps: 'x', weight: '2000' });
    expect(parsed).toEqual({
      ok: false,
      errors: { sets: 'required', reps: 'invalid', weight: 'range' },
    });
  });

  it('ignores fields that do not belong to the measurement type', () => {
    expect(parseTargetInput('duration', { sets: '3', reps: 'junk', weight: '9999' })).toEqual({
      ok: true,
      sets: 3,
      target: NO_TARGET,
    });
  });
});

describe('targetToInput', () => {
  it('turns a saved target back into form text, leaving blanks out', () => {
    expect(
      targetToInput('reps_weight', {
        sets: 3,
        target: { reps: 10, weightKg: 42.5, durationS: null, distanceM: null },
      }),
    ).toEqual({ sets: '3', reps: '10', weight: '42.5' });
    expect(targetToInput('reps_weight', { sets: 4, target: NO_TARGET })).toEqual({ sets: '4' });
  });

  it('round-trips through parseTargetInput', () => {
    const input = { sets: '5', duration: '45' };
    const parsed = parseTargetInput('duration', input);
    expect(parsed.ok && targetToInput('duration', parsed)).toEqual(input);
  });
});

describe('parseShotTarget', () => {
  it('reads a whole number of shots from 1 to 1000', () => {
    expect(parseShotTarget('50')).toEqual({ ok: true, shots: 50 });
    expect(parseShotTarget(' 1 ')).toEqual({ ok: true, shots: 1 });
    expect(parseShotTarget('1000')).toEqual({ ok: true, shots: 1000 });
  });

  it('explains what is wrong otherwise', () => {
    expect(parseShotTarget('')).toEqual({ ok: false, error: 'required' });
    expect(parseShotTarget('   ')).toEqual({ ok: false, error: 'required' });
    expect(parseShotTarget('0')).toEqual({ ok: false, error: 'range' });
    expect(parseShotTarget('1001')).toEqual({ ok: false, error: 'range' });
    expect(parseShotTarget('2.5')).toEqual({ ok: false, error: 'invalid' });
    expect(parseShotTarget('lots')).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('validatePlanName', () => {
  it('trims the name and collapses inner whitespace', () => {
    expect(validatePlanName('  Pre   season  ', [])).toEqual({ ok: true, name: 'Pre season' });
  });

  it('requires a name', () => {
    expect(validatePlanName('', [])).toEqual({ ok: false, error: 'required' });
    expect(validatePlanName('   ', [])).toEqual({ ok: false, error: 'required' });
  });

  it('allows up to 40 characters', () => {
    expect(validatePlanName('a'.repeat(40), []).ok).toBe(true);
    expect(validatePlanName('a'.repeat(41), [])).toEqual({ ok: false, error: 'tooLong' });
  });

  it('rejects a name another plan already has, ignoring case and spacing', () => {
    expect(validatePlanName('Pre season', ['Pre season'])).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(validatePlanName('PRE   season', ['pre season'])).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(validatePlanName('Off season', ['Pre season'])).toMatchObject({ ok: true });
  });
});
