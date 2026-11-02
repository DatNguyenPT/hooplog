import { router } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useExerciseRepository } from '@/features/workouts/data/exerciseRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import {
  FIELDS_BY_TYPE,
  type SetField,
  type SetFieldError,
} from '@/features/workouts/domain/workout';
import { useWorkoutLabels } from '@/features/workouts/ui/labels';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { usePlanRepository } from '../data/planRepository';
import {
  findItem,
  parseShotTarget,
  parseTargetInput,
  parseWeekday,
  targetToInput,
  type ItemDraft,
  type ItemKey,
  type PlanItem,
  type TargetField,
  type TargetInput,
  type Weekday,
} from '../domain/plan';
import { usePlanLabels } from './labels';

type Props = {
  planId: string | undefined;
  weekday: string | undefined;
  exerciseId: string | undefined;
  /** `shooting` for a shooting item; otherwise the item is the exercise named by `exerciseId`. */
  kind: string | undefined;
};

type Subject =
  | {
      kind: 'exercise';
      exercise: Exercise;
      existing: Extract<PlanItem, { kind: 'exercise' }> | null;
    }
  | { kind: 'shooting'; existing: Extract<PlanItem, { kind: 'shooting' }> | null };

const INTEGER_FIELDS: readonly TargetField[] = ['sets', 'reps', 'duration'];

/** Adds an item to a plan day, or edits the one already there (the same screen serves both). */
export function PlanItemForm({ planId, weekday: weekdayParam, exerciseId, kind }: Props) {
  const { t } = useTranslation();
  const plans = usePlanRepository();
  const exercises = useExerciseRepository();

  const load = useCallback(async () => {
    const weekday = parseWeekday(weekdayParam);
    const key: ItemKey | null =
      kind === 'shooting'
        ? { kind: 'shooting' }
        : exerciseId
          ? { kind: 'exercise', exerciseId }
          : null;
    if (!planId || weekday === null || key === null) return null;
    const plan = await plans.getPlan(planId);
    if (!plan) return null;
    const existing = findItem(plan.items, weekday, key);
    let subject: Subject;
    if (key.kind === 'shooting') {
      subject = { kind: 'shooting', existing: existing?.kind === 'shooting' ? existing : null };
    } else {
      const found = existing?.kind === 'exercise' ? existing : null;
      const exercise = found ? found.exercise : await exercises.get(key.exerciseId);
      if (!exercise) return null;
      subject = { kind: 'exercise', exercise, existing: found };
    }
    return { planId: plan.id, weekday, subject };
  }, [planId, weekdayParam, exerciseId, kind, plans, exercises]);
  const { state, reload } = useLoad(load);

  if (state.status === 'loading')
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  if (state.status === 'error')
    return (
      <Screen>
        <ErrorView onRetry={reload} />
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  if (state.data === null)
    return (
      <Screen>
        <EmptyView title={t('plans.notFound')} />
      </Screen>
    );

  const { planId: loadedPlanId, weekday, subject } = state.data;
  return (
    <Screen>
      <ItemFields planId={loadedPlanId} weekday={weekday} subject={subject} />
    </Screen>
  );
}

function ItemFields({
  planId,
  weekday,
  subject,
}: {
  planId: string;
  weekday: Weekday;
  subject: Subject;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const plans = usePlanRepository();
  const labels = usePlanLabels();
  const workoutLabels = useWorkoutLabels();
  const [input, setInput] = useState<TargetInput>(() => initialInput(subject));
  const [errors, setErrors] = useState<Partial<Record<TargetField, SetFieldError>>>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const day = labels.weekday(weekday);
  const name =
    subject.kind === 'shooting'
      ? t('plans.shooting')
      : workoutLabels.exerciseName(subject.exercise);
  // The shooting count lives in the `sets` slot of the input, labelled "Shots".
  const perSetFields: readonly SetField[] =
    subject.kind === 'exercise' ? FIELDS_BY_TYPE[subject.exercise.measurementType] : [];

  const label = (field: TargetField) => {
    if (field === 'sets') return subject.kind === 'shooting' ? t('plans.shots') : t('plans.sets');
    return field === 'weight' ? t('setForm.weight', { unit: 'kg' }) : t(`setForm.${field}`);
  };

  const draft = (): ItemDraft | null => {
    if (subject.kind === 'shooting') {
      const parsed = parseShotTarget(input.sets ?? '');
      if (!parsed.ok) {
        setErrors({ sets: parsed.error });
        return null;
      }
      return { kind: 'shooting', shots: parsed.shots };
    }
    const parsed = parseTargetInput(subject.exercise.measurementType, input);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return null;
    }
    return {
      kind: 'exercise',
      exerciseId: subject.exercise.id,
      sets: parsed.sets,
      target: parsed.target,
    };
  };

  const run = async (action: () => Promise<void>) => {
    busy.current = true;
    setSaving(true);
    setErrors({});
    setSaveFailed(false);
    try {
      await action();
      router.back();
    } catch {
      setSaveFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const save = async () => {
    if (busy.current) return;
    const next = draft();
    if (next === null) return;
    await run(async () => {
      if (subject.existing) await plans.updateItem(subject.existing.id, next);
      else await plans.addItem(planId, weekday, next);
    });
  };

  const removeExisting = async () => {
    const existing = subject.existing;
    if (!existing || busy.current) return;
    await run(() => plans.removeItem(existing.id));
  };

  const confirmRemove = () =>
    Alert.alert(t('plans.removeTitle', { name, day }), t('plans.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plans.removeItem'), style: 'destructive', onPress: () => void removeExisting() },
    ]);

  const field = (f: TargetField) => {
    const error = errors[f];
    return (
      <View key={f} style={styles.field}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{label(f)}</Text>
        <TextInput
          testID={`plan-input-${f}`}
          accessibilityLabel={label(f)}
          value={input[f] ?? ''}
          onChangeText={(text) => setInput((prev) => ({ ...prev, [f]: text }))}
          keyboardType={INTEGER_FIELDS.includes(f) ? 'number-pad' : 'decimal-pad'}
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
        {error ? <InlineError message={t(`setForm.${error}`, { field: label(f) })} /> : null}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('plans.itemHeading', { day, name })}
      </Text>
      {field('sets')}
      {perSetFields.length > 0 ? (
        <>
          <Text style={{ color: theme.textMuted }}>{t('plans.optionalHint')}</Text>
          <View style={styles.row}>{perSetFields.map((f) => field(f))}</View>
        </>
      ) : null}
      {saveFailed ? <InlineError message={t('plans.actionError')} /> : null}
      <Button label={t('plans.saveItem')} onPress={save} disabled={saving} />
      {subject.existing ? (
        <Button
          label={t('plans.removeItem')}
          variant="secondary"
          onPress={confirmRemove}
          disabled={saving}
        />
      ) : null}
      <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

function initialInput(subject: Subject): TargetInput {
  if (subject.kind === 'shooting') {
    return subject.existing ? { sets: String(subject.existing.shots) } : {};
  }
  return subject.existing ? targetToInput(subject.exercise.measurementType, subject.existing) : {};
}

function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  content: { gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  row: { flexDirection: 'row', gap: 12 },
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
