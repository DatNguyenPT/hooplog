import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useShootingRepository,
  type SessionListItem,
} from '@/features/shooting/data/shootingRepository';
import { fieldGoalPercentage } from '@/features/shooting/domain/stats';
import { formatDateTime, formatPercent } from '@/shared/i18n/format';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';

/** Home shows only the 50 most recent sessions; there is no paging yet (history screen comes later). */
const RECENT_SESSION_LIMIT = 50;

export default function Home() {
  const { t } = useTranslation();
  const theme = useTheme();
  const repo = useShootingRepository();

  const load = useCallback(async () => {
    const [sessions, activeId] = await Promise.all([
      repo.listSessions(RECENT_SESSION_LIMIT),
      repo.getActiveSessionId(),
    ]);
    return { sessions, activeId };
  }, [repo]);
  const { state, reload } = useLoad(load);
  const busy = useRef(false);
  const [startFailed, setStartFailed] = useState(false);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setStartFailed(false);
    try {
      const id = await repo.startOrResumeSession();
      router.push(`/shooting/${id}`);
    } catch {
      setStartFailed(true);
      reload();
    } finally {
      busy.current = false;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('home.title')}
      </Text>

      {state.status === 'loading' ? (
        <LoadingView />
      ) : state.status === 'error' ? (
        <ErrorView onRetry={reload} />
      ) : (
        <>
          <Button
            label={state.data.activeId ? t('home.resumeShooting') : t('home.startShooting')}
            onPress={start}
            style={styles.cta}
          />
          {startFailed ? <InlineError message={t('home.startError')} /> : null}
          <Text accessibilityRole="header" style={[styles.section, { color: theme.textMuted }]}>
            {t('home.recent')}
          </Text>
          {state.data.sessions.length === 0 ? (
            <EmptyView title={t('home.emptyTitle')} hint={t('home.emptyHint')} />
          ) : (
            <FlatList
              data={state.data.sessions}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <SessionRow item={item} />}
            />
          )}
        </>
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
      <Text style={[styles.rowFg, { color: theme.text }]}>{fg}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 32, fontWeight: '800', marginTop: 8, marginBottom: 16 },
  cta: { minHeight: 64 },
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
  rowFg: { fontSize: 24, fontWeight: '800' },
});
