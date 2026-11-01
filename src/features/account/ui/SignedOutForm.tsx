import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import {
  MIN_PASSWORD_LENGTH,
  validateSignIn,
  validateSignUp,
  type CredentialsErrors,
} from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';
import { AuthField } from './AuthField';

type Mode = 'signIn' | 'signUp';

const EMAIL_MESSAGES = {
  required: 'account.fieldError.emailRequired',
  invalid: 'account.fieldError.emailInvalid',
} as const;
const PASSWORD_MESSAGES = {
  required: 'account.fieldError.passwordRequired',
  tooShort: 'account.fieldError.passwordTooShort',
} as const;

/** Sign in, or create an account: one form with a switch between the two. */
export function SignedOutForm() {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<CredentialsErrors>({});
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const busy = useRef(false);

  const switchMode = () => {
    setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
    setErrors({});
    setFailure(null);
  };

  const submit = async () => {
    if (busy.current) return;
    setFailure(null);
    const checked = (mode === 'signUp' ? validateSignUp : validateSignIn)({ email, password });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    busy.current = true;
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        if ((await auth.signUp(checked.value)) === 'confirmationSent') {
          setSentTo(checked.value.email);
        }
      } else {
        await auth.signIn(checked.value);
      }
      // A password is not kept around once it has been used.
      setPassword('');
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

  const signingUp = mode === 'signUp';
  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        {signingUp ? t('account.signUpTitle') : t('account.signInTitle')}
      </Text>
      <AuthField
        testID="account-email"
        label={t('account.emailLabel')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        error={errors.email ? t(EMAIL_MESSAGES[errors.email]) : null}
      />
      <AuthField
        testID="account-password"
        label={t('account.passwordLabel')}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        secureTextEntry={!showPassword}
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        textContentType={signingUp ? 'newPassword' : 'password'}
        returnKeyType="done"
        hint={signingUp ? t('account.passwordHint', { min: MIN_PASSWORD_LENGTH }) : undefined}
        error={
          errors.password
            ? t(PASSWORD_MESSAGES[errors.password], { min: MIN_PASSWORD_LENGTH })
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
