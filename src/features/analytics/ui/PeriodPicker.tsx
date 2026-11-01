import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatMonthYear, formatShortDate, formatWeekdayDate } from '@/shared/i18n/format';
import { Button } from '@/shared/ui/Button';
import { useTheme } from '@/shared/ui/theme';
import {
  PERIOD_KINDS,
  TREND_WEEKS,
  canGoForward,
  canNavigate,
  isCurrent,
  periodLayout,
  shiftPeriod,
  switchKind,
  type Period,
  type PeriodKind,
} from '../domain/period';

type Props = {
  period: Period;
  /** The moment "today" and the end of the road are measured from. */
  now: Date;
  onChange: (period: Period) => void;
};

/** What the window is called: "Sun, Nov 1", "Oct 26 – Nov 1", "November 2026" or "Last 8 weeks". */
function usePeriodTitle(period: Period): string {
  const { t } = useTranslation();
  const { from, starts } = periodLayout(period);
  switch (period.kind) {
    case 'day':
      return formatWeekdayDate(from);
    case 'week':
      return t('progress.weekRange', {
        from: formatShortDate(from),
        to: formatShortDate(starts[starts.length - 1]),
      });
    case 'month':
      return formatMonthYear(from);
    case 'trend':
      return t('progress.trendTitle', { count: TREND_WEEKS });
  }
}

/**
 * Chooses what the charts cover: a day, week, month or the last eight weeks, and which one.
 * Drawn from plain Views, so it needs no calendar library and no new phone build.
 */
export function PeriodPicker({ period, now, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const title = usePeriodTitle(period);
  const navigable = canNavigate(period.kind);

  const kindLabel = (kind: PeriodKind) =>
    kind === 'trend'
      ? t('progress.range.trend', { count: TREND_WEEKS })
      : t(`progress.range.${kind}`);

  return (
    <View style={styles.container}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('progress.rangeLabel')}
        style={styles.kinds}
      >
        {PERIOD_KINDS.map((kind) => {
          const selected = kind === period.kind;
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityLabel={kindLabel(kind)}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => {
                if (!selected) onChange(switchKind(period, kind, now));
              }}
              style={[
                styles.kind,
                {
                  backgroundColor: selected ? theme.primary : 'transparent',
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[styles.kindText, { color: selected ? theme.onPrimary : theme.text }]}
              >
                {kindLabel(kind)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.nav}>
        <Text
          accessibilityLiveRegion="polite"
          numberOfLines={2}
          style={[styles.title, { color: theme.text }]}
        >
          {title}
        </Text>
        {navigable ? (
          <>
            {/* Always drawn, and disabled in the current window, so the row does not shift. */}
            <Button
              label={t('progress.today')}
              variant="secondary"
              fontSize={15}
              disabled={isCurrent(period, now)}
              onPress={() => onChange({ kind: period.kind, anchor: now })}
              style={styles.today}
            />
            <Button
              label="‹"
              accessibilityLabel={t(`progress.prev.${period.kind}`)}
              variant="secondary"
              fontSize={24}
              onPress={() => onChange(shiftPeriod(period, -1))}
              style={styles.arrow}
            />
            <Button
              label="›"
              accessibilityLabel={t(`progress.next.${period.kind}`)}
              variant="secondary"
              fontSize={24}
              disabled={!canGoForward(period, now)}
              onPress={() => onChange(shiftPeriod(period, 1))}
              style={styles.arrow}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindText: { fontSize: 15, fontWeight: '600' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  today: { paddingHorizontal: 12 },
  arrow: { paddingHorizontal: 0 },
});
