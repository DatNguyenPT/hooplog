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
import { CONFIRM_MESSAGES, EMAIL_MESSAGES, PASSWORD_MESSAGES } from './fieldMessages';
import { LinkButton } from './LinkButton';
import { Notice } from './Notice';
import { PasswordRules } from './PasswordRules';
import { PasswordToggle } from './PasswordToggle';

type Mode = 'signIn' | 'signUp';

type Props = {
  deleted?: boolean;
  /** The email to start with, such as the one typed before a password reset was started. */
  initialEmail?: string;
  /** Called when the player asks to reset a forgotten password, with the email typed so far. */
  onForgotPassword: (email: string) => void;
};

/**
 * Sign in, or create an account: one form with a switch between the two.
 *
 * A field is only scolded once the player has left it (the email) or tried to submit. From then on
 * its message is re-checked as they type, so it goes away the moment the problem is fixed.
 *
 * `deleted` puts a short "your account was deleted" notice above the form, for the player who has
 * just done that and landed back here.
 */
export function SignedOutForm({ deleted = false, initialEmail = '', onForgotPassword }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState(initialEmail);
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
      {deleted ? (
        <Notice title={t('account.deletedTitle')} body={t('account.deletedBody')} />
      ) : null}
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
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
            />
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
      {signingUp ? null : (
        <LinkButton
          label={t('account.forgotPassword')}
          disabled={submitting}
          onPress={() => onForgotPassword(email)}
        />
      )}
      <LinkButton
        label={signingUp ? t('account.goToSignIn') : t('account.goToSignUp')}
        onPress={switchMode}
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
