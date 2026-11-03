import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/shared/ui/theme';

/** A short confirmation that something worked, announced by screen readers when it appears. */
export function Notice({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: theme.surface }]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
});
