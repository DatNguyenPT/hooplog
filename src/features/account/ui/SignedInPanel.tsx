import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import type { AccountUser } from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';
import { ChangePasswordForm } from './ChangePasswordForm';
import { DeleteAccountForm } from './DeleteAccountForm';
import { Notice } from './Notice';

type Props = {
  user: AccountUser;
  /** True once the password was changed in this visit, until the player signs out. */
  passwordChanged: boolean;
  /** Called when the player has changed their password here. */
  onPasswordChanged: () => void;
  /** Called when the player has deleted their account here, once this phone is signed out. */
  onDeleted: () => void;
};

/**
 * Who is signed in, with what to do about it: change the password, sign out, or delete the
 * account.
 */
export function SignedInPanel({ user, passwordChanged, onPasswordChanged, onDeleted }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [mode, setMode] = useState<'idle' | 'changePassword' | 'delete'>('idle');
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const busy = useRef(false);

  // Once it works, the sign-out is announced by the repository and this panel is replaced.
  const signOut = async () => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setFailure(null);
    try {
      await auth.signOut();
    } catch (error) {
      setFailure(error instanceof AccountError ? error.key : 'unknown');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  return (
    <View style={styles.panel}>
      <View
        accessible
        accessibilityLabel={t('account.signedInRow', { email: user.email ?? '' })}
        style={[styles.card, { backgroundColor: theme.surface }]}
      >
        <Text style={[styles.cardLabel, { color: theme.textMuted }]}>
          {t('account.signedInAs')}
        </Text>
        <Text style={[styles.email, { color: theme.text }]}>{user.email ?? ''}</Text>
      </View>
      {mode === 'changePassword' ? (
        <ChangePasswordForm
          onCancel={() => setMode('idle')}
          onChanged={() => {
            onPasswordChanged();
            setMode('idle');
          }}
        />
      ) : null}
      {mode === 'delete' ? (
        <DeleteAccountForm onCancel={() => setMode('idle')} onDeleted={onDeleted} />
      ) : null}
      {mode === 'idle' ? (
        <>
          {passwordChanged ? (
            <Notice
              title={t('account.passwordChangedTitle')}
              body={t('account.passwordChangedBody')}
            />
          ) : null}
          {failure ? <InlineError message={t(`account.error.${failure}`)} /> : null}
          <Button
            label={t('account.changePassword')}
            variant="secondary"
            disabled={working}
            onPress={() => {
              setFailure(null);
              setMode('changePassword');
            }}
          />
          <Button
            label={t('account.signOut')}
            variant="secondary"
            disabled={working}
            onPress={() => void signOut()}
          />
          <Button
            label={t('account.deleteAccount')}
            variant="missed"
            disabled={working}
            onPress={() => {
              setFailure(null);
              setMode('delete');
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 16 },
  card: { borderRadius: 14, padding: 14, gap: 4 },
  cardLabel: { fontSize: 14, fontWeight: '600' },
  email: { fontSize: 18, fontWeight: '700' },
});
