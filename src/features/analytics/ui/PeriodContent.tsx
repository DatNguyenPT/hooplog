import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useWorkoutLabels } from '@/features/workouts/ui/labels';
import {
  formatDayOfMonth,
  formatPercent,
  formatShortDate,
  formatWeekday,
  formatWeekdayDate,
} from '@/shared/i18n/format';
import { EmptyView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { formatWeight } from '@/shared/units';
import { defaultBar, type PeriodKind, type PeriodLayout } from '../domain/period';
import {
  buildBucketStats,
  hasActivity,
  hasNoBests,
  liftRecords,
  scaleBars,
  shootingBests,
  sumStats,
  type BucketStats,
  type LiftBest,
  type PeriodInputs,
  type SessionResults,
} from '../domain/progress';
import { PeriodBars } from './PeriodBars';
import { PeriodSummary } from './PeriodSummary';
import { PersonalBests } from './PersonalBests';

type ChartKind = Exclude<PeriodKind, 'day'>;

/** How each chart's x-axis is labelled; a week fits a weekday under every bar, a month only some dates. */
const AXIS: Record<ChartKind, { label: (date: Date) => string; every: number }> = {
  week: { label: formatWeekday, every: 1 },
  month: { label: formatDayOfMonth, every: 5 },
  trend: { label: formatShortDate, every: 2 },
};

const peak = (values: readonly number[]) => Math.max(0, ...values);

type Props = {
  kind: PeriodKind;
  layout: PeriodLayout;
  /** For choosing the bar that holds today. */
  now: Date;
  /** Logs inside the period. */
  inputs: PeriodInputs;
  /** All-time data for the personal bests. */
  sessions: SessionResults[];
  lifts: LiftBest[];
};

/**
 * What the screen shows for one period: totals, charts (not for a single day) and the all-time bests.
 * With nothing logged yet it shows the empty state; with only this period quiet, a short note.
 */
export function PeriodContent({ kind, layout, now, inputs, sessions, lifts: liftBests }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = useWorkoutLabels();

  const buckets = useMemo(() => buildBucketStats(inputs, layout), [inputs, layout]);
  const totals = useMemo(() => sumStats(buckets), [buckets]);
  const shooting = useMemo(() => shootingBests(sessions), [sessions]);
  const lifts = useMemo(() => liftRecords(liftBests, labels.exerciseName), [liftBests, labels]);

  const quiet = !hasActivity(totals);
  if (quiet && hasNoBests(shooting, lifts))
    return <EmptyView title={t('progress.emptyTitle')} hint={t('progress.emptyHint')} />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {quiet ? (
        <View style={[styles.note, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.textMuted }}>{t('progress.periodEmpty')}</Text>
        </View>
      ) : (
        <>
          <PeriodSummary totals={totals} />
          {kind !== 'day' ? (
            <PeriodCharts kind={kind} layout={layout} buckets={buckets} now={now} />
          ) : null}
        </>
      )}
      <PersonalBests shooting={shooting} lifts={lifts} />
    </ScrollView>
  );
}

type ChartsProps = { kind: ChartKind; layout: PeriodLayout; buckets: BucketStats[]; now: Date };

/** Field goal %, sessions and weight lifted per bar, sharing one selected bar. */
function PeriodCharts({ kind, layout, buckets, now }: ChartsProps) {
  const { t } = useTranslation();
  // Until the player taps a bar it is today's, or the latest one with something in it.
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? defaultBar(layout, now, buckets.map(hasActivity));

  const context = layout.unit;
  const when = (bucket: BucketStats) =>
    layout.unit === 'week'
      ? t('progress.weekOf', { date: formatShortDate(bucket.start) })
      : formatWeekdayDate(bucket.start);
  const sessionCounts = buckets.map((b) => b.sessions);
  const volumes = buckets.map((b) => b.volumeKg);

  const charts = [
    {
      id: 'fg',
      title: t('progress.fgTitle', { context }),
      fractions: scaleBars(
        buckets.map((b) => b.fgPercentage),
        100,
      ),
      scaleTop: formatPercent(100),
      descriptions: buckets.map((b) =>
        b.fgPercentage === null
          ? t('progress.fgNone', { when: when(b) })
          : t('progress.fgValue', {
              when: when(b),
              fg: formatPercent(b.fgPercentage),
              made: b.made,
              attempts: b.made + b.missed,
            }),
      ),
      hasData: buckets.some((b) => b.fgPercentage !== null),
      emptyText: t('progress.fgEmpty'),
    },
    {
      id: 'sessions',
      title: t('progress.sessionsTitle', { context }),
      fractions: scaleBars(sessionCounts),
      scaleTop: String(peak(sessionCounts)),
      descriptions: buckets.map((b) =>
        b.sessions === 0
          ? t('progress.sessionsNone', { when: when(b) })
          : t('progress.sessionsValue', { when: when(b), count: b.sessions }),
      ),
      hasData: peak(sessionCounts) > 0,
      emptyText: t('progress.sessionsEmpty'),
    },
    {
      id: 'volume',
      title: t('progress.volumeTitle', { context }),
      fractions: scaleBars(volumes),
      scaleTop: formatWeight(peak(volumes)),
      descriptions: buckets.map((b) =>
        b.volumeKg === 0
          ? t('progress.volumeNone', { when: when(b) })
          : t('progress.volumeValue', { when: when(b), weight: formatWeight(b.volumeKg) }),
      ),
      hasData: peak(volumes) > 0,
      emptyText: t('progress.volumeEmpty'),
    },
  ];
  const axis = AXIS[kind];
  const axisLabels = buckets.map((b) => axis.label(b.start));

  return (
    <>
      {charts.map((chart) => (
        <PeriodBars
          key={chart.id}
          {...chart}
          labels={axisLabels}
          labelEvery={axis.every}
          selected={selected}
          onSelect={setPicked}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: 12, paddingBottom: 12 },
  note: { borderRadius: 16, padding: 12 },
});
