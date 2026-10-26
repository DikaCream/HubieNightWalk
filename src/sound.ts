// Procedural music and sound effects for Hubie's Night Walk. WebAudio only, no audio files.
// Original groove in D minor at 96 to 112 BPM: kick, snare and hats, a walking sub bass, a four chord pad,
// a short lead hook, a 16th note arp and a tension layer. Layers join as Hubie climbs (intensity 0 to 4).
// A lookahead scheduler books every 16th note against the AudioContext clock, so timing does not drift.
// Every voice disconnects its nodes when it ends, and a polyphony cap protects slow phones.

type Ctx = BaseAudioContext;
const MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad/.test(navigator.userAgent);
const N = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Engine {
  c: Ctx; out: GainNode; music: GainNode; sfx: GainNode; tone: BiquadFilterNode; duck: GainNode;
  voices = 0; cap: number; noise: AudioBuffer;
  // scheduler state
  step = 0; next = 0; bar = 0; bpm = 100; intensity = 0; target = 0; playing = false;
  private seed = 7;
  /** When set, stingers start at this time instead of now (used by the offline render). */
  at: number | null = null;
  private now() { return this.at ?? this.c.currentTime; }
  constructor(c: Ctx, dest: AudioNode, live: boolean) {
    this.c = c; this.cap = live ? (MOBILE ? 36 : 56) : 10_000;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.out = c.createGain(); this.out.gain.value = 0.7;
    this.music = c.createGain(); this.music.gain.value = 0.55;
    this.sfx = c.createGain(); this.sfx.gain.value = 0.8;
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 9000; this.tone.Q.value = 0.7;
    this.duck = c.createGain();
    this.duck.connect(this.tone); this.tone.connect(this.music); this.music.connect(comp); this.sfx.connect(comp); comp.connect(this.out); this.out.connect(dest);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  private room() { return this.voices < this.cap; }
  osc(f: number, type: OscillatorType, t: number, dur: number, vol: number, dest: AudioNode, o: { glide?: number; att?: number; cut?: number; q?: number; det?: number; rel?: number } = {}) {
    if (!this.room()) return; const c = this.c;
    const os = c.createOscillator(), g = c.createGain(); os.type = type; os.frequency.setValueAtTime(f, t); if (o.det) os.detune.value = o.det;
    if (o.glide) os.frequency.exponentialRampToValueAtTime(o.glide, t + Math.min(dur, 0.15));
    const att = o.att ?? 0.004; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.setTargetAtTime(0.0001, t + Math.max(att, dur - (o.rel ?? dur * 0.6)), (o.rel ?? dur * 0.6) / 4);
    let fl: BiquadFilterNode | null = null;
    if (o.cut) { fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.cut * 3, t); fl.frequency.exponentialRampToValueAtTime(o.cut, t + Math.min(dur, 0.2)); fl.Q.value = o.q ?? 2; os.connect(fl).connect(g); } else os.connect(g);
    g.connect(dest); this.voices++;
    os.onended = () => { this.voices--; os.disconnect(); fl?.disconnect(); g.disconnect(); };
    os.start(t); os.stop(t + dur + 0.05);
  }
  hiss(t: number, dur: number, vol: number, f: number, q: number, type: BiquadFilterType, dest: AudioNode, sweep?: number) {
    if (!this.room()) return; const c = this.c;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (sweep ? dur * 0.8 : 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); this.voices++;
    s.onended = () => { this.voices--; s.disconnect(); fl.disconnect(); g.disconnect(); };
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  // ---------- drum kit ----------
  kick(t: number, v = 0.9) { this.osc(140, 'sine', t, 0.34, v, this.music, { glide: 42, att: 0.002, rel: 0.25 }); this.pump(t); }
  pump(t: number) { const g = this.duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.55, t); g.setTargetAtTime(1, t + 0.02, 0.06); }
  snare(t: number, v = 0.32) { this.hiss(t, 0.18, v, 1900, 0.8, 'bandpass', this.duck); this.osc(200, 'triangle', t, 0.09, v * 0.6, this.duck, { glide: 150 }); }
  hat(t: number, v = 0.06, open = false) { this.hiss(t, open ? 0.22 : 0.035, v, open ? 7000 : 9000, 1, 'highpass', this.duck); }
  rim(t: number, v = 0.09) { this.osc(1650, 'square', t, 0.02, v, this.duck, { cut: 2500 }); }
  tom(t: number, m: number, v = 0.28) { this.osc(N(m), 'sine', t, 0.22, v, this.duck, { glide: N(m) * 0.6 }); }

  // ---------- harmony ----------
  // Section A: Dm9, Bbmaj7, Gm9, A7sus4 to A7. Section B: Gm7, Dm/F, Ebmaj7, A7(b9).
  static A = [[50, 57, 60, 64, 65], [46, 57, 62, 65, 69], [43, 58, 62, 65, 69], [45, 57, 62, 64, 67]];
  static B = [[43, 58, 62, 65, 70], [41, 57, 60, 62, 65], [39, 55, 58, 62, 67], [45, 55, 58, 61, 64]];
  // Lead hook (16 steps, -1 = rest), written for this game.
  static HOOK = [69, -1, 72, 74, -1, -1, 77, 76, -1, 74, -1, 72, 69, -1, 67, 69];
  static HOOK2 = [74, -1, 77, 79, -1, 77, 76, -1, 74, -1, 72, -1, 74, 76, 77, -1];
  static BASS = [0, -1, -1, 0, -1, -1, 12, -1, 0, -1, 7, -1, -1, 10, 12, -1];

  /** Book every 16th note up to time `until`. */
  scheduleUntil(until: number) {
    while (this.next < until) { this.tick(this.next, this.step); const spb = 60 / this.bpm; this.next += spb / 4; this.step = (this.step + 1) % 16; if (this.step === 0) this.newBar(this.next); }
  }
  private newBar(t: number) {
    this.bar++;
    // intensity eases toward the target one level per bar, so layers join on the bar line
    if (this.intensity < this.target) this.intensity++; else if (this.intensity > this.target) this.intensity--;
    this.bpm = 98 + this.intensity * 3.5;
    this.tone.frequency.setTargetAtTime(this.intensity >= 4 ? 12000 : 5200 + this.intensity * 1500, t, 0.4);
  }
  private tick(t: number, s: number) {
    const I = this.intensity, sec = Math.floor(this.bar / 8) % 2, chordSet = sec ? Engine.B : Engine.A, ch = chordSet[Math.floor(this.bar / 2) % 4];
    const sw = s % 2 === 1 ? (60 / this.bpm / 4) * (I < 3 ? 0.16 : 0.06) : 0; const T = t + sw;
    const breakdown = this.bar % 16 === 15 && I < 4; // one bar of air every 16 bars
    // drums
    if (!breakdown) {
      const kickPat = I >= 3 ? [0, 4, 8, 12] : I >= 1 ? [0, 7, 10] : [0, 10];
      if (kickPat.includes(s)) this.kick(t, s === 0 ? 0.95 : 0.8);
      if (I >= 1 && (s === 4 || s === 12)) this.snare(t);
      if (I >= 4 && s >= 12 && this.bar % 4 === 3) this.snare(t, 0.12 + (s - 12) * 0.05);
      if (s % 2 === 0 || I >= 2) this.hat(T, s % 4 === 2 ? 0.07 : 0.04, I >= 2 && s % 8 === 6);
      if (I >= 2 && (s === 3 || s === 11 || s === 14)) this.rim(T);
      if (I >= 4 && this.bar % 8 === 7 && s >= 8 && s % 2 === 0) this.tom(t, 50 - (s - 8), 0.22);
    } else if (s === 0) this.hiss(t, 60 / this.bpm * 4, 0.08, 400, 1, 'bandpass', this.duck, 6000);
    // bass
    if (I >= 1 && !breakdown) { const b = Engine.BASS[s]; if (b >= 0) this.osc(N(ch[0] - 12 + b), I >= 3 ? 'sawtooth' : 'triangle', t, 0.2, 0.32, this.duck, { cut: 380 + I * 90, q: 5 }); }
    // chords: stabs on the off beat plus a soft pad on bar starts
    if (s === 0 && this.bar % 2 === 0) for (const m of ch.slice(1)) this.osc(N(m), 'triangle', t, (60 / this.bpm) * 7.5, 0.035, this.duck, { att: 0.25, rel: 1.2, det: (this.rnd() - 0.5) * 12 });
    if ((s === 6 || s === 14) && !breakdown) for (const m of ch.slice(1, 4)) this.osc(N(m + 12), 'sawtooth', T, 0.14, 0.018, this.duck, { cut: 1800 + I * 300 });
    // lead hook from intensity 2, second phrase in section B
    if (I >= 2 && !breakdown && this.bar % 2 === 0) { const h = (sec ? Engine.HOOK2 : Engine.HOOK)[s]; if (h > 0) { this.osc(N(h), 'square', T, 0.2, 0.05, this.duck, { cut: 2400, q: 3 }); this.osc(N(h + 12), 'sine', T, 0.25, 0.025, this.duck); } }
    // 16th arp from intensity 3
    if (I >= 3 && !breakdown) { const notes = ch.slice(1); const m = notes[(s * 3) % notes.length] + (s % 8 >= 4 ? 12 : 0); this.osc(N(m), 'sawtooth', T, 0.09, 0.022, this.duck, { cut: 2600, q: 6 }); }
    // tension pulse at the top
    if (I >= 4 && s % 4 === 2) this.osc(N(81 + (this.bar % 2)), 'sine', t, 0.08, 0.02, this.duck);
  }

  // ---------- sound effects and stingers ----------
  sfxPick() { const t = this.now(); this.osc(880, 'triangle', t, 0.05, 0.12, this.sfx); }
  sfxSafe(row: number) { const t = this.now(); const base = 62 + (row % 12); [0, 4, 7].forEach((d, i) => this.osc(N(base + d + 12), 'triangle', t + i * 0.045, 0.22, 0.12, this.sfx)); this.osc(N(base + 24), 'sine', t + 0.14, 0.4, 0.05, this.sfx); }
  sfxHop() { const t = this.now(); this.osc(300, 'sine', t, 0.18, 0.12, this.sfx, { glide: 720 }); }
  sfxLand() { const t = this.now(); this.osc(110, 'sine', t, 0.12, 0.3, this.sfx, { glide: 60 }); this.hiss(t, 0.06, 0.08, 1200, 1, 'bandpass', this.sfx); }
  sfxBet() { const t = this.now(); this.osc(523, 'square', t, 0.06, 0.05, this.sfx, { cut: 2000 }); this.osc(784, 'square', t + 0.05, 0.08, 0.05, this.sfx, { cut: 2000 }); }
  sfxClick() { this.osc(1200, 'sine', this.now(), 0.03, 0.05, this.sfx); }
  /** Trap: the vent pops, a falling detuned slide, then a low thud. */
  stingTrap() { const t = this.now();
    this.hiss(t, 0.5, 0.35, 900, 0.6, 'bandpass', this.sfx, 180);
    this.osc(N(62), 'sawtooth', t + 0.05, 0.7, 0.1, this.sfx, { glide: N(38), cut: 1200 });
    this.osc(N(61), 'sawtooth', t + 0.05, 0.7, 0.08, this.sfx, { glide: N(37), cut: 1200, det: 18 });
    [57, 56, 53, 50].forEach((m, i) => this.osc(N(m), 'triangle', t + 0.35 + i * 0.13, 0.22, 0.09, this.sfx));
    this.osc(70, 'sine', t + 0.9, 0.4, 0.4, this.sfx, { glide: 40 });
  }
  /** Cash out: rising D major arpeggio with a bell on top. tier 0 to 4 adds length and weight. */
  stingCash(tier = 0) { const t = this.now(); const seq = [62, 66, 69, 74, 78, 81, 86, 90].slice(0, 4 + tier);
    seq.forEach((m, i) => { this.osc(N(m), 'square', t + i * 0.07, 0.25, 0.05, this.sfx, { cut: 3000 }); this.osc(N(m + 12), 'sine', t + i * 0.07, 0.4, 0.04, this.sfx); });
    const end = t + seq.length * 0.07;
    [74, 78, 81].forEach(m => this.osc(N(m), 'triangle', end, 0.9 + tier * 0.3, 0.06, this.sfx, { att: 0.02, rel: 0.6 }));
    if (tier >= 1) { this.kick(end, 0.9); this.hiss(end, 1.2 + tier * 0.4, 0.08, 6000, 0.6, 'highpass', this.sfx); }
    if (tier >= 2) [86, 88, 90, 93].forEach((m, i) => this.osc(N(m), 'sine', end + 0.25 + i * 0.09, 0.35, 0.04, this.sfx));
    if (tier >= 3) { [50, 57, 62, 66].forEach(m => this.osc(N(m), 'sawtooth', end + 0.5, 1.6, 0.03, this.sfx, { att: 0.05, cut: 1600 })); this.kick(end + 0.5, 0.9); }
    if (tier >= 4) [74, 78, 81, 86, 90, 93].forEach((m, i) => this.osc(N(m), 'square', end + 1 + i * 0.1, 0.5, 0.04, this.sfx, { cut: 3500 }));
  }
}

// ---------- live wrapper used by the UI ----------
let ctx: AudioContext | null = null, eng: Engine | null = null, timer = 0;
let muted = localStorage.getItem('hnw-muted') === '1', volume = Number(localStorage.getItem('hnw-vol') ?? '0.7');
const LOOKAHEAD = 0.14;
export const isMuted = () => muted;
export const getVolume = () => volume;
function master() { return muted ? 0 : volume; }
/** Must be called from a user gesture the first time. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'playback' }); eng = new Engine(ctx, ctx.destination, true); eng.out.gain.value = master();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (!eng!.playing) startMusic();
}
function startMusic() {
  if (!eng || !ctx) return; eng.playing = true; eng.next = ctx.currentTime + 0.1; eng.step = 0;
  timer = window.setInterval(() => { if (ctx && eng && ctx.state === 'running') eng.scheduleUntil(ctx.currentTime + LOOKAHEAD); }, 30);
}
export function setMuted(m: boolean) { muted = m; localStorage.setItem('hnw-muted', m ? '1' : '0'); if (ctx && eng) eng.out.gain.setTargetAtTime(master(), ctx.currentTime, 0.05); }
export function setVolume(v: number) { volume = v; localStorage.setItem('hnw-vol', String(v)); if (ctx && eng) eng.out.gain.setTargetAtTime(master(), ctx.currentTime, 0.05); }
/** 0 = idle, 1 = in a round, 2 to 4 = higher rows. */
export function setIntensity(i: number) { if (eng) eng.target = Math.max(0, Math.min(4, i)); }
export const sfx = new Proxy({} as Pick<Engine, 'sfxPick' | 'sfxSafe' | 'sfxHop' | 'sfxLand' | 'sfxBet' | 'sfxClick' | 'stingTrap' | 'stingCash'>, {
  get: (_t, k: string) => (...a: unknown[]) => { if (eng && ctx && ctx.state === 'running' && !muted) (eng as unknown as Record<string, (...x: unknown[]) => void>)[k](...a); },
});
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) void ctx.suspend(); else { void ctx.resume(); if (eng) eng.next = Math.max(eng.next, ctx.currentTime + 0.05); } });
export function stopAll() { clearInterval(timer); if (eng) eng.playing = false; }

/** Offline render for checks: plays the groove through every intensity and the stingers, returns the buffer. */
export async function renderOffline(seconds = 48, sampleRate = 44100) {
  const oc = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const e = new Engine(oc, oc.destination, false); e.next = 0.05;
  // Ramp intensity 0..4 across the render; schedule bar by bar so newBar sees the right target.
  const per = (seconds - 10) / 5;
  for (let t = 0; t < seconds - 10; t += 0.5) { e.target = Math.min(4, Math.floor(t / per)); e.scheduleUntil(t + 0.5); }
  // Stingers after the groove: trap at seconds-8, cash out tiers spaced out.
  e.at = seconds - 9; e.stingTrap(); e.at = seconds - 7; e.stingCash(0); e.at = seconds - 5; e.stingCash(2); e.at = seconds - 2.8; e.stingCash(4); e.at = null;
  return oc.startRendering();
}
