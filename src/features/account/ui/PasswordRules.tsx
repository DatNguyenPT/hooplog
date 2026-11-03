import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/theme';
import { MIN_PASSWORD_LENGTH, passwordChecks } from '../domain/account';

/** What a new password needs, ticked off as it is typed. Each line also says in words whether it is met. */
export function PasswordRules({ password }: { password: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const checks = passwordChecks(password);
  const rules = [
    {
      id: 'length',
      met: checks.longEnough,
      text: t('account.rule.length', { min: MIN_PASSWORD_LENGTH }),
    },
    { id: 'letter', met: checks.hasLetter, text: t('account.rule.letter') },
    { id: 'number', met: checks.hasNumber, text: t('account.rule.number') },
  ];

  return (
    <View style={styles.list}>
      {rules.map(({ id, met, text }) => (
        <View
          key={id}
          accessible
          accessibilityLabel={t(met ? 'account.rule.met' : 'account.rule.notMet', { rule: text })}
          style={styles.row}
        >
          <Text style={[styles.mark, { color: met ? theme.made : theme.textMuted }]}>
            {met ? '✓' : '○'}
          </Text>
          <Text style={[styles.text, { color: met ? theme.text : theme.textMuted }]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { minWidth: 16, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 14 },
});
