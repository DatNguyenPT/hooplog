import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/theme';

type Props = { name: string; value: string; detail?: string };

/** One stat: its name (and an optional line under it) on the left, the value on the right. Read as one sentence. */
export function StatRow({ name, value, detail }: Props) {
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  value: { fontSize: 22, fontWeight: '800' },
});
