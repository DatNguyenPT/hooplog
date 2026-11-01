import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useProfileRepository } from '../data/profileRepository';
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName } from '../domain/profile';
import { NameField } from './NameField';

/**
 * Shown once, the first time the app opens. There is no account to create: it explains the app,
 * asks for an optional name and can be skipped.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const profiles = useProfileRepository();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  /** Records the welcome step as done, then opens Home. Skipping passes a blank name, so none is saved. */
  const finish = async (typed: string) => {
    if (busy.current) return;
    const checked = validateDisplayName(typed);
    if (!checked.ok) {
      setNameError(t('profile.nameTooLong', { max: MAX_DISPLAY_NAME_LENGTH }));
      return;
    }
    busy.current = true;
    setSaving(true);
    setNameError(null);
    setSaveFailed(false);
    try {
      await profiles.completeOnboarding(checked.name);
      router.replace('/');
    } catch {
      setSaveFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {t('welcome.title')}
        </Text>
        <Text style={[styles.body, { color: theme.text }]}>{t('welcome.intro')}</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{t('welcome.privacy')}</Text>
        <NameField
          label={t('welcome.nameLabel')}
          hint={t('welcome.nameHint')}
          value={name}
          onChangeText={setName}
          onSubmit={() => finish(name)}
          error={nameError}
        />
        {saveFailed ? <InlineError message={t('profile.saveError')} /> : null}
        <Button label={t('welcome.start')} onPress={() => finish(name)} disabled={saving} />
        <Button
          label={t('welcome.skip')}
          variant="secondary"
          onPress={() => finish('')}
          disabled={saving}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  content: { gap: 16, paddingTop: 8, paddingBottom: 24 },
  title: { fontSize: 32, fontWeight: '800' },
  body: { fontSize: 18, lineHeight: 26 },
});
