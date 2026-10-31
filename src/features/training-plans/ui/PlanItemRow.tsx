import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/theme';

type Props = {
  title: string;
  /** What the plan asks for, e.g. "3 sets × 10 reps". */
  subtitle: string;
  /** e.g. "2 / 3 sets"; left out when progress is not tracked for this item. */
  progress?: string;
  complete?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

/** One planned exercise or shooting item, shared by the weekly schedule and Home's "today" card. */
export function PlanItemRow({
  title,
  subtitle,
  progress,
  complete,
  accessibilityLabel,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={{ color: theme.textMuted }}>{subtitle}</Text>
      </View>
      {progress ? (
        <View style={styles.side}>
          <Text style={[styles.progress, { color: complete ? theme.made : theme.textMuted }]}>
            {progress}
          </Text>
          {complete ? (
            <Text style={[styles.done, { color: theme.made }]}>{t('plans.done')}</Text>
          ) : null}
        </View>
      ) : null}
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
    gap: 12,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  side: { alignItems: 'flex-end' },
  progress: { fontSize: 15, fontWeight: '700' },
  done: { fontSize: 12, fontWeight: '800' },
});
