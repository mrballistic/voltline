// Every AI evaluation weight, in point units (starting values; Task 9's benchmark tunes them).
export const W = {
  special: { charge: 150, arc: 250, prism: 600 },
  rockCleared: 40,
  levelUp: 1500,
  healthPerMove: 15,
  healthFloor: 3,
  belowFloorPenalty: 400,
  gameOver: -100000,
  trayPieceSpent: 300,
};

// Board health counts at most this many productive moves; past it, more options add nothing.
export const HEALTH_CAP = 20;
