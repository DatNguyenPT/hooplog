import { useLocalSearchParams } from 'expo-router';

import { PlanScreen } from '@/features/training-plans/ui/PlanScreen';

export default function PlanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlanScreen id={id} />;
}
