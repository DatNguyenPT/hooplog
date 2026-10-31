import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { useExerciseRepository } from '../data/exerciseRepository';
import {
  filterExercises,
  MAX_EXERCISE_NAME_LENGTH,
  MEASUREMENT_TYPES,
  validateExerciseName,
  type Exercise,
  type ExerciseNameError,
  type MeasurementType,
} from '../domain/exercise';
import { useWorkoutLabels } from './labels';

const NAME_ERROR_KEYS: Record<ExerciseNameError, string> = {
  required: 'picker.nameRequired',
  tooLong: 'picker.nameTooLong',
  duplicate: 'picker.nameDuplicate',
};

type Props = {
  /** The workout to return to with the chosen exercise. */
  sessionId?: string;
};

export function ExercisePicker({ sessionId }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = useWorkoutLabels();
  const repo = useExerciseRepository();

  const load = useCallback(() => repo.list(), [repo]);
  const { state, reload } = useLoad(load);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);

  const exercises = state.status === 'ready' ? state.data : null;
  const visible = useMemo(
    () => (exercises ? filterExercises(exercises, query, (key) => t(key)) : []),
    [exercises, query, t],
  );

  const choose = (exercise: Exercise) => {
    if (sessionId) router.dismissTo(`/workout/${sessionId}?exerciseId=${exercise.id}`);
    else router.dismissTo('/');
  };

  const remove = async (exercise: Exercise) => {
    setRemoveFailed(false);
    try {
      await repo.softDeleteCustom(exercise.id);
    } catch {
      setRemoveFailed(true);
    } finally {
      reload();
    }
  };

  const confirmRemove = (exercise: Exercise, name: string) =>
    Alert.alert(t('picker.deleteTitle', { name }), t('picker.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('picker.delete'), style: 'destructive', onPress: () => void remove(exercise) },
    ]);

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

  if (creating) {
    return (
      <Screen>
        <CreateExercise
          existingNames={state.data.map((e) => labels.exerciseName(e))}
          onCreated={(exercise) => {
            reload();
            choose(exercise);
          }}
          onBack={() => setCreating(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('picker.title')}
      </Text>
      <TextInput
        testID="exercise-search"
        accessibilityLabel={t('picker.searchLabel')}
        placeholder={t('picker.searchPlaceholder')}
        placeholderTextColor={theme.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      />
      <Button label={t('picker.create')} variant="secondary" onPress={() => setCreating(true)} />
      {removeFailed ? <InlineError message={t('picker.deleteError')} /> : null}
      {visible.length === 0 ? (
        <EmptyView title={t('picker.emptyTitle')} hint={t('picker.emptyHint')} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const name = labels.exerciseName(item);
            const category = labels.category(item.category);
            const measurement = labels.measurement(item.measurementType);
            return (
              <View style={[styles.row, { backgroundColor: theme.surface }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('picker.rowLabel', { name, category, measurement })}
                  onPress={() => choose(item)}
                  style={styles.rowMain}
                >
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{name}</Text>
                  <Text style={{ color: theme.textMuted }}>
                    {t('picker.rowSubtitle', { category, measurement })}
                  </Text>
                </Pressable>
                {item.isBuiltin ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('picker.deleteLabel', { name })}
                    onPress={() => confirmRemove(item, name)}
                    style={styles.rowDelete}
                  >
                    <Text style={[styles.rowDeleteText, { color: theme.missed }]}>
                      {t('picker.delete')}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
      <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

function CreateExercise({
  existingNames,
  onCreated,
  onBack,
}: {
  existingNames: string[];
  onCreated: (exercise: Exercise) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = useWorkoutLabels();
  const repo = useExerciseRepository();
  const [name, setName] = useState('');
  const [type, setType] = useState<MeasurementType>('reps');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const save = async () => {
    if (busy.current) return;
    const checked = validateExerciseName(name, existingNames);
    if (!checked.ok) {
      setNameError(t(NAME_ERROR_KEYS[checked.error]));
      return;
    }
    busy.current = true;
    setSaving(true);
    setNameError(null);
    setSaveFailed(false);
    try {
      onCreated(await repo.createCustom({ name: checked.name, measurementType: type }));
    } catch {
      setSaveFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.create}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('picker.createTitle')}
      </Text>
      <Text style={[styles.label, { color: theme.textMuted }]}>{t('picker.nameLabel')}</Text>
      <TextInput
        testID="exercise-name"
        accessibilityLabel={t('picker.nameLabel')}
        value={name}
        onChangeText={setName}
        maxLength={MAX_EXERCISE_NAME_LENGTH + 20}
        autoCapitalize="sentences"
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
      <Text style={[styles.label, { color: theme.textMuted }]}>{t('picker.measuredBy')}</Text>
      <View accessibilityRole="radiogroup" style={styles.types}>
        {MEASUREMENT_TYPES.map((m) => {
          const selected = m === type;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityLabel={labels.measurement(m)}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => setType(m)}
              style={[
                styles.type,
                {
                  backgroundColor: selected ? theme.primary : 'transparent',
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '600' }}>
                {labels.measurement(m)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {saveFailed ? <InlineError message={t('picker.createError')} /> : null}
      <Button label={t('picker.save')} onPress={save} disabled={saving} />
      <Button label={t('picker.back')} variant="secondary" onPress={onBack} />
    </View>
  );
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
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 18,
  },
  list: { gap: 8, paddingBottom: 12 },
  row: { minHeight: 64, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, minHeight: 64, padding: 14, justifyContent: 'center', gap: 2 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  rowDelete: { minWidth: 72, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  rowDeleteText: { fontSize: 15, fontWeight: '700' },
  create: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
