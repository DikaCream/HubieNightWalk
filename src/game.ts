// Round controller: balance, bets, picks, cash outs, autoplay and history. Framework free, the UI subscribes.
// Money is kept in integer cents so the balance never drifts.
import { LEVELS, MAX_BET, MIN_BET, buildLayout, floatsNeeded, payoutCents, type LevelId } from './engine';
import { hmacFloats, randomHex, sha256Hex } from './fair';

export type Status = 'idle' | 'live' | 'won' | 'lost';
export interface Round {
  id: number; level: LevelId; betCents: number; serverSeed: string; hash: string; clientSeed: string; nonce: number;
  layout: boolean[][]; picks: number[]; step: number; status: Status; payoutCents: number; time: number;
}
export interface HistoryItem { id: number; level: LevelId; betCents: number; steps: number; mult100: number; payoutCents: number; serverSeed: string; hash: string; clientSeed: string; nonce: number; picks: number[]; time: number }
export interface AutoCfg { rounds: number; onWin: 'reset' | 'raise'; winPct: number; onLoss: 'reset' | 'raise'; lossPct: number; stopProfit: number; stopLoss: number }

const q = new URLSearchParams(location.search);
// Dev server only test hook: lets scripts/playtest.mjs fix the server seed. import.meta.env.DEV is false in
// production builds, so the minifier drops this branch and the shipped game always rolls a random seed.
const DEBUG_SEED = import.meta.env.DEV ? q.get('debugseed') : null;
const START = 1_000_000; // $10,000.00 demo balance

export class Game {
  balance = START; betCents = 100; level: LevelId = 'medium';
  round: Round | null = null; history: HistoryItem[] = [];
  clientSeed = localStorage.getItem('hnw-client') || randomHex(8); nonce = 0;
  nextSeed = ''; nextHash = '';
  autoTarget: number | null = null; // multiplier, e.g. 2.5
  auto: AutoCfg = { rounds: 10, onWin: 'reset', winPct: 0, onLoss: 'reset', lossPct: 0, stopProfit: 0, stopLoss: 0 };
  autoRunning = false; autoLeft = 0; autoBase = 100; autoStartBal = 0;
  busy = false; fast = localStorage.getItem('hnw-fast') === '1';
  private subs = new Set<() => void>();
  ready: Promise<void>;
  constructor() { this.ready = this.rollSeed(); }
  on(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  emit() { this.subs.forEach(f => f()); }
  async rollSeed() { this.nextSeed = DEBUG_SEED || randomHex(32); this.nextHash = await sha256Hex(this.nextSeed); this.emit(); }
  setClientSeed(s: string) { this.clientSeed = s.slice(0, 64); localStorage.setItem('hnw-client', this.clientSeed); this.emit(); }
  get lv() { return LEVELS[this.round?.level ?? this.level]; }
  get inRound() { return this.round?.status === 'live'; }
  setBet(c: number) { if (this.inRound) return; this.betCents = Math.round(Math.min(MAX_BET * 100, Math.max(MIN_BET * 100, c))); this.emit(); }
  setLevel(l: LevelId) { if (this.inRound) return; this.level = l; this.emit(); }
  setFast(f: boolean) { this.fast = f; localStorage.setItem('hnw-fast', f ? '1' : '0'); this.emit(); }
  currentMult100() { const r = this.round; return r ? LEVELS[r.level].mult100[r.step] : 100; }
  currentPayout() { const r = this.round; return r ? payoutCents(r.betCents, this.currentMult100()) : 0; }
  canBet() { return !this.inRound && !this.busy && this.betCents >= MIN_BET * 100 && this.betCents <= MAX_BET * 100 && this.betCents <= this.balance; }

  /** Takes the bet and fixes every row of the round from the seeds. */
  async bet(): Promise<boolean> {
    if (!this.canBet()) return false;
    this.busy = true; this.emit();
    if (!this.nextSeed) await this.ready;
    const lv = LEVELS[this.level]; const serverSeed = this.nextSeed, hash = this.nextHash, nonce = this.nonce++;
    const fl = await hmacFloats(serverSeed, this.clientSeed, nonce, floatsNeeded(lv));
    this.balance -= this.betCents;
    this.round = { id: Date.now(), level: lv.id, betCents: this.betCents, serverSeed, hash, clientSeed: this.clientSeed, nonce, layout: buildLayout(lv, fl), picks: [], step: 0, status: 'live', payoutCents: 0, time: Date.now() };
    void this.rollSeed();
    this.busy = false; this.emit(); return true;
  }
  /** Returns 'safe' or 'trap' for a pick on the current row. The caller animates, then calls commit. */
  peek(tile: number): 'safe' | 'trap' | null {
    const r = this.round; if (!r || r.status !== 'live' || this.busy) return null;
    const row = r.layout[r.step]; if (tile < 0 || tile >= row.length) return null;
    return row[tile] ? 'trap' : 'safe';
  }
  commitPick(tile: number) {
    const r = this.round!; const trap = r.layout[r.step][tile]; r.picks.push(tile);
    if (trap) { r.status = 'lost'; r.payoutCents = 0; this.finish(); return 'trap' as const; }
    r.step++;
    if (r.step >= LEVELS[r.level].rows) { this.cashOut(); return 'max' as const; }
    this.emit(); return 'safe' as const;
  }
  shouldAutoCash() { const r = this.round; return !!r && r.status === 'live' && r.step > 0 && this.autoTarget !== null && this.currentMult100() >= Math.round(this.autoTarget * 100); }
  cashOut() {
    const r = this.round; if (!r || r.status !== 'live' || r.step < 1) return 0;
    r.payoutCents = payoutCents(r.betCents, LEVELS[r.level].mult100[r.step]); r.status = 'won';
    this.balance += r.payoutCents; this.finish(); return r.payoutCents;
  }
  private finish() {
    const r = this.round!;
    this.history.unshift({ id: r.id, level: r.level, betCents: r.betCents, steps: r.status === 'won' ? r.step : r.step, mult100: r.status === 'won' ? LEVELS[r.level].mult100[r.step] : 0, payoutCents: r.payoutCents, serverSeed: r.serverSeed, hash: r.hash, clientSeed: r.clientSeed, nonce: r.nonce, picks: r.picks.slice(), time: Date.now() });
    if (this.history.length > 100) this.history.length = 100;
    if (this.autoRunning) this.autoAfter(r);
    this.emit();
  }
  // ---------- autoplay bookkeeping (the UI drives the picks) ----------
  startAuto() { if (this.autoTarget === null || this.inRound) return false; this.autoRunning = true; this.autoLeft = this.auto.rounds; this.autoBase = this.betCents; this.autoStartBal = this.balance; this.emit(); return true; }
  stopAuto() { this.autoRunning = false; this.emit(); }
  private autoAfter(r: Round) {
    const won = r.status === 'won';
    const mode = won ? this.auto.onWin : this.auto.onLoss, pct = won ? this.auto.winPct : this.auto.lossPct;
    let next = mode === 'reset' ? this.autoBase : Math.round(r.betCents * (1 + pct / 100));
    next = Math.min(MAX_BET * 100, Math.max(MIN_BET * 100, next)); this.betCents = next;
    if (this.auto.rounds > 0) this.autoLeft--;
    const net = this.balance - this.autoStartBal;
    if ((this.auto.rounds > 0 && this.autoLeft <= 0) || (this.auto.stopProfit > 0 && net >= this.auto.stopProfit * 100) || (this.auto.stopLoss > 0 && -net >= this.auto.stopLoss * 100) || this.betCents > this.balance) this.autoRunning = false;
  }
}
