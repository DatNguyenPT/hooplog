import { useLocalSearchParams } from 'expo-router';

import { ExercisePicker } from '@/features/workouts/ui/ExercisePicker';

export default function ExercisesRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  return <ExercisePicker sessionId={sessionId} />;
}
