import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import type { AccountUser } from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';

/** Who is signed in, with the two things to do about it: sign out, or delete the account. */
export function SignedInPanel({ user }: { user: AccountUser }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<AccountErrorKey | null>(null);
  const busy = useRef(false);

  // Once it works, the sign-out is announced by the repository and this panel is replaced.
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(error instanceof AccountError ? error.key : 'unknown');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteAccount'),
        style: 'destructive',
        onPress: () => void run(() => auth.deleteAccount()),
      },
    ]);

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
      {failure ? <InlineError message={t(`account.error.${failure}`)} /> : null}
      <Button
        label={t('account.signOut')}
        variant="secondary"
        disabled={working}
        onPress={() => void run(() => auth.signOut())}
      />
      <Button
        label={t('account.deleteAccount')}
        variant="missed"
        disabled={working}
        onPress={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 16 },
  card: { borderRadius: 14, padding: 14, gap: 4 },
  cardLabel: { fontSize: 14, fontWeight: '600' },
  email: { fontSize: 18, fontWeight: '700' },
});
