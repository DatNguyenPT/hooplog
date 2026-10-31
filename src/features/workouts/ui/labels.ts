import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDistance, formatDuration, formatWeight } from '@/shared/units';
import {
  exerciseDisplayName,
  type Exercise,
  type ExerciseCategory,
  type MeasurementType,
} from '../domain/exercise';
import type { SetValues } from '../domain/workout';

/** Turns domain values into user-facing text. Weights are shown in kg; the imperial switch will go here. */
export function useWorkoutLabels() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      exerciseName: (e: Pick<Exercise, 'name' | 'isBuiltin'>) =>
        exerciseDisplayName(e, (key) => t(key)),
      category: (c: ExerciseCategory) => t(`exercises.category.${c}`),
      measurement: (m: MeasurementType) => t(`measurement.${m}`),
      setDetails: (set: SetValues, type: MeasurementType): string => {
        switch (type) {
          case 'reps':
            return t('set.reps', { count: set.reps ?? 0 });
          case 'reps_weight':
            return t('set.repsWeight', {
              count: set.reps ?? 0,
              weight: formatWeight(set.weightKg ?? 0),
            });
          case 'duration':
            return t('set.duration', { value: formatDuration(set.durationS ?? 0) });
          case 'distance':
            return t('set.distance', { value: formatDistance(set.distanceM ?? 0) });
        }
      },
    }),
    [t],
  );
}
