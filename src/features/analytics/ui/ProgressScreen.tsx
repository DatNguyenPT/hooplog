import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorView, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { useAnalyticsRepository } from '../data/analyticsRepository';
import { periodKey, periodLayout, type Period } from '../domain/period';
import { PeriodContent } from './PeriodContent';
import { PeriodPicker } from './PeriodPicker';

/**
 * Totals, charts and personal bests for a day, week, month or the last eight weeks,
 * all derived from the shooting and workout logs.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const analytics = useAnalyticsRepository();

  // A week to begin with, the one that holds today.
  const [period, setPeriod] = useState<Period>(() => ({ kind: 'week', anchor: new Date() }));
  const now = new Date();
  const layout = useMemo(() => periodLayout(period), [period]);
  const key = periodKey(period);
  const fromIso = layout.from.toISOString();
  const toIso = layout.to.toISOString();

  // Personal bests are all-time, so they load once; the logs load again for each period.
  const loadBests = useCallback(async () => {
    const [sessions, lifts] = await Promise.all([
      analytics.sessionResults(),
      analytics.liftBests(),
    ]);
    return { sessions, lifts };
  }, [analytics]);
  const loadPeriod = useCallback(
    async () => ({ key, inputs: await analytics.inputsBetween(fromIso, toIso) }),
    [analytics, key, fromIso, toIso],
  );
  const bests = useLoad(loadBests);
  const logs = useLoad(loadPeriod);

  const bestsState = bests.state;
  const logsState = logs.state;
  let body: ReactNode;
  if (bestsState.status === 'error' || logsState.status === 'error') {
    body = (
      <ErrorView
        onRetry={() => {
          bests.reload();
          logs.reload();
        }}
      />
    );
  } else if (
    bestsState.status === 'loading' ||
    logsState.status === 'loading' ||
    // The logs on screen are for the period that was showing before; wait for this one's.
    logsState.data.key !== key
  ) {
    body = <LoadingView />;
  } else {
    body = (
      <PeriodContent
        // A fresh start for each period, so a tapped bar is not carried over to the next.
        key={key}
        kind={period.kind}
        layout={layout}
        now={now}
        inputs={logsState.data.inputs}
        sessions={bestsState.data.sessions}
        lifts={bestsState.data.lifts}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('progress.title')}
      </Text>
      <PeriodPicker period={period} now={now} onChange={setPeriod} />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
});
