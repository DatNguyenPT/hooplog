import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Section';
import { ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { isEmptySummary, summaryEntries, type DataSummary } from '../domain/backup';
import { useDataActions, type Notice } from './useDataActions';
import { useDataSummary } from './useDataSummary';

/** What is saved on the phone, with the ways to back it up, restore it or delete it. */
export function DataScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { state, reload } = useDataSummary();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('data.title')}
      </Text>
      {state.status === 'loading' ? (
        <LoadingView />
      ) : state.status === 'error' ? (
        <ErrorView onRetry={reload} />
      ) : (
        <DataContent summary={state.data} reload={reload} />
      )}
    </SafeAreaView>
  );
}

function DataContent({ summary, reload }: { summary: DataSummary; reload: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { working, notice, exportBackup, chooseBackup, confirmDelete } = useDataActions(
    summary,
    reload,
  );
  const empty = isEmptySummary(summary);

  return (
    <>
      {/* Above the scrolling part, so the result of a tap is seen wherever the player tapped. */}
      <Feedback working={working} notice={notice} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.body, { color: theme.textMuted }]}>{t('data.intro')}</Text>

        <Section title={t('data.onPhoneTitle')}>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {empty ? (
              <Text style={[styles.body, { color: theme.textMuted }]}>
                {t('data.nothingSaved')}
              </Text>
            ) : (
              summaryEntries(summary).map(({ key, count }) => (
                <Text key={key} style={[styles.line, { color: theme.text }]}>
                  {t(`data.count.${key}`, { count })}
                </Text>
              ))
            )}
          </View>
        </Section>

        <Section title={t('data.backupTitle')}>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('data.backupBody')}</Text>
          <Button label={t('data.export')} onPress={exportBackup} disabled={working || empty} />
        </Section>

        <Section title={t('data.restoreTitle')}>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('data.restoreBody')}</Text>
          <Button
            label={t('data.restore')}
            variant="secondary"
            onPress={chooseBackup}
            disabled={working}
          />
        </Section>

        <Section title={t('data.deleteTitle')}>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('data.deleteBody')}</Text>
          <Button
            label={t('data.delete')}
            variant="missed"
            onPress={confirmDelete}
            disabled={working}
          />
        </Section>
      </ScrollView>
    </>
  );
}

/** Shows that something is happening, then how it ended. */
function Feedback({ working, notice }: { working: boolean; notice: Notice | null }) {
  const { t } = useTranslation();
  if (working) return <Status message={t('data.working')} />;
  if (!notice) return null;
  if (notice.type === 'failed') return <InlineError message={t(`data.error.${notice.key}`)} />;
  return <Status message={t(notice.type === 'exported' ? 'data.exported' : 'data.restored')} />;
}

function Status({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityLiveRegion="polite" style={[styles.status, { color: theme.textMuted }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  scroll: { flex: 1 },
  content: { gap: 24, paddingBottom: 16 },
  body: { fontSize: 16, lineHeight: 24 },
  card: { borderRadius: 14, padding: 14, gap: 4 },
  line: { fontSize: 16, fontWeight: '600' },
  status: { fontSize: 14, fontWeight: '600' },
});
