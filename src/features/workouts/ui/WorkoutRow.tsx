import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatDateTime } from '@/shared/i18n/format';
import { formatDuration, formatWeight } from '@/shared/units';
import { useTheme } from '@/shared/ui/theme';
import type { WorkoutListItem } from '../data/workoutRepository';

/** One recent-activity row for a workout; opens the live screen (open workout) or the summary (ended). */
export function WorkoutRow({ item }: { item: WorkoutListItem }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { sets, totalVolumeKg, durationS } = item.summary;
  const summary =
    totalVolumeKg > 0
      ? t('home.workoutSetsVolume', { count: sets, volume: formatWeight(totalVolumeKg) })
      : t('home.workoutSets', { count: sets });
  const date = formatDateTime(item.startedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.workoutRowLabel', {
        date,
        summary: item.endedAt === null ? t('home.inProgress') : summary,
      })}
      onPress={() => router.push(`/workout/${item.id}`)}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]}>{date}</Text>
        <Text style={{ color: theme.textMuted }}>
          {item.endedAt === null ? t('home.inProgress') : summary}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.kind, { color: theme.textMuted }]}>{t('home.kindWorkout')}</Text>
        {durationS !== null ? (
          <Text style={[styles.duration, { color: theme.text }]}>{formatDuration(durationS)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  side: { alignItems: 'flex-end' },
  kind: { fontSize: 12, fontWeight: '700' },
  duration: { fontSize: 20, fontWeight: '800' },
});
