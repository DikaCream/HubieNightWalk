// Pure game math for Hubie's Night Walk. Shared by the UI, the simulator and the verifier script.
// No randomness lives here: every outcome comes from floats derived from the provably fair HMAC stream.

export const RTP100 = 96; // 96% return to player, in percent
export const MAX_WIN = 10_000; // payout cap as a multiple of the bet
export const MIN_BET = 0.1, MAX_BET = 20;
export const FLOATS_PER_ROW = 4;

export type LevelId = 'easy' | 'medium' | 'hard' | 'extreme';
export interface Level {
  id: LevelId; name: string; tiles: number; traps: number;
  /** Safe chance per normal row as a fraction num / den. */
  num: number; den: number;
  /** Total rows. The last one is the Summit, which pays the 10,000x cap. */
  rows: number;
  /** mult100[n] = multiplier after n safe steps, in hundredths. mult100[rows] = 1,000,000 (10,000x). */
  mult100: number[];
  /** Chance to clear the Summit, chosen so that walking to the top still returns 96%. */
  summitP: number;
}

function makeLevel(id: LevelId, name: string, tiles: number, traps: number): Level {
  const num = tiles - traps, den = tiles;
  // Exact integer math: floor(96 * den^n / num^n) hundredths, so no float rounding at the 2 decimal boundary.
  const mult100: number[] = [100];
  let n = 1;
  for (;; n++) {
    const v = (BigInt(RTP100) * BigInt(den) ** BigInt(n)) / BigInt(num) ** BigInt(n);
    if (v >= BigInt(MAX_WIN * 100)) break;
    mult100.push(Number(v));
  }
  mult100.push(MAX_WIN * 100);
  const rows = n;
  const summitP = mult100[rows - 1] / (MAX_WIN * 100);
  return { id, name, tiles, traps, num, den, rows, mult100, summitP };
}

export const LEVELS: Record<LevelId, Level> = {
  easy: makeLevel('easy', 'Easy', 4, 1),
  medium: makeLevel('medium', 'Medium', 3, 1),
  hard: makeLevel('hard', 'Hard', 3, 2),
  extreme: makeLevel('extreme', 'Extreme', 4, 3),
};
export const LEVEL_ORDER: LevelId[] = ['easy', 'medium', 'hard', 'extreme'];

/** Multiplier after n safe steps (n = 0 means no step yet). */
export const multAt = (lv: Level, n: number) => lv.mult100[Math.min(n, lv.rows)] / 100;
export const isSummit = (lv: Level, row: number) => row === lv.rows - 1;
/** Tiles drawn on a row. The Summit is one wide ledge. */
export const tilesOn = (lv: Level, row: number) => (isSummit(lv, row) ? 1 : lv.tiles);
export const floatsNeeded = (lv: Level) => lv.rows * FLOATS_PER_ROW;

/**
 * Build the hidden layout of a whole round. Row r reads floats 4r..4r+3.
 * Normal rows: Fisher Yates shuffle of tile indexes driven by the floats, the first `traps` indexes are traps.
 * Summit row: safe when the first float is below summitP.
 * Returns rows[r][tile] = true when that tile is a trap.
 */
export function buildLayout(lv: Level, floats: ArrayLike<number>): boolean[][] {
  const out: boolean[][] = [];
  for (let r = 0; r < lv.rows; r++) {
    const f = r * FLOATS_PER_ROW;
    if (isSummit(lv, r)) { out.push([floats[f] >= lv.summitP]); continue; }
    const idx: number[] = []; for (let i = 0; i < lv.tiles; i++) idx.push(i);
    for (let i = lv.tiles - 1, k = 0; i > 0; i--, k++) {
      const j = Math.floor(floats[f + k] * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    const row = new Array<boolean>(lv.tiles).fill(false);
    for (let t = 0; t < lv.traps; t++) row[idx[t]] = true;
    out.push(row);
  }
  return out;
}

/** Payout in cents for a bet in cents at a multiplier in hundredths, rounded down to the cent. */
export const payoutCents = (betCents: number, mult100: number) => Math.floor((betCents * mult100) / 100);
