// Every animation timing value (spec §6.2). Tune the feel here and nowhere else.
export const ANIM = {
  swapMs: 180,
  dragReturnMs: 120, // a grabbed piece easing back to its cell after a cancelled or ignored drag
  invalidMs: 160,
  popGrowMs: 110,
  popScale: 1.15,
  popCollapseMs: 140,
  sparks: [8, 14] as const,
  gravity: 60, // cells/s²
  landMs: 120,
  landSquash: { x: 1.08, y: 0.88 },
  landReboundCells: 0.1,
  // Shares of landMs: squash on impact, rise into the rebound; falling back takes the rest.
  landPhases: { squash: 0.3, rise: 0.35 },
  cascadeOverlapMs: 40,
  chargeShake: { px: 3, ms: 150 },
  blastStaggerMs: 60,
  arcBeamMs: 200,
  prismBoltStaggerMs: 30,
  createMs: 220,
  morphScale: 1.2,
  trayFlyMs: 450,
  placeMs: 220,
  boardOutMs: 500,
  glow: { alphaLo: 0.221, alphaHi: 0.793, scaleLo: 0.983, scaleHi: 1.031, periodS: 3.46 },
  selectPulseS: 0.9,
  hint: { revealMs: 1000, holdMs: 4000, maxArrows: 12, maxPlacements: 3 },
  reducedMotionTimeScale: 1.6,
  // Invalid swap: a short horizontal shake of both pieces once they are back (off with reduced motion).
  invalidShake: { cells: 0.07, ms: 150, cycles: 3 },
  supernovaShake: { px: 7, ms: 340 },
  // Effect-only values (src/render/effects.ts). Sizes in cells, speeds in cells/s. Effects are
  // fire-and-forget: none of these delays a play.
  fx: {
    sparkPool: 512,
    decalPool: 160,
    boltPool: 32,
    sparkLifeMs: [300, 600] as const,
    sparkSpeed: [3, 9] as const,
    sparkDrag: 3.5, // 1/s
    sparkGravity: 6, // cells/s²
    sparkSize: 0.24,
    sparkStretch: 0.3, // extra streak length per cell/s
    sparkWhiteShare: 0.3, // share of sparks drawn half-way to white (hot cores)
    chargeRingMs: 360,
    chargeRingCells: 1.9,
    chargeFlashMs: 220,
    chargeSparks: 18,
    chargeCrackles: 5,
    arcBeamCells: 0.8,
    arcFadeMs: 240,
    boltMs: 180,
    boltJitterCells: 0.22,
    boltRejags: 2,
    prismBoltWeight: 1.6,
    novaFlashMs: 450,
    novaRingCells: 6,
    morphRingMs: 280,
    morphSparks: 10,
  },
} as const;

/** Time to fall `cells` from rest under constant gravity: √(2d/g), in ms. */
export function fallDurationMs(cells: number): number {
  return 1000 * Math.sqrt((2 * cells) / ANIM.gravity);
}

/** Drag input geometry, in cells: a drag past `thresholdCells` swaps, and the grabbed piece follows the pointer up to `maxOffsetCells`. */
export const DRAG = { thresholdCells: 0.3, maxOffsetCells: 0.5 } as const;
