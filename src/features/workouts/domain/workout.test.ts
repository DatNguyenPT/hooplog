import {
  durationSeconds,
  parseSetInput,
  personalBests,
  setBars,
  setCountBars,
  setToInput,
  setVolume,
  summarizeWorkout,
  type SetValues,
} from './workout';

const set = (p: Partial<SetValues>): SetValues => ({
  reps: null,
  weightKg: null,
  durationS: null,
  distanceM: null,
  ...p,
});

describe('setVolume', () => {
  it('multiplies reps by weight', () => expect(setVolume({ reps: 5, weightKg: 62.5 })).toBe(312.5));
  it('is 0 when reps or weight is missing', () => {
    expect(setVolume({ reps: 10, weightKg: null })).toBe(0);
    expect(setVolume({ reps: null, weightKg: 40 })).toBe(0);
  });
});

describe('summarizeWorkout', () => {
  it('totals sets, reps and volume and computes duration', () => {
    const s = summarizeWorkout(
      [
        set({ reps: 5, weightKg: 100 }),
        set({ reps: 5, weightKg: 100 }),
        set({ reps: 20 }),
        set({ durationS: 60 }),
      ],
      '2026-05-01T10:00:00.000Z',
      '2026-05-01T10:45:30.000Z',
    );
    expect(s).toEqual({ sets: 4, totalReps: 30, totalVolumeKg: 1000, durationS: 2730 });
  });
  it('has no duration while open and handles an empty workout', () => {
    expect(summarizeWorkout([], '2026-05-01T10:00:00.000Z', null)).toEqual({
      sets: 0,
      totalReps: 0,
      totalVolumeKg: 0,
      durationS: null,
    });
  });
});

describe('durationSeconds', () => {
  it('never returns a negative or NaN duration', () => {
    expect(durationSeconds('2026-05-01T10:00:00.000Z', '2026-05-01T09:00:00.000Z')).toBe(0);
    expect(durationSeconds('nope', '2026-05-01T09:00:00.000Z')).toBeNull();
  });
});

describe('personalBests', () => {
  it('tracks max weight and max reps per exercise', () => {
    const best = personalBests([
      { exerciseId: 'a', reps: 5, weightKg: 100 },
      { exerciseId: 'a', reps: 8, weightKg: 80 },
      { exerciseId: 'b', reps: 30, weightKg: null },
      { exerciseId: 'c', reps: null, weightKg: null },
    ]);
    expect(best.get('a')).toEqual({ maxWeightKg: 100, maxReps: 8 });
    expect(best.get('b')).toEqual({ maxWeightKg: null, maxReps: 30 });
    expect(best.get('c')).toEqual({ maxWeightKg: null, maxReps: null });
  });
});

describe('parseSetInput', () => {
  it('parses reps and weight, accepting a decimal comma', () => {
    expect(parseSetInput('reps_weight', { reps: ' 8 ', weight: '42,5' })).toEqual({
      ok: true,
      values: { reps: 8, weightKg: 42.5, durationS: null, distanceM: null },
    });
  });
  it('allows zero weight but not zero reps', () => {
    expect(parseSetInput('reps_weight', { reps: '5', weight: '0' }).ok).toBe(true);
    expect(parseSetInput('reps', { reps: '0' })).toEqual({ ok: false, errors: { reps: 'range' } });
  });
  it('reports every bad field', () => {
    expect(parseSetInput('reps_weight', { reps: '', weight: 'abc' })).toEqual({
      ok: false,
      errors: { reps: 'required', weight: 'invalid' },
    });
  });
  it('rejects fractional reps, negatives, exponents and absurd values', () => {
    expect(parseSetInput('reps', { reps: '2.5' })).toMatchObject({ ok: false });
    expect(parseSetInput('reps', { reps: '-3' })).toMatchObject({ errors: { reps: 'invalid' } });
    expect(parseSetInput('reps', { reps: '1e3' })).toMatchObject({ errors: { reps: 'invalid' } });
    expect(parseSetInput('reps_weight', { reps: '5', weight: '5000' })).toMatchObject({
      errors: { weight: 'range' },
    });
  });
  it('ignores fields that do not belong to the measurement type', () => {
    expect(parseSetInput('duration', { duration: '45', reps: 'garbage' })).toEqual({
      ok: true,
      values: { reps: null, weightKg: null, durationS: 45, distanceM: null },
    });
    expect(parseSetInput('distance', { distance: '400' })).toMatchObject({
      ok: true,
      values: { distanceM: 400 },
    });
  });
});

describe('setToInput', () => {
  it('turns saved values into form text for the type fields only', () => {
    expect(setToInput('reps_weight', set({ reps: 8, weightKg: 62.5 }))).toEqual({
      reps: '8',
      weight: '62.5',
    });
    expect(setToInput('duration', set({ durationS: 45, reps: 3 }))).toEqual({ duration: '45' });
    expect(setToInput('reps_weight', set({ reps: 5 }))).toEqual({ reps: '5' });
  });
  it('round-trips through parseSetInput', () => {
    const saved = set({ reps: 12, weightKg: 0 });
    expect(parseSetInput('reps_weight', setToInput('reps_weight', saved))).toEqual({
      ok: true,
      values: saved,
    });
  });
});

describe('setBars', () => {
  const sets = (values: Partial<SetValues>[]) => values.map((v, i) => ({ id: `s${i}`, ...set(v) }));

  it('sizes each set against the largest, using the measurement type field', () => {
    expect(
      setBars(
        'reps_weight',
        sets([
          { reps: 5, weightKg: 100 },
          { reps: 5, weightKg: 50 },
        ]),
      ),
    ).toEqual([
      { setId: 's0', fraction: 1 },
      { setId: 's1', fraction: 0.5 },
    ]);
    expect(setBars('duration', sets([{ durationS: 30 }, { durationS: 60 }]))[0].fraction).toBe(0.5);
    expect(setBars('distance', sets([{ distanceM: 400 }, { distanceM: 100 }]))[1].fraction).toBe(
      0.25,
    );
    expect(setBars('reps', sets([{ reps: 10 }, { reps: 20 }]))[0].fraction).toBe(0.5);
  });
  it('has nothing to compare for one set or when every value is zero', () => {
    expect(setBars('reps', sets([{ reps: 10 }]))).toEqual([]);
    expect(setBars('reps', [])).toEqual([]);
    expect(
      setBars(
        'reps_weight',
        sets([
          { reps: 5, weightKg: 0 },
          { reps: 8, weightKg: 0 },
        ]),
      ),
    ).toEqual([]);
  });
  it('keeps an unloaded set as a zero-length bar beside a loaded one', () => {
    const bars = setBars(
      'reps_weight',
      sets([
        { reps: 5, weightKg: 0 },
        { reps: 5, weightKg: 20 },
      ]),
    );
    expect(bars.map((b) => b.fraction)).toEqual([0, 1]);
  });
});

describe('setCountBars', () => {
  it('sizes exercises against the one with the most sets', () => {
    expect(
      setCountBars([
        { exerciseId: 'a', sets: 4 },
        { exerciseId: 'b', sets: 1 },
      ]),
    ).toEqual([
      { exerciseId: 'a', sets: 4, fraction: 1 },
      { exerciseId: 'b', sets: 1, fraction: 0.25 },
    ]);
  });
  it('needs two exercises with sets to compare', () => {
    expect(setCountBars([{ exerciseId: 'a', sets: 3 }])).toEqual([]);
    expect(
      setCountBars([
        { exerciseId: 'a', sets: 3 },
        { exerciseId: 'b', sets: 0 },
      ]),
    ).toEqual([]);
  });
});
