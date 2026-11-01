import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/shared/ui/theme';

const PLOT_HEIGHT = 112;
/** Shortest drawn bar in dp, so a small but non-zero bar stays visible. */
const MIN_BAR = 4;
const GAP = 4;
/** A month has up to 31 bars, so past this many the gaps shrink to leave the bars room. */
const MANY_BARS = 14;
const NARROW_GAP = 1;

/**
 * Every `every`th bar is labelled, ending with the newest, so the labels fit narrow screens.
 * A label spans its own column and the ones before it, which ends it under the bar it names.
 */
export function labelCells(count: number, every = 2): { index: number; span: number }[] {
  const cells: { index: number; span: number }[] = [];
  for (let i = count - 1; i >= 0; i -= every)
    cells.push({ index: i, span: Math.min(every, i + 1) });
  return cells.reverse();
}

type Props = {
  /** Names the series; a single series needs no legend. */
  title: string;
  /** Bar heights as 0-1 fractions, oldest first; 0 draws no bar. */
  fractions: readonly number[];
  /** Short x-axis label per bar. */
  labels: readonly string[];
  /** Label every this many bars, counting back from the newest. Defaults to every other bar. */
  labelEvery?: number;
  /** One sentence per bar: shown as the readout when selected, and what a screen reader says for the bar. */
  descriptions: readonly string[];
  /** The value at the top of the scale, for example "100%". */
  scaleTop: string;
  selected: number;
  onSelect: (index: number) => void;
  /** When no bar has data the plot is replaced by `emptyText`. */
  hasData: boolean;
  emptyText: string;
  /** Prefix for the bars' test IDs. */
  id: string;
};

/**
 * Bars drawn with plain Views: one series in one colour, anchored to a baseline, with the
 * selected bar highlighted by a band (not by colour alone) and spelled out in the readout above.
 */
export function PeriodBars({
  title,
  fractions,
  labels,
  labelEvery = 2,
  descriptions,
  scaleTop,
  selected,
  onSelect,
  hasData,
  emptyText,
  id,
}: Props) {
  const theme = useTheme();
  const gap = fractions.length > MANY_BARS ? NARROW_GAP : GAP;
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
          <View testID={`${id}-plot`} style={[styles.plot, { borderColor: theme.border, gap }]}>
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
          {/* Each bar already says its date, so the axis labels are for sighted readers only. */}
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.labels, { gap }]}
          >
            {labelCells(labels.length, labelEvery).map(({ index, span }) => (
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
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  column: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', borderRadius: 6 },
  bar: { width: '64%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  labels: { flexDirection: 'row' },
  label: { fontSize: 11, textAlign: 'right' },
  empty: { fontSize: 14, paddingVertical: 8 },
});
