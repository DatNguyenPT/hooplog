import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatPercent } from '@/shared/i18n/format';
import { useTheme } from '@/shared/ui/theme';
import { formatWeight } from '@/shared/units';
import type { Totals } from '../domain/progress';
import { StatRow } from './StatRow';

/** The totals for the period on screen. A single day has no bars, so for a day this is all there is. */
export function PeriodSummary({ totals }: { totals: Totals }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const attempts = totals.made + totals.missed;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textMuted }]}>
        {t('progress.summaryTitle')}
      </Text>
      <StatRow
        name={t('progress.fgLabel')}
        value={formatPercent(totals.fgPercentage)}
        detail={
          attempts > 0
            ? t('progress.fgSummary', { count: attempts, made: totals.made })
            : t('progress.fgSummaryNone')
        }
      />
      <StatRow name={t('progress.sessionsLabel')} value={String(totals.sessions)} />
      <StatRow name={t('progress.volumeLabel')} value={formatWeight(totals.volumeKg)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 12, gap: 12 },
  title: { fontSize: 14, fontWeight: '600' },
});
