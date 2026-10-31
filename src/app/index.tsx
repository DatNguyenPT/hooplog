import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createShotRepository } from '@/features/shooting/data/shotRepository';
import { fieldGoalPercentage, type ShotTally } from '@/features/shooting/domain/stats';

/** Milestone 0 foundation check: proves SQLite read/write on a real device. Replaced by the real shooting session in M1. */
export default function Index() {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const repo = useMemo(() => createShotRepository(db), [db]);
  const [counts, setCounts] = useState<ShotTally | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCounts(await repo.tallyAll());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [repo]);

  useEffect(() => {
    let active = true;
    repo
      .tallyAll()
      .then((t) => active && setCounts(t))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [repo]);

  const add = async (result: 'made' | 'missed') => {
    try {
      await repo.addShot(result);
      await refresh();
    } catch {
      setFailed(true);
    }
  };

  const fg = counts ? fieldGoalPercentage(counts) : null;

  return (
    <SafeAreaView style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('devCheck.title')}
      </Text>
      <Text style={styles.subtitle}>{t('devCheck.subtitle')}</Text>

      {failed ? (
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.button}>
          <Text style={styles.buttonText}>
            {t('common.error')} {t('common.retry')}
          </Text>
        </Pressable>
      ) : counts === null ? (
        <Text>{t('common.loading')}</Text>
      ) : (
        <>
          <Text style={styles.stat}>
            {t('devCheck.fg')}: {fg === null ? t('devCheck.fgEmpty') : `${fg.toFixed(0)}%`}
          </Text>
          <Text>{t('devCheck.shots', { count: counts.made + counts.missed })}</Text>
        </>
      )}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => add('made')}
          style={[styles.button, styles.made]}
        >
          <Text style={styles.buttonText}>{t('devCheck.made')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => add('missed')}
          style={[styles.button, styles.missed]}
        >
          <Text style={styles.buttonText}>{t('devCheck.missed')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, textAlign: 'center' },
  stat: { fontSize: 28, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 16, marginTop: 24 },
  button: {
    minHeight: 56,
    minWidth: 120,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#444',
  },
  made: { backgroundColor: '#1b8a3a' },
  missed: { backgroundColor: '#b3261e' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
