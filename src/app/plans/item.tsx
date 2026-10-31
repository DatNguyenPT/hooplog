import { useLocalSearchParams } from 'expo-router';

import { PlanItemForm } from '@/features/training-plans/ui/PlanItemForm';

export default function PlanItemRoute() {
  const { planId, weekday, exerciseId, kind } = useLocalSearchParams<{
    planId: string;
    weekday: string;
    exerciseId?: string;
    kind?: string;
  }>();
  return <PlanItemForm planId={planId} weekday={weekday} exerciseId={exerciseId} kind={kind} />;
}
