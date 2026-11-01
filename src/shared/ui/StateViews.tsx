import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { useTheme } from './theme';

export function LoadingView() {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel={t('common.loading')} />
    </View>
  );
}

export function ErrorView({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text style={[styles.message, { color: theme.text }]}>{message ?? t('common.error')}</Text>
      <Button label={t('common.retry')} onPress={onRetry} variant="secondary" />
    </View>
  );
}

export function InlineError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="alert" style={[styles.inline, { color: theme.missed }]}>
      {message}
    </Text>
  );
}

export function EmptyView({ title, hint }: { title: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.message, { color: theme.text }]}>{title}</Text>
      {hint ? <Text style={{ color: theme.textMuted, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, flex: 1 },
  inline: { fontSize: 14, fontWeight: '600', paddingVertical: 8 },
  message: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
});
