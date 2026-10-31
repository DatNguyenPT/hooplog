import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { useTheme } from '@/shared/ui/theme';
import type { PlanDay, PlanItem } from '../domain/plan';
import { usePlanLabels } from './labels';
import { PlanItemRow } from './PlanItemRow';

type Props = { planId: string; day: PlanDay };

/** One weekday of a plan: its items (tap to edit) and the buttons that add more. */
export function PlanDaySection({ planId, day }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const labels = usePlanLabels();
  const dayName = labels.weekday(day.weekday);
  // The database allows one shooting item per day, so the button is offered only while the slot is free.
  const hasShooting = day.items.some(({ item }) => item.kind === 'shooting');

  // Full literals (not a shared prefix variable) so Expo Router's typed routes can check them.
  const edit = (item: PlanItem) =>
    router.push(
      item.kind === 'shooting'
        ? `/plans/item?planId=${planId}&weekday=${day.weekday}&kind=shooting`
        : `/plans/item?planId=${planId}&weekday=${day.weekday}&exerciseId=${item.exercise.id}`,
    );

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.day, { color: theme.text }]}>
          {dayName}
        </Text>
        {day.state === 'today' ? (
          <Text style={[styles.today, { color: theme.primary }]}>{t('plans.today')}</Text>
        ) : null}
      </View>
      {day.items.length === 0 ? (
        <Text style={{ color: theme.textMuted }}>{t('plans.restDay')}</Text>
      ) : (
        day.items.map(({ item, progress }) => {
          const name = labels.itemName(item);
          const target = labels.target(item);
          return (
            <PlanItemRow
              key={item.id}
              title={name}
              subtitle={target}
              progress={progress ? labels.progress(item, progress) : undefined}
              complete={progress?.complete}
              accessibilityLabel={
                progress
                  ? t('plans.itemLabelProgress', {
                      day: dayName,
                      name,
                      target,
                      progress: labels.progressSpoken(item, progress),
                    })
                  : t('plans.itemLabel', { day: dayName, name, target })
              }
              onPress={() => edit(item)}
            />
          );
        })
      )}
      <View style={styles.actions}>
        <Button
          label={t('plans.addExercise')}
          accessibilityLabel={t('plans.addExerciseLabel', { day: dayName })}
          variant="secondary"
          fontSize={15}
          style={styles.action}
          onPress={() => router.push(`/plans/exercises?planId=${planId}&weekday=${day.weekday}`)}
        />
        {hasShooting ? null : (
          <Button
            label={t('plans.addShooting')}
            accessibilityLabel={t('plans.addShootingLabel', { day: dayName })}
            variant="secondary"
            fontSize={15}
            style={styles.action}
            onPress={() =>
              router.push(`/plans/item?planId=${planId}&weekday=${day.weekday}&kind=shooting`)
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  day: { fontSize: 20, fontWeight: '800' },
  today: { fontSize: 13, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
