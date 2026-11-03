import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  validatePasswordChange,
  type PasswordChangeErrors,
  type PasswordChangeForm,
} from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';
import { AuthField, type AuthInput } from './AuthField';
import { CONFIRM_MESSAGES, PASSWORD_MESSAGES } from './fieldMessages';
import { PasswordRules } from './PasswordRules';
import { PasswordToggle } from './PasswordToggle';

/** Failures that belong to one password field, so they are shown there and go once it is retyped. */
const FIELD_FAILURES: readonly AccountErrorKey[] = [
  'wrongPassword',
  'weakPassword',
  'samePassword',
];

type Props = {
  onCancel: () => void;
  /** Called once the new password is saved. */
  onChanged: () => void;
};

/**
 * Change the password while signed in. The current password is asked for again, so a stray tap on an
 * unlocked phone cannot lock the player out; it is checked before anything is changed.
 */
export function ChangePasswordForm({ onCancel, onChanged }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [form, setForm] = useState<PasswordChangeForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const newInput = useRef<AuthInput>(null);
  const confirmInput = useRef<AuthInput>(null);

  const edit = (patch: Partial<PasswordChangeForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    // A message goes as soon as its field is fixed, but no new one appears while the player types.
    const checked = validatePasswordChange(next);
    const found = checked.ok ? {} : checked.errors;
    setErrors((current) => ({
      currentPassword: current.currentPassword ? found.currentPassword : undefined,
      newPassword: current.newPassword ? found.newPassword : undefined,
      confirmPassword: current.confirmPassword ? found.confirmPassword : undefined,
    }));
    setFailure((current) => (current && FIELD_FAILURES.includes(current) ? null : current));
  };

  const submit = async () => {
    if (busy.current) return;
    setFailure(null);
    const checked = validatePasswordChange(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    busy.current = true;
    setWorking(true);
    try {
      await auth.changePassword(checked.value);
      onChanged();
    } catch (error) {
      setFailure(error instanceof AccountError ? error.key : 'unknown');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const limits = { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES };
  const currentProblem = errors.currentPassword
    ? t(PASSWORD_MESSAGES[errors.currentPassword], limits)
    : failure === 'wrongPassword'
      ? t('account.error.wrongPassword')
      : null;
  const newProblem = errors.newPassword
    ? t(PASSWORD_MESSAGES[errors.newPassword], limits)
    : failure === 'weakPassword' || failure === 'samePassword'
      ? t(`account.error.${failure}`)
      : null;
  const otherFailure = failure && !FIELD_FAILURES.includes(failure) ? failure : null;

  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {t('account.changePasswordTitle')}
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>
        {t('account.changePasswordBody')}
      </Text>
      <AuthField
        testID="change-password-current"
        label={t('account.currentPasswordLabel')}
        value={form.currentPassword}
        onChangeText={(value) => edit({ currentPassword: value })}
        onSubmitEditing={() => newInput.current?.focus()}
        submitBehavior="submit"
        secureTextEntry={!showPassword}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
        error={currentProblem}
        trailing={
          <PasswordToggle
            shown={showPassword}
            onToggle={() => setShowPassword((shown) => !shown)}
          />
        }
      />
      <View style={styles.group}>
        <AuthField
          inputRef={newInput}
          testID="change-password-new"
          label={t('account.newPasswordLabel')}
          value={form.newPassword}
          onChangeText={(value) => edit({ newPassword: value })}
          onSubmitEditing={() => confirmInput.current?.focus()}
          submitBehavior="submit"
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          error={newProblem}
        />
        <PasswordRules password={form.newPassword} />
      </View>
      <AuthField
        inputRef={confirmInput}
        testID="change-password-confirm"
        label={t('account.confirmNewPasswordLabel')}
        value={form.confirmPassword}
        onChangeText={(value) => edit({ confirmPassword: value })}
        onSubmitEditing={submit}
        secureTextEntry={!showPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        error={errors.confirmPassword ? t(CONFIRM_MESSAGES[errors.confirmPassword]) : null}
      />
      {otherFailure ? <InlineError message={t(`account.error.${otherFailure}`)} /> : null}
      <Button label={t('account.savePassword')} disabled={working} onPress={submit} />
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
  group: { gap: 8 },
  heading: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
});
