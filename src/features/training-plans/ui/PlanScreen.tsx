import { router } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useShootingRepository } from '@/features/shooting/data/shootingRepository';
import { useWorkoutRepository } from '@/features/workouts/data/workoutRepository';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { usePlanRepository } from '../data/planRepository';
import {
  addDays,
  bucketActivity,
  buildWeek,
  startOfWeek,
  weekSummary,
  type DayActivity,
} from '../domain/plan';
import { PlanDaySection } from './PlanDaySection';
import { PlanNameForm } from './PlanNameForm';

type Props = { id: string };

/** One plan's Monday-to-Sunday schedule. The active plan also shows this week's progress from the logs. */
export function PlanScreen({ id }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const plans = usePlanRepository();
  const workouts = useWorkoutRepository();
  const shooting = useShootingRepository();

  const load = useCallback(async () => {
    const plan = await plans.getPlan(id);
    if (!plan) return null;
    const now = new Date();
    let activity: Map<string, DayActivity> | null = null;
    if (plan.isActive) {
      const monday = startOfWeek(now);
      const from = monday.toISOString();
      const to = addDays(monday, 7).toISOString();
      const [sets, shots] = await Promise.all([
        workouts.setsBetween(from, to),
        shooting.shotsBetween(from, to),
      ]);
      activity = bucketActivity(sets, shots);
    }
    const otherNames = (await plans.listPlans()).filter((p) => p.id !== id).map((p) => p.name);
    return { plan, week: buildWeek(plan.items, activity, now), otherNames };
  }, [id, plans, workouts, shooting]);
  const { state, reload } = useLoad(load);
  const [renaming, setRenaming] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const busy = useRef(false);

  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setActionFailed(false);
    try {
      await action();
    } catch {
      setActionFailed(true);
    } finally {
      busy.current = false;
    }
  };

  if (state.status === 'loading')
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  if (state.status === 'error')
    return (
      <Screen>
        <ErrorView onRetry={reload} />
      </Screen>
    );
  if (state.data === null)
    return (
      <Screen>
        <EmptyView title={t('plans.notFound')} />
      </Screen>
    );

  const { plan, week, otherNames } = state.data;
  const { done, total } = weekSummary(week);

  const activate = () =>
    run(async () => {
      await plans.setActive(plan.id);
      reload();
    });

  const remove = () =>
    run(async () => {
      await plans.deletePlan(plan.id);
      router.back();
    });

  const confirmRemove = () =>
    Alert.alert(t('plans.deleteTitle', { name: plan.name }), t('plans.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plans.delete'), style: 'destructive', onPress: () => void remove() },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {renaming ? (
          <PlanNameForm
            initial={plan.name}
            otherNames={otherNames}
            submitLabel={t('plans.renameSave')}
            onSubmit={async (name) => {
              await plans.renamePlan(plan.id, name);
              setRenaming(false);
              reload();
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {plan.name}
            </Text>
            {plan.isActive ? (
              <Text style={[styles.badge, { color: theme.made }]}>{t('plans.active')}</Text>
            ) : null}
          </View>
        )}
        {plan.isActive && total > 0 ? (
          <Text style={{ color: theme.textMuted }}>{t('plans.weekSummary', { done, total })}</Text>
        ) : null}
        {total === 0 ? (
          <Text style={{ color: theme.textMuted }}>{t('plans.weekEmpty')}</Text>
        ) : null}
        {actionFailed ? <InlineError message={t('plans.actionError')} /> : null}
        {week.map((day) => (
          <PlanDaySection key={day.weekday} planId={plan.id} day={day} />
        ))}
        <View style={styles.footer}>
          {plan.isActive ? null : <Button label={t('plans.setActive')} onPress={activate} />}
          {renaming ? null : (
            <Button
              label={t('plans.rename')}
              variant="secondary"
              onPress={() => setRenaming(true)}
            />
          )}
          <Button label={t('plans.delete')} variant="secondary" onPress={confirmRemove} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  content: { gap: 16, paddingBottom: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  title: { flexShrink: 1, fontSize: 28, fontWeight: '800' },
  badge: { fontSize: 13, fontWeight: '800' },
  footer: { gap: 8, marginTop: 8 },
});
