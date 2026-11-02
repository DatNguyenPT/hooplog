import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  confirmError,
  emailError,
  newPasswordError,
  signInPasswordError,
  validateSignIn,
  validateSignUp,
  type SignUpErrors,
} from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';
import { AuthField, type AuthInput } from './AuthField';
import { PasswordRules } from './PasswordRules';

type Mode = 'signIn' | 'signUp';

const EMAIL_MESSAGES = {
  required: 'account.fieldError.emailRequired',
  invalid: 'account.fieldError.emailInvalid',
} as const;
const PASSWORD_MESSAGES = {
  required: 'account.fieldError.passwordRequired',
  tooShort: 'account.fieldError.passwordTooShort',
  tooLong: 'account.fieldError.passwordTooLong',
  needsLetter: 'account.fieldError.passwordNeedsLetter',
  needsNumber: 'account.fieldError.passwordNeedsNumber',
} as const;
const CONFIRM_MESSAGES = {
  required: 'account.fieldError.confirmRequired',
  mismatch: 'account.fieldError.confirmMismatch',
} as const;

/**
 * Sign in, or create an account: one form with a switch between the two.
 *
 * A field is only scolded once the player has left it (the email) or tried to submit. From then on
 * its message is re-checked as they type, so it goes away the moment the problem is fixed.
 */
export function SignedOutForm() {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const busy = useRef(false);
  const passwordInput = useRef<AuthInput>(null);
  const confirmInput = useRef<AuthInput>(null);
  const signingUp = mode === 'signUp';

  const switchMode = () => {
    setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
    setErrors({});
    setFailure(null);
    setConfirmation('');
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    if (errors.email) setErrors((current) => ({ ...current, email: emailError(value) }));
  };

  const leaveEmail = () => {
    // An empty field is left to the submit button, so tapping through the form does not nag.
    if (email.trim() !== '') setErrors((current) => ({ ...current, email: emailError(email) }));
  };

  const changePassword = (value: string) => {
    setPassword(value);
    setErrors((current) => {
      const next = { ...current };
      if (current.password) {
        next.password = signingUp ? newPasswordError(value) : signInPasswordError(value);
      }
      if (current.confirmPassword) next.confirmPassword = confirmError(value, confirmation);
      return next;
    });
  };

  const changeConfirmation = (value: string) => {
    setConfirmation(value);
    if (errors.confirmPassword) {
      setErrors((current) => ({ ...current, confirmPassword: confirmError(password, value) }));
    }
  };

  const submit = async () => {
    if (busy.current) return;
    setFailure(null);
    const checked = signingUp
      ? validateSignUp({ email, password, confirmPassword: confirmation })
      : validateSignIn({ email, password });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    busy.current = true;
    setSubmitting(true);
    try {
      if (signingUp) {
        if ((await auth.signUp(checked.value)) === 'confirmationSent') {
          setSentTo(checked.value.email);
        }
      } else {
        await auth.signIn(checked.value);
      }
      // A password is not kept around once it has been used.
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setFailure(error instanceof AccountError ? error.key : 'unknown');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  if (sentTo !== null) {
    return (
      <View style={styles.form} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
          {t('account.checkEmailTitle')}
        </Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          {t('account.checkEmailBody', { email: sentTo })}
        </Text>
        <Button
          label={t('account.backToSignIn')}
          variant="secondary"
          onPress={() => {
            setSentTo(null);
            setMode('signIn');
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {signingUp ? t('account.signUpTitle') : t('account.signInTitle')}
      </Text>
      <AuthField
        testID="account-email"
        label={t('account.emailLabel')}
        value={email}
        onChangeText={changeEmail}
        onBlur={leaveEmail}
        onSubmitEditing={() => passwordInput.current?.focus()}
        submitBehavior="submit"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        error={errors.email ? t(EMAIL_MESSAGES[errors.email]) : null}
      />
      <View style={styles.group}>
        <AuthField
          inputRef={passwordInput}
          testID="account-password"
          label={t('account.passwordLabel')}
          value={password}
          onChangeText={changePassword}
          onSubmitEditing={signingUp ? () => confirmInput.current?.focus() : submit}
          submitBehavior={signingUp ? 'submit' : undefined}
          secureTextEntry={!showPassword}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          textContentType={signingUp ? 'newPassword' : 'password'}
          returnKeyType={signingUp ? 'next' : 'done'}
          error={
            errors.password
              ? t(PASSWORD_MESSAGES[errors.password], {
                  min: MIN_PASSWORD_LENGTH,
                  max: MAX_PASSWORD_BYTES,
                })
              : null
          }
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showPassword ? t('account.hidePassword') : t('account.showPassword')
              }
              onPress={() => setShowPassword((shown) => !shown)}
              style={styles.toggle}
            >
              <Text style={[styles.toggleText, { color: theme.primary }]}>
                {showPassword ? t('account.hide') : t('account.show')}
              </Text>
            </Pressable>
          }
        />
        {signingUp ? <PasswordRules password={password} /> : null}
      </View>
      {signingUp ? (
        <AuthField
          inputRef={confirmInput}
          testID="account-confirm-password"
          label={t('account.confirmPasswordLabel')}
          value={confirmation}
          onChangeText={changeConfirmation}
          onSubmitEditing={submit}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          error={errors.confirmPassword ? t(CONFIRM_MESSAGES[errors.confirmPassword]) : null}
        />
      ) : null}
      {failure ? <InlineError message={t(`account.error.${failure}`)} /> : null}
      <Button
        label={signingUp ? t('account.signUp') : t('account.signIn')}
        onPress={submit}
        disabled={submitting}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={signingUp ? t('account.goToSignIn') : t('account.goToSignUp')}
        onPress={switchMode}
        style={styles.link}
      >
        <Text style={[styles.linkText, { color: theme.primary }]}>
          {signingUp ? t('account.goToSignIn') : t('account.goToSignUp')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  group: { gap: 8 },
  heading: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  toggle: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  toggleText: { fontSize: 16, fontWeight: '700' },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 16, fontWeight: '600' },
});
