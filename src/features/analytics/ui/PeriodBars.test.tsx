import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import '@/shared/i18n';
import { labelCells, PeriodBars } from './PeriodBars';

const hidden = { includeHiddenElements: true };

async function renderChart(props: Partial<ComponentProps<typeof PeriodBars>> = {}) {
  const onSelect = jest.fn();
  const utils = await render(
    <PeriodBars
      id="t"
      title="Sessions per week"
      fractions={[0.5, 1, 0, 0.01]}
      labels={['Jan 5', 'Jan 12', 'Jan 19', 'Jan 26']}
      descriptions={['Week A: 2', 'Week B: 4', 'Week C: none', 'Week D: 1']}
      scaleTop="4"
      selected={1}
      onSelect={onSelect}
      hasData
      emptyText="Nothing here yet."
      {...props}
    />,
  );
  return { onSelect, ...utils };
}

describe('labelCells', () => {
  it('labels every other bar by default, ending with the newest', () => {
    expect(labelCells(8)).toEqual([
      { index: 1, span: 2 },
      { index: 3, span: 2 },
      { index: 5, span: 2 },
      { index: 7, span: 2 },
    ]);
  });

  it('gives the oldest label a single column when the count is odd', () => {
    expect(labelCells(7)).toEqual([
      { index: 0, span: 1 },
      { index: 2, span: 2 },
      { index: 4, span: 2 },
      { index: 6, span: 2 },
    ]);
  });

  it('handles the smallest counts', () => {
    expect(labelCells(0)).toEqual([]);
    expect(labelCells(1)).toEqual([{ index: 0, span: 1 }]);
    expect(labelCells(2)).toEqual([{ index: 1, span: 2 }]);
  });

  it('labels every bar when asked to, as a week of weekdays does', () => {
    expect(labelCells(3, 1)).toEqual([
      { index: 0, span: 1 },
      { index: 1, span: 1 },
      { index: 2, span: 1 },
    ]);
  });

  it('labels every fifth day of a month, counting back from the last day', () => {
    expect(labelCells(30, 5).map((cell) => cell.index)).toEqual([4, 9, 14, 19, 24, 29]);
    expect(labelCells(30, 5).every((cell) => cell.span === 5)).toBe(true);
    expect(labelCells(31, 5)).toEqual([
      { index: 0, span: 1 },
      { index: 5, span: 5 },
      { index: 10, span: 5 },
      { index: 15, span: 5 },
      { index: 20, span: 5 },
      { index: 25, span: 5 },
      { index: 30, span: 5 },
    ]);
  });

  it('always covers every column exactly once and ends with the newest bar', () => {
    for (let every = 1; every <= 6; every += 1) {
      for (let count = 1; count <= 32; count += 1) {
        const cells = labelCells(count, every);
        expect(cells.reduce((sum, c) => sum + c.span, 0)).toBe(count);
        expect(cells[cells.length - 1].index).toBe(count - 1);
      }
    }
  });
});

describe('PeriodBars', () => {
  it('draws each bar to its fraction of the plot, with a visible minimum', async () => {
    await renderChart({ fractions: [0.5, 1, 0, 0.01] });
    expect(screen.getByTestId('t-bar-0')).toHaveStyle({ height: 56 });
    expect(screen.getByTestId('t-bar-1')).toHaveStyle({ height: 112 });
    // A bar with nothing in it draws no bar at all, not a zero-height one.
    expect(screen.queryByTestId('t-bar-2')).toBeNull();
    // Small but non-zero stays visible.
    expect(screen.getByTestId('t-bar-3')).toHaveStyle({ height: 4 });
  });

  it('never draws a bar taller than the plot', async () => {
    await renderChart({ fractions: [1.5, 1, 0, 0] });
    expect(screen.getByTestId('t-bar-0')).toHaveStyle({ height: 112 });
  });

  it('reads out the selected bar and marks only that bar as selected', async () => {
    await renderChart({ selected: 1 });
    expect(screen.getByText('Week B: 4')).toBeTruthy();
    expect(screen.getByLabelText('Week B: 4')).toBeSelected();
    expect(screen.getByLabelText('Week A: 2')).not.toBeSelected();
    expect(screen.getByLabelText('Week C: none')).not.toBeSelected();
  });

  it('reports the tapped bar, including one with nothing drawn', async () => {
    const { onSelect } = await renderChart();
    await fireEvent.press(screen.getByLabelText('Week A: 2'));
    expect(onSelect).toHaveBeenLastCalledWith(0);
    await fireEvent.press(screen.getByLabelText('Week C: none'));
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });

  it('labels every other bar on the axis, bold for the selected one, hidden from screen readers', async () => {
    await renderChart({ selected: 3 });
    expect(screen.queryByText('Jan 12')).toBeNull();
    expect(screen.getByText('Jan 12', hidden)).toBeTruthy();
    expect(screen.getByText('Jan 26', hidden)).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('Jan 12', hidden)).toHaveStyle({ fontWeight: '400' });
    // Bars between the labelled ones have no label of their own.
    expect(screen.queryByText('Jan 5', hidden)).toBeNull();
    expect(screen.queryByText('Jan 19', hidden)).toBeNull();
    expect(screen.queryByText('4')).toBeNull();
    expect(screen.getByText('4', hidden)).toBeTruthy();
  });

  it('labels every bar when labelEvery is 1', async () => {
    await renderChart({ labelEvery: 1 });
    for (const label of ['Jan 5', 'Jan 12', 'Jan 19', 'Jan 26']) {
      expect(screen.getByText(label, hidden)).toBeTruthy();
    }
  });

  describe('with a month of daily bars', () => {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const month = {
      fractions: days.map((day) => (day % 3) / 2),
      labels: days.map(String),
      descriptions: days.map((day) => `Day ${day}`),
      labelEvery: 5,
      selected: 30,
    };

    it('labels every fifth day, ending with the last', async () => {
      await renderChart(month);
      for (const label of ['1', '6', '11', '16', '21', '26', '31']) {
        expect(screen.getByText(label, hidden)).toBeTruthy();
      }
      for (const label of ['2', '5', '10', '15', '20', '25', '30']) {
        expect(screen.queryByText(label, hidden)).toBeNull();
      }
      expect(screen.getByText('31', hidden)).toHaveStyle({ fontWeight: '700' });
      expect(screen.getByText('26', hidden)).toHaveStyle({ fontWeight: '400' });
    });

    it('keeps one tappable column per day', async () => {
      const { onSelect } = await renderChart(month);
      expect(screen.getAllByRole('button', { name: /^Day / })).toHaveLength(31);
      await fireEvent.press(screen.getByLabelText('Day 12'));
      expect(onSelect).toHaveBeenLastCalledWith(11);
    });

    it('tightens the gaps between bars, so that many of them fit a narrow screen', async () => {
      await renderChart(month);
      expect(screen.getByTestId('t-plot')).toHaveStyle({ gap: 1 });
    });
  });

  it('keeps wider gaps for a handful of bars', async () => {
    await renderChart();
    expect(screen.getByTestId('t-plot')).toHaveStyle({ gap: 4 });
  });

  it('shows the empty text instead of a plot when there is no data', async () => {
    await renderChart({ hasData: false, fractions: [0, 0, 0, 0] });
    expect(screen.getByText('Sessions per week')).toBeTruthy();
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Week A: 2')).toBeNull();
    expect(screen.queryByText('Week B: 4')).toBeNull();
  });
});
