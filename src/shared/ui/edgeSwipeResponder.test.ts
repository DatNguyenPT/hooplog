import type { GestureResponderEvent } from 'react-native';

import { createEdgeSwipeResponder } from './edgeSwipeResponder';

const WIDTH = 400;
type Point = readonly [x: number, y: number];

let clock = 0;

/** A touch event with the touch history that React Native's responder system adds to it. */
function touchEvent([x, y]: Point, previous: Point = [x, y], fingers = 1): GestureResponderEvent {
  clock += 16;
  return {
    nativeEvent: { touches: Array.from({ length: fingers }, () => ({})), pageX: x, pageY: y },
    touchHistory: {
      touchBank: [
        {
          touchActive: true,
          currentPageX: x,
          currentPageY: y,
          currentTimeStamp: clock,
          previousPageX: previous[0],
          previousPageY: previous[1],
          previousTimeStamp: clock - 16,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: clock,
    },
  } as unknown as GestureResponderEvent;
}

/** Plays one finger along `path` through the handlers, the way the responder system would. */
function play(path: Point[], finish: 'lift' | 'cancel' = 'lift') {
  const onBack = jest.fn();
  const handlers = createEdgeSwipeResponder(WIDTH, onBack).panHandlers;
  handlers.onStartShouldSetResponderCapture?.(touchEvent(path[0]));

  let claimed = false;
  let last = touchEvent(path[0]);
  path.slice(1).forEach((point, i) => {
    last = touchEvent(point, path[i]);
    if (claimed) {
      handlers.onResponderMove?.(last);
    } else if (handlers.onMoveShouldSetResponderCapture?.(last)) {
      claimed = true;
      handlers.onResponderGrant?.(last);
    }
  });
  if (claimed) {
    if (finish === 'lift') handlers.onResponderRelease?.(last);
    else handlers.onResponderTerminate?.(last);
  }
  return { onBack, claimed };
}

describe('createEdgeSwipeResponder', () => {
  it('goes back, once, after a long swipe in from the right edge', () => {
    const { onBack, claimed } = play([
      [396, 300],
      [380, 302],
      [330, 304],
      [300, 305],
    ]);
    expect(claimed).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('goes back after a long swipe in from the left edge', () => {
    const { onBack, claimed } = play([
      [4, 300],
      [20, 300],
      [60, 302],
      [90, 303],
    ]);
    expect(claimed).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('counts the distance from where the finger landed, not from where the swipe was noticed', () => {
    // Noticed after 13 dp; 76 dp in all, but only 63 dp after being noticed.
    const { onBack } = play([
      [396, 300],
      [383, 300],
      [320, 300],
    ]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('notices a short swipe but does not go back', () => {
    const { onBack, claimed } = play([
      [396, 300],
      [380, 300],
      [366, 300],
    ]);
    expect(claimed).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not go back when the system cancels the touch, as its own back gesture does', () => {
    const { onBack, claimed } = play(
      [
        [396, 300],
        [380, 302],
        [330, 304],
        [300, 305],
      ],
      'cancel',
    );
    expect(claimed).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('leaves a swipe that starts away from the edges to the screen', () => {
    const { onBack, claimed } = play([
      [200, 300],
      [150, 300],
      [60, 300],
    ]);
    expect(claimed).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('leaves a mostly vertical drag along the edge to the screen', () => {
    const { onBack, claimed } = play([
      [396, 300],
      [388, 360],
      [380, 520],
    ]);
    expect(claimed).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('stops tracking when a second finger lands', () => {
    const handlers = createEdgeSwipeResponder(WIDTH, jest.fn()).panHandlers;
    handlers.onStartShouldSetResponderCapture?.(touchEvent([396, 300]));
    handlers.onStartShouldSetResponderCapture?.(touchEvent([200, 300], undefined, 2));
    expect(handlers.onMoveShouldSetResponderCapture?.(touchEvent([330, 300], [396, 300]))).toBe(
      false,
    );
  });

  it('never takes over the touch when it starts', () => {
    const handlers = createEdgeSwipeResponder(WIDTH, jest.fn()).panHandlers;
    expect(handlers.onStartShouldSetResponderCapture?.(touchEvent([396, 300]))).toBe(false);
  });
});
