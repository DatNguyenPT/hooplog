import { Redirect, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { needsWelcome } from '@/features/profile/domain/profile';
import { useProfile } from '@/features/profile/ui/useProfile';
import {
  useShootingRepository,
  type SessionListItem,
} from '@/features/shooting/data/shootingRepository';
import { fieldGoalPercentage } from '@/features/shooting/domain/stats';
import {
  useWorkoutRepository,
  type WorkoutListItem,
} from '@/features/workouts/data/workoutRepository';
import type { PlanItem } from '@/features/training-plans/domain/plan';
import { TodayPlan } from '@/features/training-plans/ui/TodayPlan';
import { WorkoutRow } from '@/features/workouts/ui/WorkoutRow';
import { formatDateTime, formatPercent } from '@/shared/i18n/format';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';

/** Home shows only the 50 most recent shooting sessions and workouts, each; there is no paging yet. */
const RECENT_SESSION_LIMIT = 50;

type Activity =
  | { kind: 'shooting'; startedAt: string; item: SessionListItem }
  | { kind: 'workout'; startedAt: string; item: WorkoutListItem };

export default function Home() {
  const { t } = useTranslation();
  const theme = useTheme();
  const shooting = useShootingRepository();
  const workouts = useWorkoutRepository();

  const load = useCallback(async () => {
    const [sessions, workoutList, activeShootingId, activeWorkoutId] = await Promise.all([
      shooting.listSessions(RECENT_SESSION_LIMIT),
      workouts.listSessions(RECENT_SESSION_LIMIT),
      shooting.getActiveSessionId(),
      workouts.getActiveSessionId(),
    ]);
    // ISO-8601 UTC strings sort chronologically as plain strings.
    const activity: Activity[] = [
      ...sessions.map((item): Activity => ({ kind: 'shooting', startedAt: item.startedAt, item })),
      ...workoutList.map((item): Activity => ({
        kind: 'workout',
        startedAt: item.startedAt,
        item,
      })),
    ]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, RECENT_SESSION_LIMIT);
    return { activity, activeShootingId, activeWorkoutId };
  }, [shooting, workouts]);
  const { state, reload } = useLoad(load);
  const { state: profile } = useProfile();
  const busy = useRef(false);
  const [startFailed, setStartFailed] = useState(false);

  /** `exerciseId` opens the workout with that exercise ready to log (used by the training plan). */
  const start = async (
    begin: () => Promise<string>,
    kind: 'shooting' | 'workout',
    exerciseId?: string,
  ) => {
    if (busy.current) return;
    busy.current = true;
    setStartFailed(false);
    try {
      const id = await begin();
      if (kind === 'shooting') router.push(`/shooting/${id}`);
      else router.push(exerciseId ? `/workout/${id}?exerciseId=${exerciseId}` : `/workout/${id}`);
    } catch {
      setStartFailed(true);
      reload();
    } finally {
      busy.current = false;
    }
  };

  const startPlanned = (item: PlanItem) =>
    item.kind === 'shooting'
      ? start(shooting.startOrResumeSession, 'shooting')
      : start(workouts.startOrResumeSession, 'workout', item.exercise.id);

  // First run: the welcome screen comes first. If the profile cannot be read, Home still opens.
  if (profile.status === 'ready' && needsWelcome(profile.data)) return <Redirect href="/welcome" />;
  const greetingName = profile.status === 'ready' ? profile.data.displayName : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {t('home.title')}
          </Text>
          {greetingName ? (
            <Text style={[styles.greeting, { color: theme.textMuted }]}>
              {t('home.greeting', { name: greetingName })}
            </Text>
          ) : null}
        </View>
        <Button
          label={t('home.settings')}
          variant="secondary"
          onPress={() => router.push('/settings')}
          fontSize={16}
        />
      </View>

      {state.status === 'loading' || profile.status === 'loading' ? (
        <LoadingView />
      ) : state.status === 'error' ? (
        <ErrorView onRetry={reload} />
      ) : (
        // Everything scrolls together, so a long plan day never squeezes the activity list on a small screen.
        <FlatList
          data={state.data.activity}
          keyExtractor={(a) => `${a.kind}-${a.item.id}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <Button
                label={
                  state.data.activeShootingId ? t('home.resumeShooting') : t('home.startShooting')
                }
                onPress={() => start(shooting.startOrResumeSession, 'shooting')}
                style={styles.cta}
              />
              <Button
                label={
                  state.data.activeWorkoutId ? t('home.resumeWorkout') : t('home.startWorkout')
                }
                onPress={() => start(workouts.startOrResumeSession, 'workout')}
                style={styles.cta}
              />
              {startFailed ? <InlineError message={t('home.startError')} /> : null}
              <TodayPlan onStart={startPlanned} />
              <View style={styles.links}>
                <Button
                  label={t('home.plans')}
                  variant="secondary"
                  onPress={() => router.push('/plans')}
                  style={styles.link}
                />
                <Button
                  label={t('home.progress')}
                  variant="secondary"
                  onPress={() => router.push('/progress')}
                  style={styles.link}
                />
              </View>
              <Text accessibilityRole="header" style={[styles.section, { color: theme.textMuted }]}>
                {t('home.recent')}
              </Text>
            </>
          }
          ListEmptyComponent={<EmptyView title={t('home.emptyTitle')} hint={t('home.emptyHint')} />}
          renderItem={({ item }) =>
            item.kind === 'shooting' ? (
              <SessionRow item={item.item} />
            ) : (
              <WorkoutRow item={item.item} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function SessionRow({ item }: { item: SessionListItem }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const fg = formatPercent(fieldGoalPercentage(item));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.sessionRowLabel', {
        date: formatDateTime(item.startedAt),
        made: item.made,
        attempts: item.attempts,
        fg,
      })}
      onPress={() => router.push(`/shooting/${item.id}`)}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>
          {formatDateTime(item.startedAt)}
        </Text>
        <Text style={{ color: theme.textMuted }}>
          {item.endedAt === null
            ? t('home.inProgress')
            : t('home.sessionSummary', { made: item.made, attempts: item.attempts })}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.kind, { color: theme.textMuted }]}>{t('home.kindShooting')}</Text>
        <Text style={[styles.rowFg, { color: theme.text }]}>{fg}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  headerText: { flex: 1 },
  title: { fontSize: 32, fontWeight: '800' },
  greeting: { fontSize: 16, marginTop: 2 },
  cta: { minHeight: 64, marginBottom: 8 },
  links: { flexDirection: 'row', gap: 8, marginTop: 16 },
  link: { flex: 1 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  list: { gap: 8, paddingBottom: 24 },
  row: {
    minHeight: 64,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  side: { alignItems: 'flex-end' },
  kind: { fontSize: 12, fontWeight: '700' },
  rowFg: { fontSize: 24, fontWeight: '800' },
});
