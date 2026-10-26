// Procedural music and sound effects for Hubie's Night Walk.
// A rainy night noir jazz groove that reacts to the climb. Everything is synthesised in WebAudio except the rain bed,
// which is a CC0 field recording (see CREDITS.md); if it fails to load a filtered noise rain takes its place.
//
// Arrangement, on a swung triplet grid (12 steps per bar):
//   intro    rhodes chords, rain and vinyl crackle, brush swirls, no kick
//   grooveA  two feel upright bass, brushed snare with ghost notes, ride, rhodes comping (Dm9, G13, Cmaj9, A7b13)
//   grooveB  walking bass, soft pad, vibraphone motif with call and response (Bbmaj7#11, A7alt, Dm9, Gm9 C13)
//   tension  half step up, pedal bass ostinato, busier ride and kick, brighter filter, motif climbs
//   release  four bars of Fmaj9, Em7 A7, Dm9 after a cash out or a fall, then back to the intro
// The vibraphone motif is built from scale rules with a seeded random generator and is developed every phrase
// (transposed to the chord, inverted, displaced, or answered by the rhodes), so the loop never repeats exactly.
// A lookahead scheduler books every step against the AudioContext clock, so timing does not drift.
// Every voice disconnects its nodes when it ends, and a polyphony cap protects slow phones.

type Ctx = BaseAudioContext;
const MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad/.test(navigator.userAgent);
const N = (m: number) => 440 * 2 ** ((m - 69) / 12);
type Section = 'intro' | 'grooveA' | 'grooveB' | 'tension' | 'release';
/** A chord: bass root (midi), rootless voicing for the rhodes, and the scale the motif and the walking bass may use (pitch classes from the root). */
interface Chord { root: number; voice: number[]; scale: number[]; tones: number[] }
const DOR = [0, 2, 3, 5, 7, 9, 10], MIX = [0, 2, 4, 5, 7, 9, 10], LYD = [0, 2, 4, 6, 7, 9, 11], ION = [0, 2, 4, 5, 7, 9, 11], ALT = [0, 1, 3, 4, 6, 8, 10];
const m9 = (r: number): Chord => ({ root: r, voice: [r + 15, r + 19, r + 22, r + 26], scale: DOR, tones: [0, 3, 7, 10] }); // b3 5 b7 9
const d13 = (r: number): Chord => ({ root: r, voice: [r + 10, r + 14, r + 16, r + 21], scale: MIX, tones: [0, 4, 7, 10] }); // b7 9 3 13
const M9 = (r: number): Chord => ({ root: r, voice: [r + 16, r + 19, r + 23, r + 26], scale: ION, tones: [0, 4, 7, 11] }); // 3 5 7 9
const M7s11 = (r: number): Chord => ({ root: r, voice: [r + 16, r + 18, r + 23, r + 26], scale: LYD, tones: [0, 4, 7, 11] });
const alt = (r: number): Chord => ({ root: r, voice: [r + 10, r + 13, r + 16, r + 20], scale: ALT, tones: [0, 4, 10, 8] }); // b7 b9 3 b13
const m7 = (r: number): Chord => ({ root: r, voice: [r + 15, r + 19, r + 22, r + 26], scale: DOR, tones: [0, 3, 7, 10] });
// one chord per bar, roots around D2
const PROG: Record<Section, Chord[]> = {
  intro: [m9(38), d13(43), M9(36), alt(45)],
  grooveA: [m9(38), d13(43), M9(36), alt(45)],
  grooveB: [M7s11(34), alt(45), m9(38), m9(43)],
  tension: [m9(39), m9(39), M7s11(35), alt(46)],
  release: [M9(41), m7(40), d13(45), m9(38)],
};

export class Engine {
  c: Ctx; out: GainNode; music: GainNode; sfx: GainNode; tone: BiquadFilterNode; duck: GainNode; verb: ConvolverNode; verbIn: GainNode;
  voices = 0; cap: number; noise: AudioBuffer;
  // scheduler state
  step = 0; next = 0; bar = -1; bpm = 82; intensity = 0; target = 0; playing = false;
  section: Section = 'intro'; private secBar = 0; private wasHigh = false; private seed = 20261026;
  private motif: number[] = []; private motifRhythm: number[] = []; private phrase = 0; private lastBass = 38;
  /** When set, stingers start at this time instead of now (used by the offline render). */
  at: number | null = null;
  private now() { return this.at ?? this.c.currentTime; }
  constructor(c: Ctx, dest: AudioNode, live: boolean) {
    this.c = c; this.cap = live ? (MOBILE ? 48 : 80) : 10_000;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25; comp.knee.value = 8;
    this.out = c.createGain(); this.out.gain.value = 0.7;
    this.music = c.createGain(); this.music.gain.value = 0.5;
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85;
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 3200; this.tone.Q.value = 0.5;
    this.duck = c.createGain();
    // short dark room made from decaying noise
    this.verb = c.createConvolver(); const len = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 200 ? i / 200 : 1); }
    this.verb.buffer = ir; this.verbIn = c.createGain(); this.verbIn.gain.value = 0.28;
    const vlp = c.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 3500;
    this.duck.connect(this.tone); this.tone.connect(this.music); this.tone.connect(this.verbIn); this.verbIn.connect(vlp).connect(this.verb).connect(this.music);
    this.music.connect(comp); this.sfx.connect(comp); comp.connect(this.out); this.out.connect(dest);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.newMotif();
  }
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  private pick<T>(a: T[]) { return a[Math.floor(this.rnd() * a.length)]; }
  private room() { return this.voices < this.cap; }
  private end(nodes: AudioNode[], src: AudioScheduledSourceNode) { this.voices++; src.onended = () => { this.voices--; for (const n of nodes) n.disconnect(); }; }
  private env(g: GainNode, t: number, vol: number, att: number, dur: number, rel: number) {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0, t + Math.max(att, dur - rel), rel / 4);
  }
  osc(f: number, type: OscillatorType, t: number, dur: number, vol: number, dest: AudioNode, o: { glide?: number; att?: number; cut?: number; q?: number; det?: number; rel?: number; pan?: number } = {}) {
    if (!this.room()) return; const c = this.c;
    const os = c.createOscillator(), g = c.createGain(); os.type = type; os.frequency.setValueAtTime(f, t); if (o.det) os.detune.value = o.det;
    if (o.glide) os.frequency.exponentialRampToValueAtTime(o.glide, t + Math.min(dur, 0.15));
    const rel = o.rel ?? dur * 0.6; this.env(g, t, vol, o.att ?? 0.004, dur, rel);
    let last: AudioNode = os; const nodes: AudioNode[] = [os, g];
    if (o.cut) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.cut * 3, t); fl.frequency.exponentialRampToValueAtTime(o.cut, t + Math.min(dur, 0.2)); fl.Q.value = o.q ?? 2; last.connect(fl); last = fl; nodes.push(fl); }
    last.connect(g); let tail: AudioNode = g;
    if (o.pan && 'createStereoPanner' in c) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); tail = p; nodes.push(p); }
    tail.connect(dest); this.end(nodes, os);
    os.start(t); os.stop(t + dur + rel * 1.5 + 0.05);
  }
  hiss(t: number, dur: number, vol: number, f: number, q: number, type: BiquadFilterType, dest: AudioNode, sweep?: number, pan = 0) {
    if (!this.room()) return; const c = this.c;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur); fl.Q.value = q;
    const att = sweep ? dur * 0.7 : 0.002; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.setTargetAtTime(0, t + att, Math.max(0.005, (dur - att) / 4));
    const nodes: AudioNode[] = [s, fl, g]; let tail: AudioNode = g;
    if (pan && 'createStereoPanner' in c) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; nodes.push(p); }
    s.connect(fl).connect(g); tail.connect(dest); this.end(nodes, s);
    s.start(t, Math.random() * 1.5); s.stop(t + dur * 1.6 + 0.05);
  }
  /** Electric piano: a two operator FM voice (tine bark that fades into a round tone) with a slow stereo tremolo. */
  rhodes(m: number, t: number, dur: number, vol: number, pan = 0, bright = 1) {
    if (!this.room()) return; const c = this.c, f = N(m);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter();
    car.frequency.value = f; mod.frequency.value = f; car.detune.value = (this.rnd() - 0.5) * 8;
    mg.gain.setValueAtTime(f * 2.2 * bright, t); mg.gain.setTargetAtTime(f * 0.25, t, 0.12);
    lp.type = 'lowpass'; lp.frequency.value = 2400 + bright * 1400;
    mod.connect(mg).connect(car.frequency); car.connect(lp).connect(g);
    this.env(g, t, vol, 0.006, dur, Math.min(0.5, dur * 0.5));
    const nodes: AudioNode[] = [car, mod, mg, lp, g]; let tail: AudioNode = g;
    if ('createStereoPanner' in c) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; nodes.push(p); }
    tail.connect(this.duck); this.end(nodes, car);
    const stop = t + dur + 0.6; car.start(t); mod.start(t); car.stop(stop); mod.stop(stop);
  }
  /** Vibraphone: sine with a quiet fourth partial, motor tremolo through a gain LFO. */
  vibe(m: number, t: number, dur: number, vol: number, pan = 0.25) {
    if (!this.room()) return; const c = this.c, f = N(m);
    const a = c.createOscillator(), b = c.createOscillator(), bg = c.createGain(), g = c.createGain(), trem = c.createOscillator(), tg = c.createGain(), amp = c.createGain();
    a.frequency.value = f; b.frequency.value = f * 4; bg.gain.setValueAtTime(0.18, t); bg.gain.setTargetAtTime(0, t, 0.05);
    trem.frequency.value = 5.2; tg.gain.value = 0.25; amp.gain.value = 0.75; trem.connect(tg).connect(amp.gain);
    a.connect(amp); b.connect(bg).connect(amp); amp.connect(g); this.env(g, t, vol, 0.003, dur, dur * 0.8);
    const nodes: AudioNode[] = [a, b, bg, g, trem, tg, amp]; let tail: AudioNode = g;
    if ('createStereoPanner' in c) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; nodes.push(p); }
    tail.connect(this.duck); this.end(nodes, a);
    const stop = t + dur * 1.5 + 0.1; for (const o of [a, b, trem]) { o.start(t); o.stop(stop); }
  }
  /** Upright bass: triangle plus sine an octave down, plucked envelope, a little thump. */
  upright(m: number, t: number, dur: number, vol: number) {
    const f = N(m); this.osc(f, 'triangle', t, dur, vol, this.duck, { att: 0.008, cut: 520, q: 1.2, rel: dur * 0.5 });
    this.osc(f, 'sine', t, dur * 1.1, vol * 0.5, this.duck, { att: 0.01, rel: dur * 0.6 });
    this.hiss(t, 0.03, vol * 0.25, 900, 1.5, 'bandpass', this.duck);
  }

  // ---------- drum kit (brushes and a soft kit) ----------
  kick(t: number, v = 0.6) { this.osc(110, 'sine', t, 0.28, v, this.music, { glide: 45, att: 0.003, rel: 0.2 }); this.pump(t, v); }
  /** Sidechain feel: everything on the duck bus dips under the kick. */
  pump(t: number, v = 0.6) { const g = this.duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value || 1, t); g.linearRampToValueAtTime(1 - 0.35 * v, t + 0.01); g.setTargetAtTime(1, t + 0.03, 0.08); }
  brush(t: number, v = 0.2) { this.hiss(t, 0.16, v, 2600, 0.7, 'bandpass', this.duck, undefined, -0.1); this.osc(190, 'triangle', t, 0.07, v * 0.35, this.duck, { glide: 160 }); }
  ghost(t: number, v = 0.05) { this.hiss(t, 0.06, v, 3200, 0.9, 'bandpass', this.duck, undefined, -0.15); }
  swirl(t: number, dur: number, v = 0.05) { this.hiss(t, dur, v, 1800, 0.6, 'bandpass', this.duck, 3600, -0.2); }
  ride(t: number, v = 0.05) { this.hiss(t, 0.28, v, 7800, 1.2, 'highpass', this.duck, undefined, 0.3); this.osc(N(100), 'square', t, 0.08, v * 0.08, this.duck, { cut: 9000, pan: 0.3 }); }
  hatFoot(t: number, v = 0.04) { this.hiss(t, 0.03, v, 8500, 1, 'highpass', this.duck, undefined, 0.15); }

  // ---------- motif ----------
  /** A new four to six note cell from the scale of the chord, mostly stepwise with one leap, in a seeded rhythm. */
  private newMotif() {
    const n = 4 + Math.floor(this.rnd() * 3); const deg: number[] = [Math.floor(this.rnd() * 3) + 2];
    for (let k = 1; k < n; k++) { const leap = this.rnd() < 0.2 ? this.pick([3, -3, 4]) : this.pick([1, -1, 1, -1, 2, -2]); deg.push(Math.max(0, Math.min(9, deg[k - 1] + leap))); }
    this.motif = deg;
    // positions on the 24 step two bar phrase, starting off the beat like a pickup
    const pos: number[] = [];
    let p = this.pick([0, 2, 3]); for (let k = 0; k < n; k++) { pos.push(p); p = Math.min(22, p + this.pick([1, 2, 2, 3, 3])); }
    this.motifRhythm = pos;
  }
  /** Develop the motif each phrase: transpose, invert, displace, or leave space for a rhodes answer. */
  private developed(): { deg: number[]; pos: number[]; answer: boolean } {
    const ph = this.phrase % 4; let deg = [...this.motif], pos = [...this.motifRhythm];
    if (ph === 1) deg = deg.map(d => d + 2);
    if (ph === 2) { const a = deg[0]; deg = deg.map(d => Math.max(0, 2 * a - d)); }
    if (ph === 3) { pos = pos.map(p => Math.min(22, p + 3)); deg[deg.length - 1] += this.pick([-1, 1, 2]); }
    if (this.rnd() < 0.3) { const i = Math.floor(this.rnd() * deg.length); deg[i] += this.pick([-1, 1]); }
    return { deg, pos, answer: ph === 1 || ph === 3 };
  }
  private degToMidi(ch: Chord, d: number, base: number) {
    const sc = ch.scale; const o = Math.floor(d / sc.length); return base + (ch.root % 12) + sc[((d % sc.length) + sc.length) % sc.length] + 12 * o;
  }
  private cur: { deg: number[]; pos: number[]; answer: boolean } = { deg: [], pos: [], answer: false };

  /** Book every step up to time `until`. 12 steps per bar, a swung triplet grid. */
  scheduleUntil(until: number) {
    while (this.next < until) {
      if (this.step === 0) this.newBar(this.next);
      this.tick(this.next, this.step); const spb = 60 / this.bpm; this.next += spb / 3; this.step = (this.step + 1) % 12;
    }
  }
  private newBar(t: number) {
    this.bar++; this.secBar++;
    // intensity eases toward the target one level per bar, so layers join on the bar line
    if (this.intensity < this.target) this.intensity++; else if (this.intensity > this.target) this.intensity--;
    const I = this.intensity;
    let want: Section = I === 0 ? 'intro' : I === 1 ? 'grooveA' : I === 2 ? (Math.floor(this.bar / 8) % 2 ? 'grooveB' : 'grooveA') : I === 3 ? 'grooveB' : 'tension';
    if (I >= 2) this.wasHigh = true;
    if (this.target === 0 && this.wasHigh && this.section !== 'release' && this.section !== 'intro') { want = 'release'; this.wasHigh = false; }
    if (this.section === 'release' && this.secBar < 4) want = 'release';
    // sections change on four bar boundaries unless the climb asks for more energy
    const boundary = this.secBar >= 4 && this.bar % 4 === 0;
    if (want !== this.section && (boundary || want === 'release' || (want === 'tension') || this.section === 'intro')) {
      if (this.section !== 'intro' && want !== 'release') this.swirl(t - (60 / this.bpm) * 2, (60 / this.bpm) * 2, 0.05);
      this.section = want; this.secBar = 0;
    }
    this.bpm = 82 + I * 3;
    this.tone.frequency.setTargetAtTime(2600 + I * 1100, t, 0.6);
    if (this.bar % 2 === 0) { if (this.phrase % 4 === 0 && this.bar > 0) this.newMotif(); this.cur = this.developed(); this.phrase++; }
  }
  private chordAt(bar: number) { const p = PROG[this.section]; return p[((bar % p.length) + p.length) % p.length]; }
  private tick(t: number, s: number) {
    const I = this.intensity, sec = this.section, ch = this.chordAt(this.secBar), nx = this.chordAt(this.secBar + 1);
    const spb = 60 / this.bpm, st = spb / 3; const hum = () => (this.rnd() - 0.5) * 0.008;
    const beat = s % 3 === 0, b = Math.floor(s / 3); // b = beat in bar 0..3
    const lastBar = this.bar % 8 === 7;
    this.drip(t);
    // ---- rhodes comping: Charleston and anticipations, rootless voicings
    const compHits: Record<Section, number[]> = { intro: [0], grooveA: [0, 5], grooveB: [2, 8], tension: [0, 5, 8], release: [0] };
    let hits = compHits[sec]; if (this.bar % 4 === 3 && sec !== 'intro') hits = [0, 5, 11];
    if (hits.includes(s)) {
      const voicing = s === 11 ? nx.voice : ch.voice; const len = sec === 'intro' || sec === 'release' ? spb * 3.6 : s === 0 ? spb * 1.4 : spb * 0.9;
      voicing.forEach((m, k) => this.rhodes(m, t + hum() + k * 0.006, len, (sec === 'intro' ? 0.075 : 0.065) * (k === 3 ? 1.15 : 1), (k - 1.5) * 0.18, 0.6 + I * 0.15));
    }
    // ---- bass
    if (sec !== 'intro') {
      const walk = sec === 'grooveB';
      if (sec === 'tension') {
        if ([0, 5, 6, 9, 11].includes(s)) this.upright(ch.root - 12 + (s === 11 ? 7 : s === 9 ? 12 : 0), t + hum(), st * (s === 0 ? 2.5 : 1.3), 0.16);
      } else if (walk || (sec === 'grooveA' && I >= 2)) {
        if (beat) this.upright(this.walkNote(ch, nx, b), t + hum(), spb * 0.9, 0.15);
        else if (s === 11 && this.rnd() < 0.25) this.upright(this.lastBass, t, st * 0.8, 0.12); // skip note
      } else if (s === 0 || s === 6) this.upright(s === 0 ? ch.root - 12 + 12 : ch.root - 12 + 19, t + hum(), spb * 1.8, 0.16);
    }
    // ---- drums
    if (sec !== 'intro') {
      // ride: ding, ding da, ding, ding da (swung)
      if (beat || s === 5 || s === 11) this.ride(t + hum(), (beat ? 0.045 : 0.03) * (sec === 'tension' ? 1.3 : 1));
      if (s === 3 || s === 9) { this.brush(t + hum(), sec === 'release' ? 0.12 : 0.18); this.hatFoot(t + 0.002); }
      if (I >= 1 && [2, 7, 10].includes(s) && this.rnd() < 0.55) this.ghost(t + hum(), 0.025 + this.rnd() * 0.03);
      const kicks = sec === 'tension' ? [0, 5, 6, 11] : sec === 'grooveB' ? [0, 8] : sec === 'release' ? [0] : [0, 7];
      if (kicks.includes(s)) this.kick(t, s === 0 ? 0.42 : 0.3);
      if (lastBar && s >= 6 && sec !== 'release' && (s % 2 === 0 || sec === 'tension')) this.brush(t, 0.06 + (s - 6) * 0.02);
    } else if (s === 0 && this.bar % 2 === 0) this.swirl(t, spb * 3.5, 0.035);
    // ---- pad
    if (s === 0 && (I >= 2 || sec === 'release')) ch.voice.slice(0, 3).forEach((m, k) => this.osc(N(m), 'sawtooth', t, spb * 3.8, 0.012, this.duck, { att: spb * 1.2, rel: spb * 1.5, cut: 900 + I * 200, q: 0.6, det: (k - 1) * 7, pan: (k - 1) * 0.5 }));
    // ---- vibraphone motif and rhodes answer
    if ((I >= 2 || sec === 'release') && sec !== 'intro') {
      const pos = (this.bar % 2) * 12 + s; const lift = sec === 'tension' ? 12 : 0;
      const k = this.cur.pos.indexOf(pos);
      if (k >= 0 && !(this.cur.answer && this.bar % 2 === 1)) this.vibe(this.degToMidi(ch, this.cur.deg[k], 60 + lift), t + hum(), st * 2.2, 0.09);
      if (this.cur.answer && this.bar % 2 === 1 && [2, 5].includes(s)) this.rhodes(this.degToMidi(ch, this.cur.deg[this.cur.deg.length - 1 - (s === 2 ? 0 : 1)] - 2, 60 + lift), t, st * 2, 0.05, -0.3, 1.2);
    }
    // ---- top of the climb: a high rhodes octave ping on every beat for urgency
    if (sec === 'tension' && I >= 4 && beat && b % 2 === 1) this.rhodes(ch.voice[3] + 12, t, st * 1.5, 0.022, 0.4, 1.3);
  }
  /** Walking line: root on beat 1, chord or scale tones on 2 and 3, a chromatic or fifth approach to the next root on 4. */
  private walkNote(ch: Chord, nx: Chord, b: number) {
    const lo = 33, hi = 52; const fit = (m: number) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
    let m: number;
    if (b === 0) m = fit(ch.root);
    else if (b === 3) { const target = fit(nx.root); m = this.pick([target - 1, target + 1, target + 7 - 12, target - 1]); }
    else { const pool = this.rnd() < 0.7 ? ch.tones : ch.scale; const cand = pool.map(p => fit(ch.root + p)); cand.sort((a, c) => Math.abs(a - this.lastBass) - Math.abs(c - this.lastBass)); m = cand[this.rnd() < 0.7 ? 0 : 1] ?? cand[0]; if (m === this.lastBass) m = cand[1] ?? m; }
    this.lastBass = m; return m;
  }

  // ---------- beds ----------
  rainOn = false; rainBuf: AudioBuffer | null = null;
  startRain() {
    if (this.rainOn) return; this.rainOn = true; const c = this.c;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.music);
    if (this.rainBuf) { const s = c.createBufferSource(); s.buffer = this.rainBuf; s.loop = true; s.connect(g); s.start(); g.gain.setTargetAtTime(0.5, c.currentTime, 0.8); }
    else {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      s.connect(hp).connect(lp).connect(g); s.start(); g.gain.setTargetAtTime(0.09, c.currentTime, 0.8);
    }
    // vinyl crackle: sparse random clicks over a faint low hiss, a four second loop
    const len = c.sampleRate * 4, vb = c.createBuffer(1, len, c.sampleRate), d = vb.getChannelData(0); let lpv = 0;
    for (let i = 0; i < len; i++) { lpv = lpv * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = lpv * 0.5; if (Math.random() < 0.0009) { const a = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1); for (let k = 0; k < 24 && i + k < len; k++) d[i + k] += a * Math.exp(-k / 4); } }
    const vs = c.createBufferSource(); vs.buffer = vb; vs.loop = true; const vhp = c.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 700;
    const vg = c.createGain(); vg.gain.value = 0; vs.connect(vhp).connect(vg).connect(this.music); vs.start(); vg.gain.setTargetAtTime(0.06, c.currentTime, 1);
  }
  /** Random drips on a gutter, called from the scheduler. */
  private drip(t: number) { if (this.rnd() < 0.03) this.osc(1400 + this.rnd() * 1600, 'sine', t, 0.05, 0.02, this.music, { glide: 700, pan: this.rnd() - 0.5 }); }

// ---------- sound effects and stingers ----------
  /** Heavy iron hatch pressed: a dull clunk with a metal click. */
  sfxPress() { const t = this.now(); this.osc(150, 'square', t, 0.09, 0.12, this.sfx, { glide: 90, cut: 500, q: 3 }); this.hiss(t, 0.03, 0.12, 2600, 2, 'bandpass', this.sfx); }
  /** Hatch flips into a gold chip: a bright double ping that climbs with the row. */
  sfxChip(row: number) { const t = this.now() + 0.08; const b = 79 + (row % 8); this.hiss(t, 0.05, 0.08, 5000, 1, 'highpass', this.sfx); this.osc(N(b), 'sine', t, 0.25, 0.1, this.sfx); this.osc(N(b + 7), 'sine', t + 0.06, 0.35, 0.08, this.sfx); this.osc(N(b + 19), 'triangle', t + 0.06, 0.2, 0.025, this.sfx); }
  sfxPick() { const t = this.now(); this.osc(880, 'triangle', t, 0.05, 0.12, this.sfx); }
  sfxSafe(row: number) { const t = this.now(); const base = 62 + (row % 12); [0, 4, 7].forEach((d, i) => this.osc(N(base + d + 12), 'triangle', t + i * 0.045, 0.22, 0.12, this.sfx)); this.osc(N(base + 24), 'sine', t + 0.14, 0.4, 0.05, this.sfx); }
  sfxHop() { const t = this.now(); this.osc(300, 'sine', t, 0.18, 0.12, this.sfx, { glide: 720 }); }
  sfxLand() { const t = this.now(); this.osc(110, 'sine', t, 0.12, 0.3, this.sfx, { glide: 60 }); this.hiss(t, 0.06, 0.08, 1200, 1, 'bandpass', this.sfx); }
  sfxBet() { const t = this.now(); this.osc(523, 'square', t, 0.06, 0.05, this.sfx, { cut: 2000 }); this.osc(784, 'square', t + 0.05, 0.08, 0.05, this.sfx, { cut: 2000 }); }
  sfxClick() { this.osc(1200, 'sine', this.now(), 0.03, 0.05, this.sfx); }
  /** Trap: the vent pops, a falling detuned slide, then a low thud. */
  stingTrap() { const t = this.now();
    this.hiss(t, 0.08, 0.4, 3000, 0.8, 'highpass', this.sfx); this.osc(90, 'square', t, 0.15, 0.2, this.sfx, { glide: 40, cut: 400 });
    this.hiss(t + 0.05, 0.6, 0.25, 700, 0.6, 'bandpass', this.sfx, 160);
    this.osc(N(62), 'sawtooth', t + 0.05, 0.7, 0.1, this.sfx, { glide: N(38), cut: 1200 });
    this.osc(N(61), 'sawtooth', t + 0.05, 0.7, 0.08, this.sfx, { glide: N(37), cut: 1200, det: 18 });
    [57, 56, 53, 50].forEach((m, i) => this.rhodesTo(m, t + 0.35 + i * 0.13, 0.4, 0.08, this.sfx));
    this.osc(70, 'sine', t + 0.9, 0.4, 0.4, this.sfx, { glide: 40 });
  }
  /** Cash out stingers, one per win tier: 0 a vibraphone figure, 1 adds a rhodes Dmaj9 with a brush, 2 a walking bass pickup and ride bell,
   *  3 a full band hit on D6/9 with a cymbal swell, 4 a modulating fanfare that climbs a half step twice and lands on a big Ebmaj9#11. */
  stingCash(tier = 0) { const t = this.now();
    for (let k = 0; k < 4 + tier * 2; k++) this.hiss(t + k * 0.04, 0.025, 0.08, 4200 + (k % 3) * 900, 4, 'bandpass', this.sfx);
    const fig = [69, 74, 76, 78, 81, 83, 86].slice(0, 3 + Math.min(4, tier + 1));
    fig.forEach((m, i) => this.vibeTo(m, t + i * 0.09, 0.6, 0.09, this.sfx));
    const end = t + fig.length * 0.09;
    if (tier >= 1) { [54, 57, 61, 64].forEach((m, k) => this.rhodesTo(m + 12, end + k * 0.01, 1.4 + tier * 0.3, 0.06, this.sfx)); this.hiss(end, 0.4, 0.12, 2600, 0.7, 'bandpass', this.sfx); }
    if (tier >= 2) { [38, 40, 42, 45].forEach((m, i) => this.osc(N(m), 'triangle', t + i * 0.12, 0.2, 0.22, this.sfx, { cut: 600 })); for (let k = 0; k < 3; k++) this.hiss(end + 0.2 + k * 0.18, 0.3, 0.05, 8000, 1, 'highpass', this.sfx); }
    if (tier >= 3) { this.osc(N(38), 'sine', end, 1.2, 0.3, this.sfx); this.hiss(end - 0.6, 0.9, 0.12, 5000, 0.5, 'highpass', this.sfx, 11000); [62, 66, 69, 71, 76].forEach(m => this.rhodesTo(m, end + 0.02, 2.2, 0.05, this.sfx)); }
    if (tier >= 4) { const e2 = end + 0.6; [0, 1, 2].forEach(k => [74, 78, 81].forEach((m, i) => this.vibeTo(m + k, e2 + k * 0.36 + i * 0.05, 0.5, 0.07, this.sfx)));
      const e3 = e2 + 1.1; [39, 55, 62, 65, 69, 70].forEach(m => this.rhodesTo(m + 12, e3, 3, 0.05, this.sfx)); this.osc(N(39), 'sine', e3, 2.5, 0.3, this.sfx); this.hiss(e3, 2.5, 0.08, 7000, 0.6, 'highpass', this.sfx); }
  }
  private vibeTo(m: number, t: number, dur: number, vol: number, dest: AudioNode) { const d = this.duck; (this as unknown as { duck: AudioNode }).duck = dest; this.vibe(m, t, dur, vol, 0.2); (this as unknown as { duck: GainNode }).duck = d; }
  private rhodesTo(m: number, t: number, dur: number, vol: number, dest: AudioNode) { const d = this.duck; (this as unknown as { duck: AudioNode }).duck = dest; this.rhodes(m, t, dur, vol, (this.rnd() - 0.5) * 0.6, 1.2); (this as unknown as { duck: GainNode }).duck = d; }
}

// ---------- live wrapper used by the UI ----------
let ctx: AudioContext | null = null, eng: Engine | null = null, timer = 0;
let muted = localStorage.getItem('hnw-muted') === '1', volume = Number(localStorage.getItem('hnw-vol') ?? '0.7');
const LOOKAHEAD = 0.2;
const rainUrl = import.meta.env.BASE_URL + 'audio/rain-loop.mp3';
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
  if (!eng!.playing && !loading) { loading = true; const e = eng!; void loadRain(ctx).then(b => { e.rainBuf = b; loading = false; startMusic(); }); }
}
let loading = false;
async function loadRain(c: BaseAudioContext): Promise<AudioBuffer | null> {
  try { const r = await fetch(rainUrl); if (!r.ok) return null; return await c.decodeAudioData(await r.arrayBuffer()); } catch { return null; }
}
// start on the first real user gesture anywhere on the page (autoplay policy)
if (typeof window !== 'undefined') {
  const first = () => { unlock(); for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, first, true); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, first, true);
}
function startMusic() {
  if (!eng || !ctx) return; eng.playing = true; eng.startRain(); eng.next = ctx.currentTime + 0.15; eng.step = 0;
  timer = window.setInterval(() => { if (ctx && eng && ctx.state === 'running') eng.scheduleUntil(ctx.currentTime + LOOKAHEAD); }, 30);
}
export function setMuted(m: boolean) { muted = m; localStorage.setItem('hnw-muted', m ? '1' : '0'); if (ctx && eng) eng.out.gain.setTargetAtTime(master(), ctx.currentTime, 0.05); }
export function setVolume(v: number) { volume = v; localStorage.setItem('hnw-vol', String(v)); if (ctx && eng) eng.out.gain.setTargetAtTime(master(), ctx.currentTime, 0.05); }
/** 0 = idle, 1 = in a round, 2 to 4 = higher rows. */
export function setIntensity(i: number) { if (eng) eng.target = Math.max(0, Math.min(4, i)); }
export const sfx = new Proxy({} as Pick<Engine, 'sfxPick' | 'sfxSafe' | 'sfxPress' | 'sfxChip' | 'sfxHop' | 'sfxLand' | 'sfxBet' | 'sfxClick' | 'stingTrap' | 'stingCash'>, {
  get: (_t, k: string) => (...a: unknown[]) => { if (eng && ctx && ctx.state === 'running' && !muted) (eng as unknown as Record<string, (...x: unknown[]) => void>)[k](...a); },
});
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) void ctx.suspend(); else { void ctx.resume(); if (eng) eng.next = Math.max(eng.next, ctx.currentTime + 0.05); } });
export function stopAll() { clearInterval(timer); if (eng) eng.playing = false; }

/** Offline render for checks: plays the groove through every intensity and the stingers, returns the buffer. */
export async function renderOffline(seconds = 48, sampleRate = 44100) {
  const oc = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const e = new Engine(oc, oc.destination, false); e.next = 0.05; e.rainBuf = await loadRain(oc); e.startRain();
  // Ramp intensity 0..4 across the render; schedule bar by bar so newBar sees the right target.
  const per = (seconds - 14) / 5;
  for (let t = 0; t < seconds - 10; t += 0.5) { e.target = t < seconds - 14 ? Math.min(4, Math.floor(t / per)) : 0; e.scheduleUntil(t + 0.5); }
  // Stingers after the groove: trap at seconds-8, cash out tiers spaced out.
  e.at = seconds - 9; e.stingTrap(); e.at = seconds - 7; e.stingCash(0); e.at = seconds - 5; e.stingCash(2); e.at = seconds - 2.8; e.stingCash(4); e.at = null;
  return oc.startRendering();
}
