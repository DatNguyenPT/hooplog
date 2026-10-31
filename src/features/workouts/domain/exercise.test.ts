import {
  exerciseDisplayName,
  filterExercises,
  validateExerciseName,
  type Exercise,
} from './exercise';

const translate = (key: string) => ({ 'exercises.builtin.squat': 'Squat' })[key] ?? key;

const squat: Exercise = {
  id: '1',
  name: 'squat',
  category: 'strength',
  measurementType: 'reps_weight',
  isBuiltin: true,
};
const custom: Exercise = {
  id: '2',
  name: 'Mikan Drill',
  category: 'other',
  measurementType: 'reps',
  isBuiltin: false,
};

describe('exercise names', () => {
  it('translates built-ins and shows custom names as typed', () => {
    expect(exerciseDisplayName(squat, translate)).toBe('Squat');
    expect(exerciseDisplayName(custom, translate)).toBe('Mikan Drill');
  });
  it('filters by display name, case-insensitively', () => {
    expect(filterExercises([squat, custom], 'SQU', translate)).toEqual([squat]);
    expect(filterExercises([squat, custom], 'mikan', translate)).toEqual([custom]);
    expect(filterExercises([squat, custom], '  ', translate)).toHaveLength(2);
    expect(filterExercises([squat, custom], 'zzz', translate)).toEqual([]);
  });
});

describe('validateExerciseName', () => {
  it('trims and collapses whitespace', () => {
    expect(validateExerciseName('  Wall   sit ', [])).toEqual({ ok: true, name: 'Wall sit' });
  });
  it('rejects empty, too long and duplicate names', () => {
    expect(validateExerciseName('   ', [])).toEqual({ ok: false, error: 'required' });
    expect(validateExerciseName('x'.repeat(61), [])).toEqual({ ok: false, error: 'tooLong' });
    expect(validateExerciseName('squat', ['Squat'])).toEqual({ ok: false, error: 'duplicate' });
  });
});
