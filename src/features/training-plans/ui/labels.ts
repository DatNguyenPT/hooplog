import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkoutLabels } from '@/features/workouts/ui/labels';
import { formatDistance, formatDuration, formatWeight } from '@/shared/units';
import { WEEKDAY_KEYS, type ItemProgress, type PlanItem, type Weekday } from '../domain/plan';

type ExerciseItem = Extract<PlanItem, { kind: 'exercise' }>;

/** Turns plan values into user-facing text. */
export function usePlanLabels() {
  const { t } = useTranslation();
  const workout = useWorkoutLabels();
  return useMemo(() => {
    /** The per-set target ("10 reps at 40 kg"), or null when the player left every field blank. */
    const perSet = ({ exercise, target }: ExerciseItem): string | null => {
      const { reps, weightKg, durationS, distanceM } = target;
      switch (exercise.measurementType) {
        case 'reps':
          return reps === null ? null : t('set.reps', { count: reps });
        case 'reps_weight':
          if (reps !== null && weightKg !== null)
            return t('set.repsWeight', { count: reps, weight: formatWeight(weightKg) });
          if (reps !== null) return t('set.reps', { count: reps });
          return weightKg === null ? null : formatWeight(weightKg);
        case 'duration':
          return durationS === null ? null : formatDuration(durationS);
        case 'distance':
          return distanceM === null ? null : formatDistance(distanceM);
      }
    };

    const progress = (item: PlanItem, p: ItemProgress): string =>
      item.kind === 'exercise'
        ? t('plans.progressSets', { done: p.done, target: p.target })
        : t('plans.progressShots', { done: p.done, target: p.target });

    return {
      weekday: (weekday: Weekday) => t(`plans.weekday.${WEEKDAY_KEYS[weekday - 1]}`),
      itemName: (item: PlanItem) =>
        item.kind === 'shooting' ? t('plans.shooting') : workout.exerciseName(item.exercise),
      /** "3 sets × 10 reps at 40 kg", "3 sets" or "50 shots". */
      target: (item: PlanItem): string => {
        if (item.kind === 'shooting') return t('plans.shotsCount', { count: item.shots });
        const sets = t('plans.setsCount', { count: item.sets });
        const details = perSet(item);
        return details === null ? sets : t('plans.targetWithDetails', { sets, details });
      },
      progress,
      /** The same progress for screen readers, which also hear that the item is complete. */
      progressSpoken: (item: PlanItem, p: ItemProgress): string =>
        p.complete ? t('plans.progressDone', { progress: progress(item, p) }) : progress(item, p),
    };
  }, [t, workout]);
}
