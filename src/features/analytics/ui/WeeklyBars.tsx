import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/shared/ui/theme';

const PLOT_HEIGHT = 112;
/** Shortest drawn bar in dp, so a small but non-zero week stays visible. */
const MIN_BAR = 4;
const GAP = 4;

/**
 * Every other week is labelled, ending with the newest, so the dates fit narrow screens.
 * A label spans its own column and the one before it.
 */
export function labelCells(count: number): { index: number; span: 1 | 2 }[] {
  const cells: { index: number; span: 1 | 2 }[] = [];
  for (let i = count - 1; i >= 0; i -= 2) cells.push({ index: i, span: i >= 1 ? 2 : 1 });
  return cells.reverse();
}

type Props = {
  /** Names the series; a single series needs no legend. */
  title: string;
  /** Bar heights as 0-1 fractions, oldest week first; 0 draws no bar. */
  fractions: readonly number[];
  /** Short x-axis label per week. */
  labels: readonly string[];
  /** One sentence per week: shown as the readout when selected, and what a screen reader says for the bar. */
  descriptions: readonly string[];
  /** The value at the top of the scale, for example "100%". */
  scaleTop: string;
  selected: number;
  onSelect: (index: number) => void;
  /** When no week has data the plot is replaced by `emptyText`. */
  hasData: boolean;
  emptyText: string;
  /** Prefix for the bars' test IDs. */
  id: string;
};

/**
 * Weekly bars drawn with plain Views: one series in one colour, anchored to a baseline, with the
 * selected week highlighted by a band (not by colour alone) and spelled out in the readout above.
 */
export function WeeklyBars({
  title,
  fractions,
  labels,
  descriptions,
  scaleTop,
  selected,
  onSelect,
  hasData,
  emptyText,
  id,
}: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textMuted }]}>
        {title}
      </Text>
      {hasData ? (
        <>
          <Text accessibilityLiveRegion="polite" style={[styles.readout, { color: theme.text }]}>
            {descriptions[selected]}
          </Text>
          <Text
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={[styles.scale, { color: theme.textMuted }]}
          >
            {scaleTop}
          </Text>
          <View style={[styles.plot, { borderColor: theme.border }]}>
            {fractions.map((fraction, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={descriptions[i]}
                accessibilityState={{ selected: i === selected }}
                onPress={() => onSelect(i)}
                style={[styles.column, i === selected && { backgroundColor: theme.border }]}
              >
                {fraction > 0 ? (
                  <View
                    testID={`${id}-bar-${i}`}
                    style={[
                      styles.bar,
                      {
                        height: Math.max(MIN_BAR, Math.round(Math.min(1, fraction) * PLOT_HEIGHT)),
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
          {/* Each bar already says its week, so the axis labels are for sighted readers only. */}
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={styles.labels}
          >
            {labelCells(labels.length).map(({ index, span }) => (
              <Text
                key={index}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                style={[
                  styles.label,
                  {
                    flex: span,
                    color: index === selected ? theme.text : theme.textMuted,
                    fontWeight: index === selected ? '700' : '400',
                  },
                ]}
              >
                {labels[index]}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyText}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 12, gap: 6 },
  title: { fontSize: 14, fontWeight: '600' },
  readout: { fontSize: 15, lineHeight: 20, fontWeight: '600', minHeight: 40 },
  scale: { fontSize: 11, alignSelf: 'flex-end' },
  plot: {
    height: PLOT_HEIGHT + 2,
    flexDirection: 'row',
    gap: GAP,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  column: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', borderRadius: 6 },
  bar: { width: '64%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  labels: { flexDirection: 'row', gap: GAP },
  label: { fontSize: 11, textAlign: 'right' },
  empty: { fontSize: 14, paddingVertical: 8 },
});
