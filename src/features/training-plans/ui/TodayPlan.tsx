import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useShootingRepository } from '@/features/shooting/data/shootingRepository';
import { useWorkoutRepository } from '@/features/workouts/data/workoutRepository';
import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { usePlanRepository } from '../data/planRepository';
import {
  addDays,
  bucketActivity,
  buildWeek,
  startOfDay,
  weekdayOf,
  type PlanItem,
} from '../domain/plan';
import { usePlanLabels } from './labels';
import { PlanItemRow } from './PlanItemRow';

type Props = {
  /** Called when the player taps an item; Home starts (or resumes) the matching session. */
  onStart: (item: PlanItem) => void;
};

/** Home card: today's items of the active plan with progress so far. Shows nothing without an active plan. */
export function TodayPlan({ onStart }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = usePlanLabels();
  const plans = usePlanRepository();
  const workouts = useWorkoutRepository();
  const shooting = useShootingRepository();

  const load = useCallback(async () => {
    const plan = await plans.getActivePlan();
    if (!plan) return null;
    const now = new Date();
    const from = startOfDay(now).toISOString();
    const to = addDays(startOfDay(now), 1).toISOString();
    const [sets, shots] = await Promise.all([
      workouts.setsBetween(from, to),
      shooting.shotsBetween(from, to),
    ]);
    // Only today's logs were fetched, so only today's entry of the week carries progress.
    const week = buildWeek(plan.items, bucketActivity(sets, shots), now);
    return { planName: plan.name, today: week[weekdayOf(now) - 1] };
  }, [plans, workouts, shooting]);
  const { state, reload } = useLoad(load);

  if (state.status === 'loading') return null;
  if (state.status === 'error')
    return (
      <View style={styles.card}>
        <InlineError message={t('plans.loadError')} />
        <Button label={t('common.retry')} variant="secondary" onPress={reload} />
      </View>
    );
  if (state.data === null) return null;

  const { planName, today } = state.data;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.textMuted }]}>
        {t('plans.todayHeading', { plan: planName })}
      </Text>
      {today.items.length === 0 ? (
        <Text style={{ color: theme.textMuted }}>{t('plans.restDay')}</Text>
      ) : (
        today.items.map(({ item, progress }) => {
          const name = labels.itemName(item);
          const target = labels.target(item);
          return (
            <PlanItemRow
              key={item.id}
              title={name}
              subtitle={target}
              progress={progress ? labels.progress(item, progress) : undefined}
              complete={progress?.complete}
              accessibilityLabel={
                progress
                  ? t('plans.startItemProgress', {
                      name,
                      target,
                      progress: labels.progressSpoken(item, progress),
                    })
                  : t('plans.startItem', { name, target })
              }
              onPress={() => onStart(item)}
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, marginTop: 16 },
  heading: { fontSize: 14, fontWeight: '700' },
});
