import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyView, ErrorView, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useAuthRepository } from '../data/authRepository';
import { RecoveryForm } from './RecoveryForm';
import { SignedInPanel } from './SignedInPanel';
import { SignedOutForm } from './SignedOutForm';
import { useAccount } from './useAccount';

/** The optional account: sign up, sign in, sign out, delete. The rest of the app never needs it. */
export function AccountScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuthRepository();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('account.title')}
      </Text>
      {auth.isConfigured() ? (
        <AccountContent />
      ) : (
        <EmptyView title={t('account.notConfiguredTitle')} hint={t('account.notConfiguredBody')} />
      )}
    </SafeAreaView>
  );
}

function AccountContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { state, reload, deleted, markDeleted, passwordChanged, markPasswordChanged } =
    useAccount();
  // The reset form lives here and not in the sign-in form: the code signs the player in as soon as
  // it is right, and the form has to stay on screen until the new password is saved.
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');

  if (state.status === 'loading') return <LoadingView />;
  if (state.status === 'error') {
    return <ErrorView onRetry={reload} message={t(`account.error.${state.key}`)} />;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {resetting ? (
        <RecoveryForm
          initialEmail={email}
          onDone={() => {
            setResetting(false);
            markPasswordChanged();
          }}
          onCancel={(typed) => {
            setEmail(typed);
            setResetting(false);
          }}
        />
      ) : (
        <>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('account.intro')}</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('account.backupNote')}</Text>
          {state.user ? (
            <SignedInPanel
              user={state.user}
              passwordChanged={passwordChanged}
              onPasswordChanged={markPasswordChanged}
              onDeleted={markDeleted}
            />
          ) : (
            <SignedOutForm
              deleted={deleted}
              initialEmail={email}
              onForgotPassword={(typed) => {
                setEmail(typed);
                setResetting(true);
              }}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  scroll: { flex: 1 },
  content: { gap: 16, paddingBottom: 16 },
  body: { fontSize: 16, lineHeight: 24 },
});
