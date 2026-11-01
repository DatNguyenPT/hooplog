/** Width of the strip along each side of the screen where a back swipe may start (dp). */
export const EDGE_ZONE = 28;
/** Sideways travel after which a touch counts as a swipe, not a tap or a scroll (dp). */
export const CLAIM_DISTANCE = 12;
/** Sideways travel needed before lifting the finger goes back (dp). */
export const BACK_DISTANCE = 64;

export type Swipe = {
  /** Where the finger first touched, measured from the left side of the screen. */
  startX: number;
  screenWidth: number;
  /** Travel since the touch began: positive is right and down. */
  dx: number;
  dy: number;
};

/**
 * How far a touch has been dragged from a screen edge towards the middle. 0 when it did not start
 * in an edge strip, heads off the screen, or goes more up and down than sideways (a scroll).
 */
export function inwardTravel({ startX, screenWidth, dx, dy }: Swipe): number {
  const fromLeft = startX <= EDGE_ZONE;
  const fromRight = startX >= screenWidth - EDGE_ZONE;
  if (!fromLeft && !fromRight) return 0;
  const inward = fromLeft ? dx : -dx;
  return inward > Math.abs(dy) * 2 ? inward : 0;
}

/** Clearly a sideways drag from a screen edge: time to take the touch over from what is underneath. */
export const isEdgeSwipe = (swipe: Swipe): boolean => inwardTravel(swipe) >= CLAIM_DISTANCE;

/** The finger was lifted after a swipe from a screen edge that was long enough to go back. */
export const isBackSwipe = (swipe: Swipe): boolean => inwardTravel(swipe) >= BACK_DISTANCE;
