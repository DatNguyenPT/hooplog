import {
  BACK_DISTANCE,
  CLAIM_DISTANCE,
  EDGE_ZONE,
  inwardTravel,
  isBackSwipe,
  isEdgeSwipe,
} from './edgeSwipe';

const WIDTH = 400;
const swipe = (startX: number, dx: number, dy = 0) => ({ startX, screenWidth: WIDTH, dx, dy });

describe('inwardTravel', () => {
  it('measures a drag from the left edge towards the middle', () => {
    expect(inwardTravel(swipe(4, 90))).toBe(90);
  });

  it('measures a drag from the right edge towards the middle', () => {
    expect(inwardTravel(swipe(WIDTH - 4, -90))).toBe(90);
  });

  it('counts the whole edge strip and nothing beyond it', () => {
    expect(inwardTravel(swipe(EDGE_ZONE, 80))).toBe(80);
    expect(inwardTravel(swipe(WIDTH - EDGE_ZONE, -80))).toBe(80);
    expect(inwardTravel(swipe(EDGE_ZONE + 1, 80))).toBe(0);
    expect(inwardTravel(swipe(WIDTH - EDGE_ZONE - 1, -80))).toBe(0);
  });

  it('ignores a touch that began in the middle of the screen', () => {
    expect(inwardTravel(swipe(WIDTH / 2, 200))).toBe(0);
    expect(inwardTravel(swipe(WIDTH / 2, -200))).toBe(0);
  });

  it('ignores a drag that heads off the screen', () => {
    expect(inwardTravel(swipe(4, -90))).toBe(0);
    expect(inwardTravel(swipe(WIDTH - 4, 90))).toBe(0);
  });

  it('ignores a drag that goes more up and down than sideways', () => {
    expect(inwardTravel(swipe(4, 40, 40))).toBe(0);
    expect(inwardTravel(swipe(4, 40, -30))).toBe(0);
    expect(inwardTravel(swipe(4, 60, 30))).toBe(0);
  });

  it('forgives a little vertical wobble', () => {
    expect(inwardTravel(swipe(4, 80, 30))).toBe(80);
    expect(inwardTravel(swipe(WIDTH - 4, -80, -30))).toBe(80);
  });
});

describe('isEdgeSwipe', () => {
  it('waits for the finger to travel a few dp before taking the touch over', () => {
    expect(isEdgeSwipe(swipe(4, CLAIM_DISTANCE - 1))).toBe(false);
    expect(isEdgeSwipe(swipe(4, CLAIM_DISTANCE))).toBe(true);
    expect(isEdgeSwipe(swipe(WIDTH - 4, -CLAIM_DISTANCE))).toBe(true);
  });

  it('leaves a touch in the middle of the screen alone, so lists and pickers scroll as usual', () => {
    expect(isEdgeSwipe(swipe(WIDTH / 2, 300))).toBe(false);
  });
});

describe('isBackSwipe', () => {
  it('needs a long enough swipe from either edge', () => {
    expect(isBackSwipe(swipe(4, BACK_DISTANCE - 1))).toBe(false);
    expect(isBackSwipe(swipe(4, BACK_DISTANCE))).toBe(true);
    expect(isBackSwipe(swipe(WIDTH - 4, -(BACK_DISTANCE - 1)))).toBe(false);
    expect(isBackSwipe(swipe(WIDTH - 4, -BACK_DISTANCE))).toBe(true);
  });

  it('never goes back for a swipe that began in the middle of the screen', () => {
    expect(isBackSwipe(swipe(WIDTH / 2, 300))).toBe(false);
    expect(isBackSwipe(swipe(WIDTH / 2, -300))).toBe(false);
  });

  it('does not go back for a mostly vertical drag, however long', () => {
    expect(isBackSwipe(swipe(4, BACK_DISTANCE, 200))).toBe(false);
  });
});
