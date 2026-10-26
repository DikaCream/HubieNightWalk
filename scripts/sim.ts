// Monte Carlo check of the math. Run: npx tsx scripts/sim.ts [roundsPerStrategy]
// Each strategy = "pick a random tile on every row and cash out after k safe steps".
// The fast pass uses xorshift128+ floats through the real buildLayout. A smaller pass uses the real HMAC stream.
import { createHmac } from 'node:crypto';
import { LEVELS, LEVEL_ORDER, buildLayout, floatsNeeded, payoutCents, type Level } from '../src/engine.ts';

const N = Number(process.argv[2] || 2_000_000);
let a = 123456789, b = 362436069, c = 521288629, d = 88675123;
function rnd() { const t = a ^ (a << 11); a = b; b = c; c = d; d = (d ^ (d >>> 19)) ^ (t ^ (t >>> 8)); return (d >>> 0) / 4294967296; }

const STRATS: Record<string, number[]> = {
  easy: [1, 2, 3, 5, 8, 12, 20, 33], medium: [1, 2, 3, 5, 8, 12, 18, 23], hard: [1, 2, 3, 4, 6, 9], extreme: [1, 2, 3, 5, 7],
};
const BET = 100; // cents, so the cent rounding of payouts is included
function playRound(lv: Level, k: number, floats: ArrayLike<number>, pick: () => number) {
  const lay = buildLayout(lv, floats);
  for (let r = 0; r < k; r++) { const row = lay[r]; const t = row.length === 1 ? 0 : Math.floor(pick() * row.length); if (row[t]) return 0; }
  return payoutCents(BET, lv.mult100[k]);
}
const lines: string[] = [];
const say = (s: string) => { console.log(s); lines.push(s); };
say(`Hubie's Night Walk simulator, ${N.toLocaleString('en-US')} rounds per strategy, bet 100 cents, random tile picks`);
say(`Run at ${new Date().toISOString()}`);
say('');
let allOk = true;
for (const id of LEVEL_ORDER) {
  const lv = LEVELS[id];
  say(`${lv.name.toUpperCase()}: ${lv.tiles} tiles, ${lv.traps} trap${lv.traps > 1 ? 's' : ''}, safe ${lv.num}/${lv.den}, rows to cap ${lv.rows}, summit chance ${(lv.summitP * 100).toFixed(4)}%`);
  say('  cash out at   mult      exact RTP    sim RTP    95% range of sim        hit rate     max win   std dev (x bet)');
  const fl = new Float64Array(floatsNeeded(lv));
  for (const k of STRATS[id]) {
    let sum = 0, sq = 0, hits = 0, max = 0;
    const need = k * 4;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < need; j++) fl[j] = rnd();
      const w = playRound(lv, k, fl, rnd) / BET;
      sum += w; sq += w * w; if (w > 0) hits++; if (w > max) max = w;
    }
    const mean = sum / N, sd = Math.sqrt(sq / N - mean * mean);
    let pr = 1; for (let r = 0; r < k; r++) pr *= r === lv.rows - 1 ? lv.summitP : lv.num / lv.den;
    const theory = pr * lv.mult100[k] / 100;
    const se = sd / Math.sqrt(N);
    const inBand = theory >= 0.955 && theory <= 0.965, agrees = Math.abs(mean - theory) <= 3 * se, simBand = mean >= 0.955 && mean <= 0.965;
    if (!inBand || !agrees) allOk = false;
    const lo = ((mean - 1.96 * se) * 100).toFixed(2), hi = ((mean + 1.96 * se) * 100).toFixed(2);
    say(`  ${String(k).padStart(4)}        ${(lv.mult100[k] / 100).toFixed(2).padStart(9)}   ${(theory * 100).toFixed(3).padStart(7)}%   ${(mean * 100).toFixed(3).padStart(7)}%  ${(lo + '% to ' + hi + '%').padStart(20)}  ${(hits / N * 100).toFixed(4).padStart(8)}%  ${max.toFixed(2).padStart(9)}x  ${sd.toFixed(2).padStart(8)}  ${inBand && agrees ? 'OK' : 'FAIL'}${simBand ? '' : ' (sim noise: band smaller than sampling error)'}`);
  }
  say('');
}
// HMAC cross check: same scheme as the browser, fewer rounds because HMAC is slower.
const H = Math.min(200_000, N);
say(`HMAC stream cross check, ${H.toLocaleString('en-US')} rounds each (server seed "sim", client seed "check")`);
for (const [id, k] of [['medium', 3], ['easy', 5], ['hard', 2], ['extreme', 1]] as [keyof typeof LEVELS, number][]) {
  const lv = LEVELS[id]; let sum = 0; const fl: number[] = [];
  for (let nonce = 0; nonce < H; nonce++) {
    fl.length = 0;
    for (let bl = 0; bl * 8 < k * 4; bl++) { const h = createHmac('sha256', 'sim').update(`check:${nonce}:${bl}`).digest(); for (let i = 0; i < 32; i += 4) fl.push(h.readUInt32BE(i) / 2 ** 32); }
    sum += playRound(lv, k, fl, () => (nonce * 0.6180339887) % 1) / BET;
  }
  say(`  ${lv.name} cash out at ${k}: RTP ${(sum / H * 100).toFixed(3)}%`);
}
say('');
say('How to read this: exact RTP is computed from the layout odds and the paytable. A strategy passes when its exact RTP sits inside');
say('95.5% to 96.5% and the simulated RTP agrees with it within 3 standard errors. Deep strategies hit so rarely (under 0.1%)');
say('that 2 million rounds cannot pin their RTP to half a percent; their 95% range is wide, and that is sampling noise, not a math leak.');
say(allOk ? 'RESULT: every strategy passes' : 'RESULT: at least one strategy FAILS');
const fs = await import('node:fs');
fs.writeFileSync(new URL('../sim-result.txt', import.meta.url), lines.join('\n') + '\n');
