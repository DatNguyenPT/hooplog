import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/theme';

/** Shown above the sign-in form right after an account was deleted, so the player knows it worked. */
export function DeletedNotice() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: theme.surface }]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('account.deletedTitle')}
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>{t('account.deletedBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
});
