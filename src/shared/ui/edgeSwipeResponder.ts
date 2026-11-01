import {
  PanResponder,
  type PanResponderGestureState,
  type PanResponderInstance,
} from 'react-native';

import { isBackSwipe, isEdgeSwipe, type Swipe } from './edgeSwipe';

/**
 * Touch handlers that call `onBack` when the player swipes in from the left or right edge of a
 * screen `screenWidth` wide. Only touches that start in an edge strip are taken over, so scrolling
 * and the horizontal pickers keep working.
 */
export function createEdgeSwipeResponder(
  screenWidth: number,
  onBack: () => void,
): PanResponderInstance {
  let start: { x: number; y: number } | null = null;

  // Measured from where the first finger landed: the gesture's own dx and dy start again from
  // zero once the touch is taken over.
  const swipeOf = ({ moveX, moveY }: PanResponderGestureState): Swipe | null =>
    start && { startX: start.x, screenWidth, dx: moveX - start.x, dy: moveY - start.y };

  return PanResponder.create({
    // Note where the first finger lands, but leave the touch to whatever is under it. A second
    // finger ends the tracking: two fingers are not a back swipe.
    onStartShouldSetPanResponderCapture: ({ nativeEvent }) => {
      start =
        nativeEvent.touches.length === 1 ? { x: nativeEvent.pageX, y: nativeEvent.pageY } : null;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      const swipe = swipeOf(gesture);
      return swipe !== null && isEdgeSwipe(swipe);
    },
    onPanResponderTerminationRequest: () => false,
    // Only a finger that is lifted goes back. When Android's own back gesture takes over, the
    // touch is cancelled instead, so the two never both navigate.
    onPanResponderRelease: (_event, gesture) => {
      const swipe = swipeOf(gesture);
      if (swipe && isBackSwipe(swipe)) onBack();
    },
  });
}
