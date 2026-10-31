import { router, useLocalSearchParams } from 'expo-router';

import { ExercisePicker } from '@/features/workouts/ui/ExercisePicker';

/** Picks the exercise for a plan day, then swaps itself for the target form so Back returns to the plan. */
export default function PlanExercisesRoute() {
  const { planId, weekday } = useLocalSearchParams<{ planId: string; weekday: string }>();
  return (
    <ExercisePicker
      onChoose={(exercise) =>
        router.replace(`/plans/item?planId=${planId}&weekday=${weekday}&exerciseId=${exercise.id}`)
      }
    />
  );
}
