import { useLocalSearchParams } from 'expo-router';

import { WorkoutSession } from '@/features/workouts/ui/WorkoutSession';

export default function WorkoutRoute() {
  const { id, exerciseId } = useLocalSearchParams<{ id: string; exerciseId?: string }>();
  return <WorkoutSession id={id} pickedExerciseId={exerciseId} />;
}
