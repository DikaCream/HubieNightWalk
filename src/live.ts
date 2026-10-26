// Live activity feed. The UI only talks to the LiveSource interface, so the casino can swap
// SimulatedLive for a real data source later (websocket, polling, whatever the host provides).
// Everything SimulatedLive produces is invented for the demo: fake names, fake bets.
import { LEVELS, LEVEL_ORDER, type LevelId } from './engine';

export type LiveEvent =
  | { kind: 'bet'; id: number; player: string; bet: number; level: LevelId; at: number }
  | { kind: 'cashout'; id: number; player: string; bet: number; level: LevelId; mult: number; payout: number; at: number }
  | { kind: 'bust'; id: number; player: string; bet: number; level: LevelId; step: number; at: number };

export interface LiveSource {
  /** Starts delivering events. Returns an unsubscribe function. */
  subscribe(cb: (e: LiveEvent) => void): () => void;
  /** True when the data is simulated. The UI shows a demo label when it is. */
  readonly simulated: boolean;
}

const FIRST = ['moon', 'neon', 'velvet', 'lucky', 'slow', 'quiet', 'tophat', 'alley', 'night', 'rooftop', 'jade', 'copper', 'mint', 'sly', 'ember', 'echo'];
const LAST = ['otter', 'fox', 'owl', 'crane', 'tiger', 'panda', 'lynx', 'heron', 'koala', 'gecko', 'mole', 'raven'];
const BETS = [0.1, 0.2, 0.25, 0.5, 1, 1, 2, 2, 5, 10, 20];

export class SimulatedLive implements LiveSource {
  readonly simulated = true;
  private id = 0;
  private pick<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }
  private name() { return this.pick(FIRST) + '_' + this.pick(LAST) + (Math.random() < 0.5 ? Math.floor(Math.random() * 99) : ''); }
  subscribe(cb: (e: LiveEvent) => void) {
    let alive = true; const timers = new Set<number>();
    const later = (ms: number, fn: () => void) => { const t = window.setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); };
    const spawn = () => {
      const player = this.name(), bet = this.pick(BETS);
      const level = Math.random() < 0.55 ? 'medium' : this.pick(LEVEL_ORDER);
      const lv = LEVELS[level];
      cb({ kind: 'bet', id: ++this.id, player, bet, level, at: Date.now() });
      // Play the fake round with the real odds so the feed looks like the real game.
      let n = 0; const target = 1 + Math.floor(-Math.log(Math.random()) * (level === 'easy' ? 5 : level === 'medium' ? 3.2 : 1.4));
      while (n < Math.min(target, lv.rows) && Math.random() < (n === lv.rows - 1 ? lv.summitP : lv.num / lv.den)) n++;
      const done = n >= Math.min(target, lv.rows);
      later(1500 + Math.random() * 5000, () => {
        if (done) { const mult = lv.mult100[n] / 100; cb({ kind: 'cashout', id: ++this.id, player, bet, level, mult, payout: Math.floor(bet * lv.mult100[n]) / 100, at: Date.now() }); }
        else cb({ kind: 'bust', id: ++this.id, player, bet, level, step: n + 1, at: Date.now() });
      });
      later(700 + Math.random() * 2200, spawn);
    };
    later(400, spawn);
    return () => { alive = false; timers.forEach(t => clearTimeout(t)); timers.clear(); };
  }
}

export const liveSource: LiveSource = new SimulatedLive();
