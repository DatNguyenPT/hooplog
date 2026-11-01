import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWorkoutLabels } from '@/features/workouts/ui/labels';
import { formatPercent, formatShortDate } from '@/shared/i18n/format';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { formatWeight } from '@/shared/units';
import { useAnalyticsRepository } from '../data/analyticsRepository';
import {
  buildWeeklyStats,
  firstWeekStart,
  isEmptyProgress,
  liftRecords,
  scaleBars,
  shootingBests,
  type LiftBest,
  type SessionResults,
  type WeeklyInputs,
  type WeekStats,
} from '../domain/progress';
import { PersonalBests } from './PersonalBests';
import { WeeklyBars } from './WeeklyBars';

type ProgressData = {
  now: Date;
  inputs: WeeklyInputs;
  sessions: SessionResults[];
  lifts: LiftBest[];
};

/** Weekly charts and personal bests, all derived from the shooting and workout logs. */
export function ProgressScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const analytics = useAnalyticsRepository();

  const load = useCallback(async (): Promise<ProgressData> => {
    const now = new Date();
    const [inputs, sessions, lifts] = await Promise.all([
      analytics.weeklyInputs(firstWeekStart(now).toISOString()),
      analytics.sessionResults(),
      analytics.liftBests(),
    ]);
    return { now, inputs, sessions, lifts };
  }, [analytics]);
  const { state, reload } = useLoad(load);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('progress.title')}
      </Text>
      {state.status === 'loading' ? (
        <LoadingView />
      ) : state.status === 'error' ? (
        <ErrorView onRetry={reload} />
      ) : (
        <ProgressContent data={state.data} />
      )}
      <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const peak = (values: readonly number[]) => Math.max(0, ...values);

function ProgressContent({ data }: { data: ProgressData }) {
  const { t } = useTranslation();
  const labels = useWorkoutLabels();
  // One selected week for all three charts; until the player taps a bar it is the current week.
  const [picked, setPicked] = useState<number | null>(null);

  const weeks = useMemo(() => buildWeeklyStats(data.inputs, data.now), [data]);
  const shooting = useMemo(() => shootingBests(data.sessions), [data.sessions]);
  const lifts = useMemo(() => liftRecords(data.lifts, labels.exerciseName), [data.lifts, labels]);

  if (isEmptyProgress(weeks, shooting, lifts))
    return <EmptyView title={t('progress.emptyTitle')} hint={t('progress.emptyHint')} />;

  const selected = picked ?? weeks.length - 1;
  const week = (w: WeekStats) => t('progress.weekOf', { date: formatShortDate(w.start) });
  const sessionCounts = weeks.map((w) => w.sessions);
  const volumes = weeks.map((w) => w.volumeKg);

  const charts = [
    {
      id: 'fg',
      title: t('progress.fgTitle'),
      fractions: scaleBars(
        weeks.map((w) => w.fgPercentage),
        100,
      ),
      scaleTop: formatPercent(100),
      descriptions: weeks.map((w) =>
        w.fgPercentage === null
          ? t('progress.fgNone', { week: week(w) })
          : t('progress.fgValue', {
              week: week(w),
              fg: formatPercent(w.fgPercentage),
              made: w.made,
              attempts: w.made + w.missed,
            }),
      ),
      hasData: weeks.some((w) => w.fgPercentage !== null),
      emptyText: t('progress.fgEmpty'),
    },
    {
      id: 'sessions',
      title: t('progress.sessionsTitle'),
      fractions: scaleBars(sessionCounts),
      scaleTop: String(peak(sessionCounts)),
      descriptions: weeks.map((w) =>
        w.sessions === 0
          ? t('progress.sessionsNone', { week: week(w) })
          : t('progress.sessionsValue', { week: week(w), count: w.sessions }),
      ),
      hasData: peak(sessionCounts) > 0,
      emptyText: t('progress.sessionsEmpty'),
    },
    {
      id: 'volume',
      title: t('progress.volumeTitle'),
      fractions: scaleBars(volumes),
      scaleTop: formatWeight(peak(volumes)),
      descriptions: weeks.map((w) =>
        w.volumeKg === 0
          ? t('progress.volumeNone', { week: week(w) })
          : t('progress.volumeValue', { week: week(w), weight: formatWeight(w.volumeKg) }),
      ),
      hasData: peak(volumes) > 0,
      emptyText: t('progress.volumeEmpty'),
    },
  ];
  const axis = weeks.map((w) => formatShortDate(w.start));

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {charts.map((chart) => (
        <WeeklyBars
          key={chart.id}
          {...chart}
          labels={axis}
          selected={selected}
          onSelect={setPicked}
        />
      ))}
      <PersonalBests shooting={shooting} lifts={lifts} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  scroll: { flex: 1 },
  content: { gap: 12, paddingBottom: 12 },
});
