import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { EmptyView, ErrorView, LoadingView } from '@/shared/ui/StateViews';
import { useTheme } from '@/shared/ui/theme';
import { useLoad } from '@/shared/ui/useLoad';
import { usePlanRepository } from '../data/planRepository';
import type { PlanSummary } from '../domain/plan';
import { PlanNameForm } from './PlanNameForm';

export function PlanList() {
  const { t } = useTranslation();
  const theme = useTheme();
  const plans = usePlanRepository();

  const load = useCallback(() => plans.listPlans(), [plans]);
  const { state, reload } = useLoad(load);
  const [creating, setCreating] = useState(false);

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

  return (
    <Screen>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {t('plans.title')}
      </Text>
      {creating ? (
        <PlanNameForm
          otherNames={state.data.map((p) => p.name)}
          submitLabel={t('plans.create')}
          onSubmit={async (name) => {
            const id = await plans.createPlan(name);
            setCreating(false);
            reload();
            router.push(`/plans/${id}`);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <Button label={t('plans.new')} onPress={() => setCreating(true)} />
      )}
      {state.data.length === 0 ? (
        <EmptyView title={t('plans.emptyTitle')} hint={t('plans.emptyHint')} />
      ) : (
        <FlatList
          data={state.data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <PlanRow plan={item} />}
        />
      )}
    </Screen>
  );
}

function PlanRow({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const items = t('plans.itemCount', { count: plan.itemCount });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(plan.isActive ? 'plans.rowLabelActive' : 'plans.rowLabel', {
        name: plan.name,
        items,
      })}
      onPress={() => router.push(`/plans/${plan.id}`)}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{plan.name}</Text>
        <Text style={{ color: theme.textMuted }}>{items}</Text>
      </View>
      {plan.isActive ? (
        <Text style={[styles.badge, { color: theme.made }]}>{t('plans.active')}</Text>
      ) : null}
    </Pressable>
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
  list: { gap: 8, paddingBottom: 12 },
  row: {
    minHeight: 64,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  badge: { fontSize: 13, fontWeight: '800' },
});
