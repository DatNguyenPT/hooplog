import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import { signInPasswordError } from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';
import { AuthField } from './AuthField';
import { PasswordToggle } from './PasswordToggle';

type Props = {
  onCancel: () => void;
  /** Called once the account is gone. By then the account service has already signed this phone out. */
  onDeleted: () => void;
};

/**
 * The last step before an account is removed: what goes, what stays, and the password once more.
 * The password is what makes it deliberate, and it is checked before anything is deleted.
 */
export function DeleteAccountForm({ onCancel, onDeleted }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);

  const changePassword = (value: string) => {
    setPassword(value);
    // A message about the password goes as soon as the player starts fixing it.
    setMissing(false);
    setFailure((current) => (current === 'wrongPassword' ? null : current));
  };

  const submit = async () => {
    if (busy.current) return;
    setFailure(null);
    if (signInPasswordError(password)) {
      setMissing(true);
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      await auth.deleteAccount(password);
      onDeleted();
    } catch (error) {
      setFailure(error instanceof AccountError ? error.key : 'unknown');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const passwordProblem = missing
    ? t('account.fieldError.passwordRequired')
    : failure === 'wrongPassword'
      ? t('account.error.wrongPassword')
      : null;
  const otherFailure = failure && failure !== 'wrongPassword' ? failure : null;

  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {t('account.deleteTitle')}
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>{t('account.deleteBody')}</Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>
        {t('account.deleteConfirmHint')}
      </Text>
      <AuthField
        testID="delete-account-password"
        label={t('account.passwordLabel')}
        value={password}
        onChangeText={changePassword}
        onSubmitEditing={submit}
        secureTextEntry={!showPassword}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        error={passwordProblem}
        trailing={
          <PasswordToggle
            shown={showPassword}
            onToggle={() => setShowPassword((shown) => !shown)}
          />
        }
      />
      {otherFailure ? <InlineError message={t(`account.error.${otherFailure}`)} /> : null}
      <Button
        label={t('account.deleteConfirm')}
        variant="missed"
        disabled={working}
        onPress={submit}
      />
      <Button
        label={t('common.cancel')}
        variant="secondary"
        disabled={working}
        onPress={onCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  heading: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
});
