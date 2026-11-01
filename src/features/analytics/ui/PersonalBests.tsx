import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatDate, formatPercent } from '@/shared/i18n/format';
import { useTheme } from '@/shared/ui/theme';
import { formatWeight } from '@/shared/units';
import { MIN_ATTEMPTS_FOR_BEST, type LiftRecord, type ShootingBests } from '../domain/progress';

type Props = { shooting: ShootingBests; lifts: readonly LiftRecord[] };

/** All-time bests: the shooting session with the best FG%, the longest make streak and each lift's record. */
export function PersonalBests({ shooting, lifts }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const best = shooting.bestSession;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textMuted }]}>
        {t('progress.bestsTitle')}
      </Text>
      <BestRow
        name={t('progress.bestSession')}
        value={best ? formatPercent(best.fgPercentage) : t('progress.noValue')}
        detail={
          best
            ? t('progress.bestSessionDetail', {
                made: best.made,
                attempts: best.attempts,
                date: formatDate(best.startedAt),
              })
            : t('progress.bestSessionNone', { count: MIN_ATTEMPTS_FOR_BEST })
        }
      />
      <BestRow
        name={t('progress.streak')}
        value={
          shooting.longestMakeStreak > 0
            ? String(shooting.longestMakeStreak)
            : t('progress.noValue')
        }
        detail={t('progress.streakDetail')}
      />
      <Text accessibilityRole="header" style={[styles.subtitle, { color: theme.textMuted }]}>
        {t('progress.liftsTitle')}
      </Text>
      {lifts.length === 0 ? (
        <Text style={{ color: theme.textMuted }}>{t('progress.liftsNone')}</Text>
      ) : (
        lifts.map((lift) => (
          <BestRow
            key={lift.exerciseId}
            name={lift.name}
            value={
              lift.kind === 'weight'
                ? formatWeight(lift.weightKg)
                : t('progress.liftReps', { count: lift.reps })
            }
          />
        ))
      )}
    </View>
  );
}

function BestRow({ name, value, detail }: { name: string; value: string; detail?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={
        detail
          ? t('progress.rowLabelDetail', { name, value, detail })
          : t('progress.rowLabel', { name, value })
      }
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
        {detail ? <Text style={[styles.detail, { color: theme.textMuted }]}>{detail}</Text> : null}
      </View>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 12, gap: 12 },
  title: { fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  value: { fontSize: 22, fontWeight: '800' },
});
