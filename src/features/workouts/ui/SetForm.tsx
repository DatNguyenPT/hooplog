import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { InlineError } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import type { Exercise } from '../domain/exercise';
import {
  FIELDS_BY_TYPE,
  parseSetInput,
  type SetField,
  type SetFieldError,
  type SetInput,
  type SetValues,
} from '../domain/workout';

type Props = {
  exercise: Exercise;
  /** Rejecting shows an inline error; the typed values are kept so the user can retry. */
  onSubmit: (values: SetValues) => Promise<void>;
};

const INTEGER_FIELDS: readonly SetField[] = ['reps', 'duration'];

/** Numeric inputs for one exercise's measurement type. Validation lives in the domain (`parseSetInput`). */
export function SetForm({ exercise, onSubmit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [input, setInput] = useState<SetInput>({});
  const [errors, setErrors] = useState<Partial<Record<SetField, SetFieldError>>>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const label = (field: SetField) =>
    field === 'weight' ? t('setForm.weight', { unit: 'kg' }) : t(`setForm.${field}`);

  const submit = async () => {
    if (busy.current) return;
    const parsed = parseSetInput(exercise.measurementType, input);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setErrors({});
    setSaveFailed(false);
    try {
      await onSubmit(parsed.values);
    } catch {
      setSaveFailed(true);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.fields}>
        {FIELDS_BY_TYPE[exercise.measurementType].map((field) => {
          const error = errors[field];
          return (
            <View key={field} style={styles.field}>
              <Text style={[styles.label, { color: theme.textMuted }]}>{label(field)}</Text>
              <TextInput
                testID={`set-input-${field}`}
                accessibilityLabel={label(field)}
                value={input[field] ?? ''}
                onChangeText={(text) => setInput((prev) => ({ ...prev, [field]: text }))}
                keyboardType={INTEGER_FIELDS.includes(field) ? 'number-pad' : 'decimal-pad'}
                returnKeyType="done"
                maxLength={8}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: error ? theme.missed : theme.border,
                  },
                ]}
              />
              {error ? (
                <InlineError message={t(`setForm.${error}`, { field: label(field) })} />
              ) : null}
            </View>
          );
        })}
      </View>
      {saveFailed ? <InlineError message={t('workout.actionError')} /> : null}
      <Button label={t('workout.addSet')} onPress={submit} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  fields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, gap: 4 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '600',
  },
});
