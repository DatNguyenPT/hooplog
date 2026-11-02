import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Section';
import { ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useProfileRepository } from '../data/profileRepository';
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName, type Profile } from '../domain/profile';
import { NameField } from './NameField';
import { useProfile } from './useProfile';

/** The player's name, and the units and language the app uses. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { state, reload } = useProfile();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('settings.title')}
      </Text>
      {state.status === 'loading' ? (
        <LoadingView />
      ) : state.status === 'error' ? (
        <ErrorView onRetry={reload} />
      ) : (
        <SettingsContent profile={state.data} />
      )}
    </SafeAreaView>
  );
}

function SettingsContent({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const profiles = useProfileRepository();
  const [name, setName] = useState(profile.displayName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const edit = (value: string) => {
    setName(value);
    setStatus('idle');
  };

  const save = async () => {
    if (busy.current) return;
    setStatus('idle');
    const checked = validateDisplayName(name);
    if (!checked.ok) {
      setNameError(t('profile.nameTooLong', { max: MAX_DISPLAY_NAME_LENGTH }));
      return;
    }
    busy.current = true;
    setSaving(true);
    setNameError(null);
    try {
      await profiles.saveDisplayName(checked.name);
      // Show the tidied name, so what is on screen is what was saved.
      setName(checked.name ?? '');
      setStatus('saved');
    } catch {
      setStatus('failed');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Section title={t('settings.profileTitle')}>
        <NameField
          label={t('settings.nameLabel')}
          hint={t('settings.nameHint')}
          value={name}
          onChangeText={edit}
          onSubmit={save}
          error={nameError}
        />
        {status === 'failed' ? <InlineError message={t('profile.saveError')} /> : null}
        {status === 'saved' ? (
          <Text accessibilityLiveRegion="polite" style={[styles.saved, { color: theme.textMuted }]}>
            {t('settings.saved')}
          </Text>
        ) : null}
        <Button label={t('settings.save')} onPress={save} disabled={saving} />
      </Section>

      <Section title={t('settings.preferencesTitle')}>
        <FixedRow name={t('settings.units')} value={t('settings.unitsValue')} />
        <FixedRow name={t('settings.language')} value={t('settings.languageValue')} />
      </Section>

      <Section title={t('settings.accountTitle')}>
        <LinkRow label={t('settings.accountRow')} onPress={() => router.push('/account')} />
        <Text style={[styles.body, { color: theme.textMuted }]}>{t('settings.accountHint')}</Text>
      </Section>

      <Section title={t('settings.dataTitle')}>
        <LinkRow label={t('settings.dataRow')} onPress={() => router.push('/data')} />
        <Text style={[styles.body, { color: theme.textMuted }]}>{t('settings.dataBody')}</Text>
      </Section>
    </ScrollView>
  );
}

/** A row that opens another screen. */
function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <Text style={[styles.rowName, { color: theme.text }]}>{label}</Text>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.chevron, { color: theme.textMuted }]}
      >
        ›
      </Text>
    </Pressable>
  );
}

/** A setting that has one option for now: shown, not changeable. */
function FixedRow({ name, value }: { name: string; value: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('settings.rowLabel', { name, value })}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <Text style={[styles.rowName, { color: theme.text }]}>{name}</Text>
      <Text style={[styles.rowValue, { color: theme.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  scroll: { flex: 1 },
  content: { gap: 24, paddingBottom: 16 },
  saved: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  row: {
    minHeight: 56,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowValue: { fontSize: 16, flexShrink: 1, textAlign: 'right' },
  chevron: { fontSize: 24, fontWeight: '700' },
});
