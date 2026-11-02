import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/theme';

/** The Show / Hide button at the end of a password field. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown ? t('account.hidePassword') : t('account.showPassword')}
      onPress={onToggle}
      style={styles.toggle}
    >
      <Text style={[styles.text, { color: theme.primary }]}>
        {shown ? t('account.hide') : t('account.show')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  text: { fontSize: 16, fontWeight: '700' },
});
