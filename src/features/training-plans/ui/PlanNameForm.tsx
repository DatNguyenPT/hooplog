import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { MAX_PLAN_NAME_LENGTH, validatePlanName, type PlanNameError } from '../domain/plan';

const NAME_ERROR_KEYS: Record<PlanNameError, string> = {
  required: 'plans.nameRequired',
  tooLong: 'plans.nameTooLong',
  duplicate: 'plans.nameDuplicate',
};

type Props = {
  initial?: string;
  /** Names of the other plans, so a name is never used twice. */
  otherNames: readonly string[];
  submitLabel: string;
  /** Receives the validated name. Rejecting shows an inline error and keeps the typed name. */
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

/** Name entry shared by "New plan" and "Rename". */
export function PlanNameForm({ initial = '', otherNames, submitLabel, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [name, setName] = useState(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    const checked = validatePlanName(name, otherNames);
    if (!checked.ok) {
      setNameError(t(NAME_ERROR_KEYS[checked.error]));
      return;
    }
    busy.current = true;
    setSaving(true);
    setNameError(null);
    setSaveFailed(false);
    try {
      await onSubmit(checked.name);
    } catch {
      setSaveFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{t('plans.nameLabel')}</Text>
      <TextInput
        testID="plan-name"
        accessibilityLabel={t('plans.nameLabel')}
        value={name}
        onChangeText={setName}
        maxLength={MAX_PLAN_NAME_LENGTH + 20}
        autoCapitalize="sentences"
        returnKeyType="done"
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: nameError ? theme.missed : theme.border,
          },
        ]}
      />
      {nameError ? <InlineError message={nameError} /> : null}
      {saveFailed ? <InlineError message={t('plans.actionError')} /> : null}
      <Button label={submitLabel} onPress={submit} disabled={saving} />
      <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 18,
  },
});
