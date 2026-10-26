// PixiJS rooftop scene: night sky, two parallax skyline layers, the tower of rows and Hubie.
// Perf notes (from the slot lag fix): the renderer resolution follows devicePixelRatio (capped) with autoDensity,
// so the backing store matches the on screen pixels. Every tween is tracked and killed on reset,
// and rows are destroyed with their children when a new round starts.
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import gsap from 'gsap';
import { isSummit, multAt, tilesOn, type Level } from './engine';
import { ART } from './art';

export type TileState = 'idle' | 'active' | 'safe' | 'safePicked' | 'trap' | 'trapPicked' | 'dim';
const CYAN = 0x02f7fd, GOLD = 0xffc83d, RED = 0xff4d3d, TEAL = 0x0b1920;
const MOBILE = Math.min(screen.width, screen.height) < 600;

export class Scene {
  app = new Application();
  ready: Promise<void>;
  private host: HTMLElement;
  private sky = new Graphics(); private stars = new Graphics(); private far = new Graphics(); private near = new Graphics();
  private world = new Container(); private rowsLayer = new Container();
  private hubie!: Sprite; private tex: Record<string, Texture> = {};
  private rows: { c: Container; tiles: Graphics[]; lights: Graphics; label: Text }[] = [];
  level!: Level; states: TileState[][] = []; cleared = 0; // rows cleared (Hubie stands on row cleared - 1)
  hubieTile = -1; private camY = 0; private tweens: gsap.core.Animation[] = [];
  w = 0; h = 0; rowH = 80; padR = 0; fast = false;
  onLayout: () => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
    this.ready = this.init();
  }
  private async init() {
    const res = Math.min(devicePixelRatio || 1, MOBILE ? 2 : 2);
    await this.app.init({ resizeTo: this.host, backgroundColor: TEAL, antialias: true, resolution: res, autoDensity: true, powerPreference: 'low-power' });
    this.host.appendChild(this.app.canvas);
    for (const k of ['hubie_idle', 'hubie_react', 'hubie_bigwin']) this.tex[k] = await Assets.load(ART(k));
    this.hubie = new Sprite(this.tex.hubie_idle); this.hubie.anchor.set(0.5, 1);
    this.world.addChild(this.rowsLayer, this.hubie);
    this.app.stage.addChild(this.sky, this.stars, this.far, this.near, this.world);
    this.app.renderer.on('resize', () => this.layout());
    this.app.ticker.maxFPS = 60;
    this.app.ticker.add(() => this.idle());
  }
  private track<T extends gsap.core.Animation>(t: T) { this.tweens.push(t); t.eventCallback('onComplete', () => { const i = this.tweens.indexOf(t); if (i >= 0) this.tweens.splice(i, 1); }); return t; }
  private d(s: number) { return this.fast ? s * 0.45 : s; }
  killAll() { for (const t of this.tweens) t.kill(); this.tweens.length = 0; gsap.killTweensOf([this.hubie, this.hubie?.scale, this.world]); }

  // ---------- geometry ----------
  private rowY(r: number) { return -r * this.rowH; } // top surface of row r (row -1 is the street ledge)
  private tileW(n: number) { const avail = this.w - this.padR - 64; return n === 1 ? Math.min(avail, 280) : Math.min(118, (avail - (n - 1) * 10) / n); }
  tileX(r: number, i: number) { const n = tilesOn(this.level, r); const tw = this.tileW(n); const cx = 52 + (this.w - this.padR - 52) / 2; return cx + (i - (n - 1) / 2) * (tw + 10); }
  private camFor(cleared: number) { return this.h * 0.74 - this.rowY(cleared - 1); }
  /** Screen rectangle of a tile (CSS pixels relative to the canvas). */
  tileRect(r: number, i: number) { const n = tilesOn(this.level, r); const tw = this.tileW(n), th = this.rowH * 0.52; const x = this.tileX(r, i) - tw / 2, y = this.world.y + this.rowY(r) - th; return { x, y, w: tw, h: th }; }

  layout() {
    this.w = this.app.screen.width; this.h = this.app.screen.height;
    this.rowH = Math.max(62, Math.min(96, this.h / 5.4));
    this.drawSky(); this.drawSkyline();
    if (this.level) { this.buildRows(); this.placeHubie(); }
    this.world.y = this.camY = this.camFor(this.cleared);
    this.parallax();
    this.onLayout();
  }
  private drawSky() {
    const { w, h } = this; const g = this.sky.clear();
    const bands = 18; for (let i = 0; i < bands; i++) { const t = i / bands; const c = lerpColor(0x05121a, 0x0f2f3a, t); g.rect(0, (h * i) / bands, w, h / bands + 1).fill(c); }
    g.circle(w * 0.78, h * 0.16, Math.min(w, h) * 0.06).fill({ color: 0xe8fbff, alpha: 0.9 });
    g.circle(w * 0.78, h * 0.16, Math.min(w, h) * 0.11).fill({ color: CYAN, alpha: 0.06 });
    const s = this.stars.clear(); let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) s.circle(r() * w, r() * h * 0.7, r() < 0.15 ? 1.6 : 0.9).fill({ color: r() < 0.2 ? GOLD : 0xbff9ff, alpha: 0.4 + r() * 0.5 });
  }
  private drawSkyline() {
    const { w, h } = this; let seed = 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [g, base, col, win, hmin, hmax] of [[this.far, h * 0.95, 0x0d2530, 0.25, 0.25, 0.55], [this.near, h * 1.02, 0x081820, 0.55, 0.18, 0.42]] as const) {
      g.clear(); let x = -10;
      while (x < w + 10) {
        const bw = 26 + r() * 52, bh = h * (hmin + r() * (hmax - hmin)); const top = base - bh;
        g.rect(x, top, bw, bh + h).fill(col);
        if (r() < 0.3) g.rect(x + bw * 0.45, top - 14, 2, 14).fill(col);
        for (let wy = top + 8; wy < base; wy += 11) for (let wx = x + 5; wx < x + bw - 6; wx += 9) if (r() < 0.22) g.rect(wx, wy, 4, 5).fill({ color: r() < 0.7 ? CYAN : GOLD, alpha: win * (0.3 + r() * 0.7) });
        if (r() < 0.25) g.rect(x + 3, top + 4, bw - 6, 3).fill({ color: r() < 0.5 ? CYAN : 0xff3da8, alpha: 0.7 });
        x += bw + 2 + r() * 8;
      }
    }
  }
  private parallax() { const dy = this.world.y - this.camFor(0); this.far.y = dy * 0.12; this.near.y = dy * 0.3; this.stars.y = dy * 0.04; }

  // ---------- rows ----------
  setLevel(lv: Level) {
    this.killAll(); this.level = lv; this.cleared = 0; this.hubieTile = -1;
    this.states = Array.from({ length: lv.rows }, (_, r) => new Array(tilesOn(lv, r)).fill('idle'));
    this.hubie.texture = this.tex.hubie_idle; this.hubie.rotation = 0; this.hubie.alpha = 1;
    this.layout();
  }
  private buildRows() {
    for (const r of this.rows) r.c.destroy({ children: true }); this.rows = [];
    const lv = this.level;
    // street ledge (start)
    const ledge = new Container(); const lg = new Graphics();
    lg.rect(0, this.rowY(-1), this.w, this.rowH * 2).fill(0x07141a).rect(0, this.rowY(-1), this.w, 3).fill({ color: CYAN, alpha: 0.5 });
    ledge.addChild(lg); this.rowsLayer.addChild(ledge);
    this.rows.push({ c: ledge, tiles: [], lights: new Graphics(), label: new Text() });
    for (let r = 0; r < lv.rows; r++) {
      const c = new Container(); const y = this.rowY(r);
      const beam = new Graphics(); beam.rect(36, y + 2, this.w - this.padR - 40, 5).fill(0x14323d).rect(36, y + 7, this.w - this.padR - 40, 2).fill({ color: 0x000000, alpha: 0.4 });
      for (let x = 60; x < this.w - this.padR - 10; x += 70) beam.rect(x, y + 9, 4, this.rowH - 12).fill({ color: 0x0f2832, alpha: 0.9 });
      const lights = new Graphics(); for (let x = 44; x < this.w - this.padR - 8; x += 16) lights.circle(x, y + 4.5, 1.8).fill(isSummit(lv, r) ? GOLD : CYAN); lights.alpha = 0.12;
      const label = new Text({ text: fmtMult(multAt(lv, r + 1)), style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: Math.round(this.rowH * 0.17), fill: isSummit(lv, r) ? GOLD : 0x7fdfe4 } });
      label.anchor.set(0, 1); label.position.set(6, y - 4); label.alpha = 0.75;
      c.addChild(beam, lights, label);
      const tiles: Graphics[] = [];
      for (let i = 0; i < tilesOn(lv, r); i++) { const g = new Graphics(); c.addChild(g); tiles.push(g); }
      this.rowsLayer.addChild(c); this.rows.push({ c, tiles, lights, label });
      if (r < this.cleared) lights.alpha = 1;
      tiles.forEach((_, i) => this.drawTile(r, i));
      if (isSummit(lv, r)) {
        const { x, w, h } = this.tileRectWorld(r, 0);
        const t = new Text({ text: 'SUMMIT 10,000x', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: Math.round(h * 0.34), fill: GOLD, letterSpacing: 1 } });
        t.anchor.set(0.5); t.position.set(x + w / 2, y - h / 2); c.addChild(t);
      }
    }
  }
  private R(r: number) { return this.rows[r + 1]; }
  drawTile(r: number, i: number) {
    const row = this.R(r); if (!row) return; const g = row.tiles[i].clear(); const st = this.states[r][i];
    const { x, w, h } = this.tileRectWorld(r, i); const y = this.rowY(r) - h; const summit = isSummit(this.level, r);
    const fill = st === 'safePicked' ? 0x0f5a63 : st === 'trap' || st === 'trapPicked' ? 0x3a1216 : st === 'safe' ? 0x0e3540 : 0x10262f;
    const edge = st === 'trapPicked' || st === 'trap' ? RED : summit ? GOLD : CYAN;
    const ea = st === 'active' ? 0.95 : st === 'idle' ? 0.28 : st === 'dim' ? 0.12 : st === 'safe' ? 0.45 : 0.9;
    if (st === 'active' || st === 'safePicked' || st === 'trapPicked') g.roundRect(x - 4, y - 4, w + 8, h + 8, 12).fill({ color: edge, alpha: 0.12 });
    g.roundRect(x, y, w, h, 9).fill(fill).stroke({ width: st === 'active' ? 2.5 : 1.5, color: edge, alpha: ea });
    if (summit) {
      g.roundRect(x + 8, y + 7, w - 16, h - 14, 6).stroke({ width: 1, color: GOLD, alpha: 0.4 });
      if (st === 'safePicked') g.roundRect(x + 8, y + 7, w - 16, h - 14, 6).fill({ color: GOLD, alpha: 0.35 });
    } else if (st === 'safePicked' || st === 'safe') {
      // open skylight: glowing glass panes
      const a = st === 'safePicked' ? 0.85 : 0.3;
      g.rect(x + 7, y + 6, w / 2 - 10, h - 12).fill({ color: CYAN, alpha: a * 0.6 }).rect(x + w / 2 + 3, y + 6, w / 2 - 10, h - 12).fill({ color: CYAN, alpha: a * 0.45 });
    } else if (st === 'trap' || st === 'trapPicked') {
      // busted vent: bent grille and a crack
      for (let k = 1; k < 4; k++) g.moveTo(x + 8, y + (h * k) / 4).lineTo(x + w - 8, y + (h * k) / 4 + (k % 2 ? 4 : -4)).stroke({ width: 2, color: RED, alpha: st === 'trapPicked' ? 0.9 : 0.5 });
      g.moveTo(x + w * 0.3, y + 3).lineTo(x + w * 0.45, y + h * 0.5).lineTo(x + w * 0.38, y + h - 3).stroke({ width: 1.5, color: 0xffb199, alpha: 0.8 });
    } else {
      // closed vent grille
      for (let k = 1; k < 4; k++) g.moveTo(x + 9, y + (h * k) / 4).lineTo(x + w - 9, y + (h * k) / 4).stroke({ width: 2, color: st === 'active' ? CYAN : 0x2a5561, alpha: st === 'active' ? 0.55 : 0.8 });
    }
  }
  private tileRectWorld(r: number, i: number) { const n = tilesOn(this.level, r); const w = this.tileW(n), h = this.rowH * 0.52; return { x: this.tileX(r, i) - w / 2, w, h }; }
  setState(r: number, i: number, s: TileState) { if (!this.states[r]) return; this.states[r][i] = s; this.drawTile(r, i); }
  setActiveRow(r: number | null) {
    this.states.forEach((row, rr) => row.forEach((s, i) => { if (s === 'active' && rr !== r) this.setState(rr, i, 'idle'); }));
    if (r !== null && r < this.level.rows) this.states[r].forEach((s, i) => { if (s === 'idle') this.setState(r, i, 'active'); });
  }
  private placeHubie() {
    this.hubie.height = this.rowH * 1.25; this.hubie.scale.x = this.hubie.scale.y;
    const r = this.cleared - 1; this.hubie.x = r < 0 ? 52 + (this.w - this.padR - 52) / 2 : this.tileX(r, Math.max(0, this.hubieTile));
    this.hubie.y = this.rowY(r) - (r < 0 ? 0 : this.rowH * 0.52) + 2;
  }
  private baseScale() { return (this.rowH * 1.25) / this.hubie.texture.height; }
  private idle() {
    const t = performance.now() / 1000;
    if (this.level) { const r = this.R(this.cleared); if (r) for (let i = 0; i < r.tiles.length; i++) if (this.states[this.cleared]?.[i] === 'active') r.tiles[i].alpha = 0.78 + Math.sin(t * 4 + i) * 0.22; }
    this.stars.alpha = 0.85 + Math.sin(t * 1.3) * 0.15;
    if (this.world.y !== this.camY) this.parallax();
  }

  // ---------- animations ----------
  /** Hubie hops onto tile i of row r. Resolves on landing. */
  hop(r: number, i: number): Promise<void> {
    return new Promise(res => {
      const b = this.baseScale(), H = this.hubie; const x0 = H.x, y0 = H.y;
      const x1 = this.tileX(r, i), y1 = this.rowY(r) - this.rowH * 0.52 + 2; const peak = this.rowH * 0.9;
      const p = { t: 0 }; const tl = gsap.timeline({ onComplete: () => res() });
      tl.to(H.scale, { x: b * 1.12, y: b * 0.84, duration: this.d(0.1), ease: 'power2.out' })
        .to(p, { t: 1, duration: this.d(0.42), ease: 'none', onUpdate: () => { const t = p.t; H.x = x0 + (x1 - x0) * t; H.y = y0 + (y1 - y0) * easeInOut(t) - Math.sin(Math.PI * t) * peak; } }, '>')
        .to(H.scale, { x: b * 0.92, y: b * 1.1, duration: this.d(0.18), ease: 'power1.out' }, '<')
        .to(H.scale, { x: b * 1.18, y: b * 0.8, duration: this.d(0.08), ease: 'power2.out' }, '>')
        .to(H.scale, { x: b, y: b, duration: this.d(0.35), ease: 'elastic.out(1, 0.45)' }, '>');
      this.track(tl);
    });
  }
  panTo(cleared: number) { this.camY = this.camFor(cleared); this.track(gsap.to(this.world, { y: this.camY, duration: this.d(0.6), ease: 'power2.inOut', onUpdate: () => this.parallax() })); }
  /** Row lights flicker on after a safe step. */
  lightRow(r: number) {
    const L = this.R(r)?.lights; if (!L) return; const tl = gsap.timeline();
    tl.to(L, { alpha: 1, duration: 0.05 }).to(L, { alpha: 0.2, duration: 0.05 }).to(L, { alpha: 1, duration: 0.05 }).to(L, { alpha: 0.4, duration: 0.06 }).to(L, { alpha: 1, duration: 0.12 });
    this.track(tl);
  }
  /** Trap: Hubie makes a face, then tumbles off the roof. */
  tumble(): Promise<void> {
    return new Promise(res => {
      const H = this.hubie; H.texture = this.tex.hubie_react; const b = this.baseScale(); H.scale.set(b);
      const tl = gsap.timeline({ onComplete: () => res() });
      tl.to(H, { y: H.y - this.rowH * 0.5, duration: this.d(0.25), ease: 'power2.out' })
        .to(H, { rotation: (Math.random() < 0.5 ? -1 : 1) * Math.PI * 1.6, y: H.y + this.rowH * 2.2, alpha: 0, duration: this.d(0.75), ease: 'power2.in' }, '>0.25');
      this.track(tl);
    });
  }
  celebrate() { const H = this.hubie; H.texture = this.tex.hubie_bigwin; const b = this.baseScale(); this.track(gsap.fromTo(H.scale, { x: b * 0.8, y: b * 1.2 }, { x: b, y: b, duration: 0.6, ease: 'elastic.out(1, 0.4)' })); }
  /** Screen position of Hubie's head, for coin sparkles. */
  hubieScreen() { const r = this.app.canvas.getBoundingClientRect(); return { x: r.left + this.hubie.x, y: r.top + this.world.y + this.hubie.y - this.hubie.height * 0.6 }; }
  tileScreen(r: number, i: number) { const c = this.app.canvas.getBoundingClientRect(); const t = this.tileRect(r, i); return { x: c.left + t.x + t.w / 2, y: c.top + t.y + t.h / 2 }; }
  reset(lv: Level) { this.setLevel(lv); }
  get camSettled() { return Math.abs(this.world.y - this.camY) < 0.5; }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function lerpColor(a: number, b: number, t: number) { const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t); return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl); }
export const fmtMult = (m: number) => (m >= 10000 ? '10,000' : m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + 'x';
