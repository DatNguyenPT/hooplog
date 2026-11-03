import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  emailError,
  resendWaitSeconds,
  validateRecovery,
  type RecoveryErrors,
  type RecoveryForm as RecoveryFields,
} from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';
import { AuthField, type AuthInput } from './AuthField';
import {
  CODE_MESSAGES,
  CONFIRM_MESSAGES,
  EMAIL_MESSAGES,
  PASSWORD_MESSAGES,
} from './fieldMessages';
import { LinkButton } from './LinkButton';
import { PasswordRules } from './PasswordRules';
import { PasswordToggle } from './PasswordToggle';

/** Failures that belong to one field, so they are shown there and go once it is retyped. */
const FIELD_FAILURES: readonly AccountErrorKey[] = ['invalidCode', 'weakPassword'];

type Props = {
  initialEmail: string;
  /** Called once the new password is saved. By then the player is signed in. */
  onDone: () => void;
  /** Called when the player gives up, with the email as they left it. */
  onCancel: (email: string) => void;
};

/**
 * Choose a new password with a code sent by email: first ask for the code, then enter it with the
 * new password. It is one component, kept on screen by its parent, because the code signs the player
 * in the moment it is right, and that must not swap the form away before the password is saved.
 *
 * Whether the address has an account is never told: the second step reads the same either way.
 */
export function RecoveryForm({ initialEmail, onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [fields, setFields] = useState<RecoveryFields>({
    email: initialEmail,
    code: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<RecoveryErrors>({});
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const [working, setWorking] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const busy = useRef(false);
  const passwordInput = useRef<AuthInput>(null);
  const confirmInput = useRef<AuthInput>(null);

  // A new code may be asked for once a minute; count the seconds down while the player waits.
  const wait = sentAt === null ? 0 : resendWaitSeconds(sentAt, now);
  const waiting = wait > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const edit = (patch: Partial<RecoveryFields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    // A message goes as soon as its field is fixed, but no new one appears while the player types.
    const checked = validateRecovery(next);
    const found = checked.ok ? {} : checked.errors;
    setErrors((current) => ({
      email: current.email ? found.email : undefined,
      code: current.code ? found.code : undefined,
      password: current.password ? found.password : undefined,
      confirmPassword: current.confirmPassword ? found.confirmPassword : undefined,
    }));
    setFailure((current) => (current && FIELD_FAILURES.includes(current) ? null : current));
  };

  const run = async (task: () => Promise<void>) => {
    busy.current = true;
    setWorking(true);
    try {
      await task();
    } catch (error) {
      setFailure(error instanceof AccountError ? error.key : 'unknown');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  /** True when the email is fine to use; otherwise says what is wrong with it. */
  const emailOk = () => {
    const problem = emailError(fields.email);
    setErrors(problem ? { email: problem } : {});
    return !problem;
  };

  const sendCode = async () => {
    if (busy.current) return;
    setFailure(null);
    if (!emailOk()) return;
    await run(async () => {
      await auth.sendRecoveryCode(fields.email.trim());
      const at = Date.now();
      setSentAt(at);
      setNow(at);
      setStage('code');
    });
  };

  /** For a code asked for earlier, such as before the app was closed: nothing is sent. */
  const haveCode = () => {
    setFailure(null);
    if (!emailOk()) return;
    setSentAt(null);
    setStage('code');
  };

  const changeEmail = () => {
    setFailure(null);
    setErrors({});
    setFields((current) => ({ ...current, code: '' }));
    setStage('email');
  };

  const finish = async () => {
    if (busy.current) return;
    setFailure(null);
    const checked = validateRecovery(fields);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    await run(async () => {
      await auth.completeRecovery(checked.value);
      onDone();
    });
  };

  const otherFailure = failure && !FIELD_FAILURES.includes(failure) ? failure : null;
  const failureText = otherFailure ? (
    <InlineError message={t(`account.error.${otherFailure}`)} />
  ) : null;
  const leave = (
    <LinkButton
      label={t('account.backToSignIn')}
      disabled={working}
      onPress={() => onCancel(fields.email)}
    />
  );
  const title = (
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
      {t('account.recoveryTitle')}
    </Text>
  );

  if (stage === 'email') {
    return (
      <View style={styles.form}>
        {title}
        <Text style={[styles.body, { color: theme.textMuted }]}>
          {t('account.recoveryEmailBody')}
        </Text>
        <AuthField
          testID="recovery-email"
          label={t('account.emailLabel')}
          value={fields.email}
          onChangeText={(value) => edit({ email: value })}
          onSubmitEditing={sendCode}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          error={errors.email ? t(EMAIL_MESSAGES[errors.email]) : null}
        />
        {failureText}
        <Button label={t('account.sendCode')} disabled={working} onPress={sendCode} />
        <LinkButton label={t('account.haveCode')} disabled={working} onPress={haveCode} />
        {leave}
      </View>
    );
  }

  const limits = { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES };
  const codeProblem = errors.code
    ? t(CODE_MESSAGES[errors.code])
    : failure === 'invalidCode'
      ? t('account.error.invalidCode')
      : null;
  const passwordProblem = errors.password
    ? t(PASSWORD_MESSAGES[errors.password], limits)
    : failure === 'weakPassword'
      ? t('account.error.weakPassword')
      : null;

  return (
    <View style={styles.form}>
      {title}
      <View accessibilityLiveRegion="polite">
        <Text style={[styles.body, { color: theme.textMuted }]}>
          {t('account.recoveryCodeBody', { email: fields.email.trim() })}
        </Text>
      </View>
      <AuthField
        testID="recovery-code"
        label={t('account.codeLabel')}
        value={fields.code}
        onChangeText={(value) => edit({ code: value })}
        onSubmitEditing={() => passwordInput.current?.focus()}
        submitBehavior="submit"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="next"
        error={codeProblem}
      />
      <View style={styles.group}>
        <AuthField
          inputRef={passwordInput}
          testID="recovery-password"
          label={t('account.newPasswordLabel')}
          value={fields.password}
          onChangeText={(value) => edit({ password: value })}
          onSubmitEditing={() => confirmInput.current?.focus()}
          submitBehavior="submit"
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          error={passwordProblem}
          trailing={
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
            />
          }
        />
        <PasswordRules password={fields.password} />
      </View>
      <AuthField
        inputRef={confirmInput}
        testID="recovery-confirm-password"
        label={t('account.confirmNewPasswordLabel')}
        value={fields.confirmPassword}
        onChangeText={(value) => edit({ confirmPassword: value })}
        onSubmitEditing={finish}
        secureTextEntry={!showPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        error={errors.confirmPassword ? t(CONFIRM_MESSAGES[errors.confirmPassword]) : null}
      />
      {failureText}
      <Button label={t('account.savePassword')} disabled={working} onPress={finish} />
      <Button
        label={waiting ? t('account.resendCodeWait', { seconds: wait }) : t('account.resendCode')}
        variant="secondary"
        disabled={working || waiting}
        onPress={sendCode}
      />
      <LinkButton label={t('account.otherEmail')} disabled={working} onPress={changeEmail} />
      {leave}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  group: { gap: 8 },
  heading: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
});
