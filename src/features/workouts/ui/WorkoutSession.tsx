import { router } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDateTime } from '@/shared/i18n/format';
import { formatDuration, formatWeight } from '@/shared/units';
import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, InlineError, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { useExerciseRepository } from '../data/exerciseRepository';
import { useWorkoutRepository, type ExerciseGroup } from '../data/workoutRepository';
import type { Exercise } from '../domain/exercise';
import { summarizeWorkout } from '../domain/workout';
import { useWorkoutLabels } from './labels';
import { SetForm } from './SetForm';

type Props = {
  id: string;
  /** Set by the exercise picker when it returns here. */
  pickedExerciseId?: string;
};

export function WorkoutSession({ id, pickedExerciseId }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = useWorkoutLabels();
  const repo = useWorkoutRepository();
  const exerciseRepo = useExerciseRepository();

  const load = useCallback(async () => {
    const [session, picked] = await Promise.all([
      repo.getSession(id),
      pickedExerciseId ? exerciseRepo.get(pickedExerciseId) : Promise.resolve(null),
    ]);
    return { session, picked };
  }, [repo, exerciseRepo, id, pickedExerciseId]);
  const { state, reload } = useLoad(load);

  // A tapped exercise only counts for the picker result it was tapped under; a new pick resets it.
  const [tapped, setTapped] = useState<{ forPick: string | undefined; id: string } | null>(null);
  const chosenId = tapped && tapped.forPick === pickedExerciseId ? tapped.id : null;
  const [actionFailed, setActionFailed] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setActionFailed(false);
    try {
      await action();
    } catch {
      setActionFailed(true);
    } finally {
      reload();
    }
  };

  const session = state.status === 'ready' ? state.data.session : null;
  const picked = state.status === 'ready' ? state.data.picked : null;

  const summary = useMemo(
    () =>
      summarizeWorkout(
        (session?.groups ?? []).flatMap((g) => g.sets),
        session?.startedAt ?? '',
        session?.endedAt ?? null,
      ),
    [session],
  );

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
      </Screen>
    );
  if (!session) {
    return (
      <Screen>
        <EmptyView title={t('workout.notFound')} />
        <Button label={t('workout.done')} onPress={() => router.dismissTo('/')} />
      </Screen>
    );
  }

  const active = session.endedAt === null;
  // The exercise being logged: the one tapped, else the one just picked, else the latest one used.
  const candidates: Exercise[] = [
    ...session.groups.map((g) => g.exercise),
    ...(picked ? [picked] : []),
  ];
  const selected =
    candidates.find((e) => e.id === chosenId) ??
    picked ??
    session.groups[session.groups.length - 1]?.exercise ??
    null;

  const confirmEnd = () =>
    Alert.alert(t('workout.endConfirmTitle'), t('workout.endConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('workout.end'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await repo.endSession(session.id);
            router.dismissTo('/');
          }),
      },
    ]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {active ? t('workout.title') : t('workout.summaryTitle')}
        </Text>
        <Text style={{ color: theme.textMuted }}>{formatDateTime(session.startedAt)}</Text>

        <View style={[styles.hero, { backgroundColor: theme.surface }]}>
          <Stat label={t('workout.statSets')} value={String(summary.sets)} />
          <Stat label={t('workout.statReps')} value={String(summary.totalReps)} />
          <Stat label={t('workout.statVolume')} value={formatWeight(summary.totalVolumeKg)} />
          {summary.durationS !== null ? (
            <Stat label={t('workout.statDuration')} value={formatDuration(summary.durationS)} />
          ) : null}
        </View>

        {session.groups.length === 0 && !selected ? (
          <View style={styles.empty}>
            <EmptyView title={t('workout.emptyTitle')} hint={t('workout.emptyHint')} />
          </View>
        ) : null}

        {session.groups.map((group) => (
          <GroupCard
            key={group.exercise.id}
            group={group}
            active={active}
            selected={active && selected?.id === group.exercise.id}
            onSelect={() => setTapped({ forPick: pickedExerciseId, id: group.exercise.id })}
            onDeleteSet={(setId) => run(() => repo.deleteSet(setId))}
          />
        ))}

        {actionFailed ? <InlineError message={t('workout.actionError')} /> : null}

        {active && selected ? (
          <View style={[styles.logCard, { backgroundColor: theme.surface }]}>
            <Text accessibilityRole="header" style={[styles.logTitle, { color: theme.text }]}>
              {t('workout.logHeading', { exercise: labels.exerciseName(selected) })}
            </Text>
            <SetForm
              key={selected.id}
              exercise={selected}
              onSubmit={async (values) => {
                await repo.addSet(session.id, selected.id, values);
                reload();
              }}
            />
          </View>
        ) : null}

        {active ? (
          <View style={styles.footer}>
            <Button
              label={t('workout.addExercise')}
              variant="secondary"
              onPress={() => router.push(`/workout/exercises?sessionId=${session.id}`)}
              style={styles.flex}
            />
            <Button
              label={t('workout.end')}
              variant="secondary"
              onPress={confirmEnd}
              style={styles.flex}
            />
          </View>
        ) : (
          <Button label={t('workout.done')} onPress={() => router.dismissTo('/')} />
        )}
      </ScrollView>
    </Screen>
  );
}

function GroupCard({
  group,
  active,
  selected,
  onSelect,
  onDeleteSet,
}: {
  group: ExerciseGroup;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onDeleteSet: (setId: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = useWorkoutLabels();
  const name = labels.exerciseName(group.exercise);

  const header = <Text style={[styles.groupTitle, { color: theme.text }]}>{name}</Text>;

  return (
    <View
      style={[
        styles.group,
        { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.surface },
      ]}
    >
      {active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workout.selectExercise', { exercise: name })}
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={styles.groupHeader}
        >
          {header}
        </Pressable>
      ) : (
        <View style={styles.groupHeader}>{header}</View>
      )}
      {group.sets.map((set, index) => {
        const details = labels.setDetails(set, group.exercise.measurementType);
        return (
          <View
            key={set.id}
            style={styles.setRow}
            accessible={!active}
            accessibilityLabel={
              active
                ? undefined
                : t('workout.setLabel', { exercise: name, number: index + 1, details })
            }
          >
            <Text style={[styles.setNumber, { color: theme.textMuted }]}>
              {t('workout.setNumber', { number: index + 1 })}
            </Text>
            <Text style={[styles.setDetails, { color: theme.text }]}>{details}</Text>
            {active ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('workout.deleteSet', { number: index + 1, exercise: name })}
                onPress={() => onDeleteSet(set.id)}
                style={styles.deleteSet}
              >
                <Text style={[styles.deleteGlyph, { color: theme.missed }]}>×</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
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

function Stat({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('workout.statLabel', { label, value })}
      style={styles.stat}
    >
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={{ color: theme.textMuted }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  content: { gap: 12, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  hero: {
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 12,
  },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { fontSize: 22, fontWeight: '800' },
  empty: { minHeight: 160 },
  group: { borderRadius: 16, borderWidth: 2, padding: 12, gap: 4 },
  groupHeader: { minHeight: 44, justifyContent: 'center' },
  groupTitle: { fontSize: 18, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 12 },
  setNumber: { width: 56, fontWeight: '600' },
  setDetails: { flex: 1, fontSize: 16 },
  deleteSet: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  deleteGlyph: { fontSize: 28, fontWeight: '700' },
  logCard: { borderRadius: 16, padding: 12, gap: 8 },
  logTitle: { fontSize: 18, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
