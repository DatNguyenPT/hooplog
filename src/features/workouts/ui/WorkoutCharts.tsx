import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/theme';

/** Narrowest drawn bar, so a small but non-zero value stays visible. */
const MIN_FRACTION = 0.03;

function widthOf(fraction: number) {
  if (fraction <= 0) return '0%' as const;
  return `${Math.round(Math.min(1, Math.max(fraction, MIN_FRACTION)) * 100)}%` as const;
}

/**
 * Thin bar echoing one set's size next to its text. The text already carries the value,
 * so the bar is hidden from screen readers.
 */
export function SetBar({ fraction }: { fraction: number }) {
  const theme = useTheme();
  return (
    <View
      testID="set-bar"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.setTrack}
    >
      <View style={[styles.setBar, { width: widthOf(fraction), backgroundColor: theme.primary }]} />
    </View>
  );
}

export type OverviewRow = { exerciseId: string; name: string; sets: number; fraction: number };

/** Sets per exercise as horizontal bars: one series, one colour, the count at the end of each row. */
export function WorkoutOverview({ rows }: { rows: readonly OverviewRow[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textMuted }]}>
        {t('workout.overviewTitle')}
      </Text>
      {rows.map((row) => (
        <View
          key={row.exerciseId}
          accessible
          accessibilityLabel={t('workout.overviewRowLabel', {
            exercise: row.name,
            sets: t('workout.setCount', { count: row.sets }),
          })}
          style={styles.row}
        >
          <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
            {row.name}
          </Text>
          <View style={styles.track}>
            <View
              style={[styles.bar, { width: widthOf(row.fraction), backgroundColor: theme.primary }]}
            />
          </View>
          <Text style={[styles.count, { color: theme.text }]}>{row.sets}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 12, gap: 8 },
  title: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  name: { width: 112, fontSize: 15 },
  track: { flex: 1, height: 14, justifyContent: 'center' },
  bar: { height: 14, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  count: { width: 28, textAlign: 'right', fontSize: 15, fontWeight: '700' },
  setTrack: { height: 6, marginTop: 4 },
  setBar: { height: 6, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
