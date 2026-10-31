import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useShootingRepository } from '@/features/shooting/data/shootingRepository';
import { summarize, type ShotResult } from '@/features/shooting/domain/stats';
import { formatDateTime, formatPercent } from '@/shared/i18n/format';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';

export default function ShootingSession() {
  const { t } = useTranslation();
  const theme = useTheme();
  const repo = useShootingRepository();
  const { id } = useLocalSearchParams<{ id: string }>();

  const load = useCallback(() => repo.getSession(id), [repo, id]);
  const { state, reload } = useLoad(load);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } finally {
      reload();
    }
  };

  const session = state.status === 'ready' ? state.data : null;
  const summary = useMemo(() => summarize(session?.results ?? []), [session]);

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
  if (!session) {
    return (
      <Screen>
        <EmptyView title={t('session.notFound')} />
        <Button label={t('session.done')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const active = session.endedAt === null;
  const recent = session.results.slice(-10).reverse();

  return (
    <Screen>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {active ? t('session.title') : t('session.summaryTitle')}
      </Text>
      <Text style={{ color: theme.textMuted }}>{formatDateTime(session.startedAt)}</Text>

      <View
        accessible
        accessibilityLabel={`${t('session.fg')} ${formatPercent(summary.fgPercentage)}, ${t('session.madeCount')} ${summary.made}, ${t('session.missedCount')} ${summary.missed}`}
        style={[styles.hero, { backgroundColor: theme.surface }]}
      >
        <Text style={[styles.heroLabel, { color: theme.textMuted }]}>{t('session.fg')}</Text>
        <Text style={[styles.heroValue, { color: theme.text }]}>
          {formatPercent(summary.fgPercentage)}
        </Text>
        <Text style={{ color: theme.textMuted }}>
          {summary.made} / {summary.attempts}
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat label={t('session.madeCount')} value={summary.made} />
        <Stat label={t('session.missedCount')} value={summary.missed} />
        <Stat
          label={active ? t('session.streak') : t('session.bestStreak')}
          value={active ? summary.currentMakeStreak : summary.longestMakeStreak}
        />
      </View>

      {recent.length > 0 ? (
        <View accessible accessibilityLabel={t('session.recentShots')} style={styles.dots}>
          {recent.map((r, i) => (
            <Dot key={i} result={r} />
          ))}
        </View>
      ) : null}

      {active ? (
        <>
          <View style={styles.actions}>
            <Button
              label={t('session.made')}
              variant="made"
              fontSize={28}
              style={styles.big}
              onPress={() => run(() => repo.addShot(session.id, 'made'))}
            />
            <Button
              label={t('session.missed')}
              variant="missed"
              fontSize={28}
              style={styles.big}
              onPress={() => run(() => repo.addShot(session.id, 'missed'))}
            />
          </View>
          <View style={styles.footer}>
            <Button
              label={t('session.undoShort')}
              accessibilityLabel={t('session.undo')}
              variant="secondary"
              disabled={session.results.length === 0}
              onPress={() => run(() => repo.undoLastShot(session.id))}
              style={styles.flex}
            />
            <Button
              label={t('session.end')}
              variant="secondary"
              onPress={async () => {
                await repo.endSession(session.id);
                router.replace('/');
              }}
              style={styles.flex}
            />
          </View>
        </>
      ) : (
        <Button label={t('session.done')} onPress={() => router.replace('/')} />
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={styles.stat}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={{ color: theme.textMuted }}>{label}</Text>
    </View>
  );
}

function Dot({ result }: { result: ShotResult }) {
  const theme = useTheme();
  const color = result === 'made' ? theme.made : result === 'missed' ? theme.missed : theme.border;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  hero: { borderRadius: 18, padding: 16, alignItems: 'center' },
  heroLabel: { fontSize: 14, fontWeight: '700' },
  heroValue: { fontSize: 64, fontWeight: '800' },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { fontSize: 28, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  actions: { flex: 1, gap: 12, minHeight: 200 },
  big: { flex: 1, borderRadius: 20 },
  footer: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
  flex: { flex: 1 },
});
