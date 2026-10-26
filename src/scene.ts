// PixiJS rooftop scene, all procedural vector art: a rainy rooftop corner at night seen from the side.
// Layers from back to front: sky and haze, a blurred far skyline, a crisper near skyline, water tower and
// the Housebets billboard, clotheslines, the climbing roof tiers with iron hatches, Hubie, rain, foreground vents.
// Perf: renderer resolution follows devicePixelRatio (capped) with autoDensity, every tween is tracked and killed
// on reset, rows are destroyed with their children when a new round starts, rain is one Graphics per frame.
import { Application, BlurFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import gsap from 'gsap';
import { isSummit, multAt, tilesOn, type Level } from './engine';
import { Hubie, loadHubieArt } from './hubie';
import { fullSvg, svgUrl } from './hubieArt';

export type TileState = 'idle' | 'active' | 'safe' | 'safePicked' | 'trap' | 'trapPicked' | 'dim';
const CYAN = 0x02f7fd, GOLD = 0xf3b63f, BG = 0x0d1217;
const MOBILE = Math.min(screen.width, screen.height) < 600;
const FONT = '"Arial Black", "Helvetica Neue", system-ui, sans-serif';
const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return Texture.from(c);
}
function vignetteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(128, 110, 40, 128, 128, 190); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.75)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return Texture.from(c);
}

interface Tile { lab: Container; c: Container; g: Graphics; chip: Graphics; chipTxt: Text; txt: Text; txtShade: Text; prints: Graphics; w: number; h: number; mult: string }
interface Row { c: Container; tiles: Tile[] }
interface Drop { x: number; y: number; l: number; v: number }
interface Puff { g: Graphics; vx: number; vy: number; life: number; max: number }

export class Scene {
  app = new Application();
  ready: Promise<void>;
  private host: HTMLElement;
  private sky = new Graphics(); private far = new Container(); private farG = new Graphics(); private farWin = new Graphics();
  private near = new Graphics(); private mid = new Container(); private lines = new Graphics(); private clothLayer = new Container(); private cloths: Graphics[] = [];
  private billboard = new Container(); private neon!: Text; private neonGlow!: Sprite; private puddle = new Graphics();
  private world = new Container(); private rowsLayer = new Container(); private labels = new Container(); private wall = new Graphics();
  private rain = new Graphics(); private fg = new Graphics(); private steam = new Container(); private vignette!: Sprite;
  private beam = new Graphics(); private moon!: Sprite; private fireworks = new Container();
  private glow!: Texture; private drops: Drop[] = []; private puffs: Puff[] = []; private ripples: { x: number; y: number; t: number }[] = [];
  hubie!: Hubie; private hubieShadow = new Graphics(); private tag = new Container(); private tagBg = new Graphics(); private tagTxt!: Text;
  private rows: Row[] = [];
  level!: Level; states: TileState[][] = []; cleared = 0; hubieTile = -1;
  private camY = 0; private tweens: gsap.core.Animation[] = [];
  w = 0; h = 0; rowH = 80; pw = 320; cx = 160; fast = false; private cityBoost = 0;
  onLayout: () => void = () => {};
  onFrame: (hx: number, hy: number) => void = () => {};

  constructor(host: HTMLElement) { this.host = host; this.ready = this.init(); }
  private async init() {
    const res = Math.min(devicePixelRatio || 1, 2);
    await this.app.init({ resizeTo: this.host, backgroundColor: BG, antialias: true, resolution: res, autoDensity: true, powerPreference: 'low-power' });
    this.host.appendChild(this.app.canvas);
    this.glow = glowTexture(); this.vignette = new Sprite(vignetteTexture());
    this.far.addChild(this.farG, this.farWin); this.far.filters = [new BlurFilter({ strength: MOBILE ? 2 : 3, quality: 2 })];
    this.neonGlow = new Sprite(this.glow); this.neonGlow.anchor.set(0.5); this.neonGlow.tint = CYAN;
    this.neon = new Text({ text: 'HOUSEBETS', style: { fontFamily: FONT, fontWeight: '900', fontSize: 20, fill: 0xb8feff, letterSpacing: 2, dropShadow: { color: CYAN, blur: 8, distance: 0, alpha: 0.9, angle: 0 } } });
    this.neon.anchor.set(0.5);
    await loadHubieArt(); this.hubie = new Hubie();
    this.tagTxt = new Text({ text: '', style: { fontFamily: FONT, fontWeight: '900', fontSize: 12, fill: 0xeafcff } }); this.tagTxt.anchor.set(0.5);
    this.tag.addChild(this.tagBg, this.tagTxt); this.tag.visible = false;
    // tile multipliers sit on their own layer above Hubie so his hat never hides the number you need to read
    this.world.addChild(this.wall, this.rowsLayer, this.hubieShadow, this.hubie, this.labels, this.tag);
    this.moon = new Sprite(this.glow); this.moon.anchor.set(0.5); this.moon.tint = 0xbfcad3; this.moon.alpha = 0.22;
    this.app.stage.addChild(this.sky, this.moon, this.fireworks, this.far, this.near, this.mid, this.lines, this.clothLayer, this.beam, this.world, this.steam, this.fg, this.rain, this.vignette);
    this.app.renderer.on('resize', () => this.layout());
    this.app.ticker.maxFPS = 60;
    this.app.ticker.add(t => this.frame(t.deltaTime));
  }
  private track<T extends gsap.core.Animation>(t: T) {
    this.tweens.push(t); const prev = t.eventCallback('onComplete') as (() => void) | null;
    t.eventCallback('onComplete', () => { const i = this.tweens.indexOf(t); if (i >= 0) this.tweens.splice(i, 1); prev?.(); });
    return t;
  }
  private d(s: number) { return this.fast ? s * 0.45 : s; }
  killAll() { for (const t of this.tweens) t.kill(); this.tweens.length = 0; if (this.hubie) { const H = this.hubie; gsap.killTweensOf([H, H.scale, H.hat, H.armR, H.armL, H.head, H.rig, H.rig.scale, this.world]); } }

  // ---------- geometry ----------
  private rowY(r: number) { return -r * this.rowH; } // baseline (front edge) of roof tier r; tier -1 is the rooftop floor
  private tileW(n: number) { return n === 1 ? Math.min(this.pw * 0.8, 320) : Math.min(this.w > 900 ? 128 : n === 3 ? 100 : 112, (this.pw - (n - 1) * 9) / n); }
  private tileH(n: number) { return Math.min(this.rowH * 0.56, this.tileW(n === 1 ? 3 : n) * 0.66); }
  tileX(r: number, i: number) { const n = tilesOn(this.level, r); const tw = this.tileW(n); return this.cx + (i - (n - 1) / 2) * (tw + 9); }
  private tileCY(r: number) { return this.rowY(r) - this.tileH(tilesOn(this.level, r)) / 2 - 6; }
  private feetY(r: number) { return r < 0 ? this.rowY(-1) - this.rowH * 0.1 : this.tileCY(r) + this.tileH(tilesOn(this.level, r)) * 0.12; }
  private camFor(cleared: number) { return this.h * (cleared === 0 ? (this.w < 600 ? 0.85 : 0.8) : (this.w < 600 ? 0.76 : 0.72)) - this.feetY(cleared - 1); }
  private idleX() { return this.cx - Math.min(this.pw * 0.32, 110); }
  /** Screen rectangle of a tile (CSS pixels relative to the canvas). */
  tileRect(r: number, i: number) { const n = tilesOn(this.level, r); const tw = this.tileW(n), th = this.tileH(n); return { x: this.tileX(r, i) - tw / 2, y: this.camY + this.tileCY(r) - th / 2, w: tw, h: th }; }

  layout() {
    this.w = this.app.screen.width; this.h = this.app.screen.height;
    this.rowH = Math.max(70, Math.min(112, this.h / 5));
    this.pw = Math.min(this.w - 20, this.w > 900 ? 560 : 470); this.cx = this.w / 2;
    this.drawSky(); this.drawCity(); this.drawMid(); this.drawFg();
    this.moon.position.set(this.w * 0.24, this.h * 0.12); this.moon.width = this.moon.height = Math.min(this.w, this.h) * 0.35;
    this.vignette.width = this.w; this.vignette.height = this.h;
    if (this.level) { this.buildRows(); this.placeHubie(); }
    this.world.y = this.camY = this.camFor(this.cleared);
    this.parallax(); this.seedRain();
    this.onLayout();
  }

  // ---------- backdrop ----------
  private drawSky() {
    const { w, h } = this; const g = this.sky.clear(); const N = 24;
    for (let i = 0; i < N; i++) { const t = i / N; g.rect(0, (h * 1.4 * i) / N - h * 0.2, w, (h * 1.4) / N + 1).fill(mix(0x0b0f14, 0x232a31, t * t)); }
    g.ellipse(w * 0.5, h * 0.62, w * 0.9, h * 0.22).fill({ color: 0x3a3127, alpha: 0.25 });
    const r = seeded(31);
    for (let i = 0; i < 9; i++) g.ellipse(r() * w, h * (0.05 + r() * 0.35), 60 + r() * 120, 10 + r() * 14).fill({ color: 0x2c343c, alpha: 0.25 });
  }
  private drawCity() {
    const { w, h } = this; const base = h * 0.66; const r = seeded(7);
    const g = this.farG.clear(), win = this.farWin.clear(); let x = -20;
    while (x < w + 20) {
      const bw = 24 + r() * 46, bh = h * (0.12 + r() * 0.3), top = base - bh;
      g.rect(x, top, bw, h).fill(0x1b222a);
      if (r() < 0.25) g.rect(x + bw * 0.4, top - 18, 2, 18).fill(0x1b222a).circle(x + bw * 0.4 + 1, top - 18, 2).fill({ color: 0xc0573f, alpha: 0.6 });
      for (let wy = top + 6; wy < base + h * 0.3; wy += 9) for (let wx = x + 4; wx < x + bw - 5; wx += 7) if (r() < 0.2) win.rect(wx, wy, 3, 4).fill({ color: r() < 0.65 ? 0xcfae6e : 0x8ea8bb, alpha: 0.2 + r() * 0.35 });
      x += bw + r() * 6;
    }
    const n = this.near.clear(); x = -10; const nb = h * 0.82;
    while (x < w + 10) {
      const bw = 40 + r() * 70, bh = h * (0.1 + r() * 0.22), top = nb - bh;
      n.rect(x, top, bw, h).fill(0x12171d);
      n.rect(x, top, bw, 2).fill({ color: 0x2f3842, alpha: 0.8 });
      for (let wy = top + 10; wy < nb + h * 0.2; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (r() < 0.12) n.rect(wx, wy, 5, 7).fill({ color: r() < 0.7 ? 0xb8915a : 0x7590a3, alpha: 0.25 + r() * 0.2 });
      x += bw + 4 + r() * 20;
    }
  }
  private drawMid() {
    const { w, h } = this; this.mid.removeChildren().forEach(c => { if (c !== this.billboard) c.destroy({ children: true }); });
    const SIL = 0x161c22, EDGE = 0x36414b;
    // water tower on the left
    const wt = new Graphics(); const tx = Math.max(46, w * 0.12), tb = h * 0.6, tw = Math.min(h * 0.13, w * 0.16, 120), th = tw * 0.9;
    for (const lx of [-0.42, -0.14, 0.14, 0.42]) wt.moveTo(tx + lx * tw, tb - th * 0.05).lineTo(tx + lx * tw * 1.25, tb + h * 0.2).stroke({ width: 3, color: SIL });
    wt.moveTo(tx - tw * 0.5, tb + h * 0.08).lineTo(tx + tw * 0.5, tb + h * 0.13).moveTo(tx + tw * 0.5, tb + h * 0.08).lineTo(tx - tw * 0.5, tb + h * 0.13).stroke({ width: 1.5, color: SIL });
    wt.rect(tx - tw / 2, tb - th, tw, th).fill(SIL);
    for (let k = 1; k < 4; k++) wt.rect(tx - tw / 2, tb - th + (th * k) / 4, tw, 1.5).fill({ color: EDGE, alpha: 0.6 });
    wt.rect(tx + tw / 2 - 3, tb - th, 2, th).fill({ color: 0x56636e, alpha: 0.5 });
    wt.poly([tx - tw * 0.58, tb - th, tx, tb - th - tw * 0.42, tx + tw * 0.58, tb - th]).fill(0x12171c);
    wt.circle(tx, tb - th - tw * 0.42, 2.5).fill({ color: 0xd04a35, alpha: 0.8 });
    this.mid.addChild(wt);
    // billboard on the right, Housebets neon
    const bb = this.billboard; bb.removeChildren().forEach(c => { if (c !== this.neon && c !== this.neonGlow) c.destroy(); }); const bw = Math.min(190, w * 0.44), bh = bw * 0.36, bx = w - bw / 2 - Math.max(10, w * 0.05), by = h * 0.2;
    const frame = new Graphics();
    for (const sx of [-0.3, 0.3]) frame.rect(bx + sx * bw - 2, by + bh / 2, 4, h * 0.5).fill(SIL);
    frame.moveTo(bx - bw * 0.3, by + bh / 2 + 20).lineTo(bx + bw * 0.3, by + bh / 2 + 60).stroke({ width: 1.5, color: SIL });
    frame.rect(bx - bw / 2 - 6, by + bh / 2 + 4, bw + 12, 3).fill(SIL);
    frame.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 4).fill(0x0e1318).stroke({ width: 2, color: 0x232b33 });
    for (let k = 0; k < 4; k++) frame.circle(bx - bw * 0.36 + k * bw * 0.24, by + bh / 2 + 1, 1.6).fill({ color: 0xffe2a8, alpha: 0.5 });
    this.neonGlow.position.set(bx, by); this.neonGlow.width = bw * 1.5; this.neonGlow.height = bh * 2.4; this.neonGlow.alpha = 0.12;
    this.neon.style.fontSize = Math.round(bw * 0.12); this.neon.position.set(bx, by - bh * 0.08);
    const sub = new Text({ text: 'NIGHT WALK', style: { fontFamily: FONT, fontWeight: '700', fontSize: Math.round(bw * 0.055), fill: 0x8b9aa6, letterSpacing: 4 } }); sub.anchor.set(0.5); sub.position.set(bx, by + bh * 0.27);
    bb.addChild(frame, this.neonGlow, this.neon, sub); this.mid.addChild(bb);
    // chimney stacks between the two
    const ch = new Graphics(); const r = seeded(19);
    for (let k = 0; k < 3; k++) { const x = w * (0.3 + k * 0.17) + r() * 20, top = h * (0.5 + r() * 0.08); ch.rect(x, top, 12 + r() * 8, h).fill(0x14191f).rect(x - 2, top, 16 + r() * 8, 4).fill(0x1f262d); }
    this.mid.addChild(ch);
    // clotheslines: catenary cables from the tower to the billboard post with hanging laundry
    const L = this.lines.clear(); this.cloths.forEach(c => c.destroy()); this.cloths = [];
    for (const [y0, y1, sag] of [[h * 0.42, h * 0.36, 26], [h * 0.47, h * 0.43, 20]]) {
      const x0 = tx + tw * 0.5, x1 = bx - bw * 0.3; L.moveTo(x0, y0).quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1).stroke({ width: 1.2, color: 0x2f3841 });
      for (let k = 1; k < 4; k++) {
        const t = k / 4 + (r() - 0.5) * 0.08; const px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t * t * x1, py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * ((y0 + y1) / 2 + sag * 2) + t * t * y1;
        const c = new Graphics(); const cw = 10 + r() * 10, chh = 12 + r() * 12; const col = [0x3d3640, 0x34403f, 0x463b33, 0x2f3846][Math.floor(r() * 4)];
        c.rect(-cw / 2, 0, cw, chh).fill(col).rect(-cw / 2, 0, cw, 2).fill({ color: 0x000000, alpha: 0.3 }).rect(-cw / 2 - 1, -1, 2, 3).fill(0x6b6255).rect(cw / 2 - 1, -1, 2, 3).fill(0x6b6255);
        c.position.set(px, py); this.clothLayer.addChild(c); this.cloths.push(c);
      }
    }
  }
  private drawFg() {
    const { w, h } = this; const g = this.fg.clear();
    // foreground vent pipes at the bottom corners, darker than everything
    const vent = (x: number, s: number) => { const b = h + 4; g.rect(x - 9 * s, b - 56 * s, 18 * s, 60 * s).fill(0x0a0d10).rect(x - 9 * s, b - 56 * s, 3 * s, 60 * s).fill({ color: 0x3a4550, alpha: 0.35 });
      g.ellipse(x, b - 58 * s, 15 * s, 5 * s).fill(0x0c1014).rect(x - 13 * s, b - 72 * s, 26 * s, 12 * s).fill(0x0a0d10).ellipse(x, b - 72 * s, 14 * s, 4 * s).fill(0x12171c); };
    vent(Math.max(14, w * 0.03), MOBILE ? 0.7 : 1); vent(w - Math.max(18, w * 0.04), MOBILE ? 0.85 : 1.2);
    this.vents = [[Math.max(14, w * 0.03), h - 72 * (MOBILE ? 0.7 : 1)], [w - Math.max(18, w * 0.04), h - 72 * (MOBILE ? 0.85 : 1.2)]];
  }
  private vents: number[][] = [];
  private parallax() { const dy = this.world.y - this.camFor(0); this.far.y = dy * 0.05; this.near.y = dy * 0.1; this.mid.y = this.lines.y = this.clothLayer.y = dy * 0.18; this.sky.y = dy * 0.02; this.fg.y = this.steam.y = dy * 0.6; }
  private seedRain() { const n = Math.min(MOBILE ? 110 : 220, Math.round((this.w * this.h) / 2600)); this.drops = Array.from({ length: n }, () => ({ x: Math.random() * (this.w + 60), y: Math.random() * this.h, l: 8 + Math.random() * 14, v: 9 + Math.random() * 7 })); }

  // ---------- rows of hatches ----------
  setLevel(lv: Level) {
    this.killAll(); this.level = lv; this.cleared = 0; this.hubieTile = -1;
    this.states = Array.from({ length: lv.rows }, (_, r) => new Array(tilesOn(lv, r)).fill('idle'));
    this.tag.visible = false; this.hubie.alpha = 1; this.hubie.rotation = 0; this.hubie.mode = 'idle';
    this.hubie.resetHat(); this.hubie.restPose();
    this.layout();
  }
  private buildRows() {
    this.puddle.removeFromParent(); for (const r of this.rows) { for (const t of r.tiles) t.lab.destroy({ children: true }); r.c.destroy({ children: true }); } this.rows = [];
    const lv = this.level, { rowH, pw, cx } = this; const wl = cx - pw / 2 - 8, ww = pw + 16;
    // steel scaffold behind the tiers: posts and cross braces, open so the city shows through
    const wall = this.wall.clear(); const top = this.rowY(lv.rows) - rowH * 0.4, bot = this.rowY(-1);
    for (const px of [wl + 4, wl + ww - 10]) wall.rect(px, top, 6, bot - top).fill(0x161c22).rect(px, top, 1.5, bot - top).fill({ color: 0x4a5560, alpha: 0.4 });
    for (let ri = -1; ri < lv.rows; ri++) { const y0 = this.rowY(ri) - this.tileH(tilesOn(lv, Math.max(0, ri))) - 14, y1 = this.rowY(ri + 1) + 10; if (ri < 0) continue;
      wall.moveTo(wl + 8, y1).lineTo(wl + ww - 8, y0).moveTo(wl + ww - 8, y1).lineTo(wl + 8, y0).stroke({ width: 2, color: 0x1a2128, alpha: 0.9 }); }
    // rooftop floor with a puddle
    const floor = new Container(); const fl = new Graphics(); const fy = this.rowY(-1);
    fl.rect(-20, fy - rowH * 0.62, this.w + 40, rowH * 0.62 + this.h).fill(0x161c22);
    fl.rect(-20, fy - rowH * 0.62, this.w + 40, 2).fill({ color: 0x46525d, alpha: 0.6 });
    for (let x = -20; x < this.w + 20; x += 44) fl.rect(x, fy - rowH * 0.62, 1, rowH * 0.62).fill({ color: 0x000000, alpha: 0.25 });
    fl.rect(-20, fy, this.w + 40, 10).fill(0x0e1216);
    floor.addChild(fl, this.puddle); this.drawPuddle(fy - rowH * 0.3);
    this.rowsLayer.addChild(floor); this.rows.push({ c: floor, tiles: [] });
    for (let ri = 0; ri < lv.rows; ri++) {
      const c = new Container(); const y = this.rowY(ri); const n = tilesOn(lv, ri), th = this.tileH(n);
      const ledge = new Graphics(); const sh = th + 16;
      for (let k = 0; k < 6; k++) ledge.rect(wl, y - sh * (1 - k / 6), ww, sh / 6 + 0.5).fill({ color: 0x1d252d, alpha: 0.08 + k * 0.09 });
      ledge.rect(wl - 4, y - 3, ww + 8, 3).fill(0x3b4650).rect(wl - 4, y, ww + 8, 8).fill(0x151a1f).rect(wl - 4, y + 8, ww + 8, 6).fill({ color: 0x000000, alpha: 0.3 });
      ledge.rect(wl + ww * 0.15, y - 2, ww * 0.4, 1).fill({ color: 0x9fb6c8, alpha: 0.18 });
      for (let k = 0; k < 5; k++) { const dx = wl + ((k * 0.23 + ri * 0.17) % 1) * ww; ledge.rect(dx, y + 8, 1, 3 + ((k + ri) % 3) * 2).fill({ color: 0x9fb6c8, alpha: 0.25 }); }
      c.addChild(ledge);
      const tiles: Tile[] = [];
      for (let i = 0; i < n; i++) {
        const tc = new Container(); const g = new Graphics(), chip = new Graphics(), prints = new Graphics();
        const mult = isSummit(lv, ri) ? 'SUMMIT  10,000x' : fmtMult(multAt(lv, ri + 1));
        const fs = Math.round(Math.min(th * 0.3, (this.tileW(n) - 14) / (mult.length * 0.62)));
        const txt = new Text({ text: mult, style: { fontFamily: FONT, fontWeight: '900', fontSize: fs, fill: 0x9aa4ad } }); txt.anchor.set(0.5);
        const txtShade = new Text({ text: mult, style: { fontFamily: FONT, fontWeight: '900', fontSize: fs, fill: 0x000000 } }); txtShade.anchor.set(0.5); txtShade.y = -1.2; txtShade.alpha = 0.7;
        const chipTxt = new Text({ text: mult.replace('SUMMIT  ', ''), style: { fontFamily: FONT, fontWeight: '900', fontSize: Math.round(fs * 0.92), fill: 0x4a2a00 } }); chipTxt.anchor.set(0.5);
        const lab = new Container(); lab.addChild(txtShade, txt); this.labels.addChild(lab);
        tc.addChild(g, chip, chipTxt, prints); tc.position.set(this.tileX(ri, i), this.tileCY(ri));
        c.addChild(tc); tiles.push({ lab, c: tc, g, chip, chipTxt, txt, txtShade, prints, w: this.tileW(n), h: th, mult });
      }
      this.rowsLayer.addChild(c); this.rows.push({ c, tiles });
      tiles.forEach((_, i) => this.drawTile(ri, i));
    }
  }
  private drawPuddle(y: number) {
    const p = this.puddle.clear(); const x = this.cx + this.pw * 0.18, rw = Math.min(120, this.pw * 0.3);
    p.ellipse(x, y, rw, 9).fill({ color: 0x070a0d, alpha: 0.85 });
    p.rect(x - rw * 0.5, y - 3, rw * 0.5, 2).fill({ color: CYAN, alpha: 0.25 }).rect(x + rw * 0.1, y + 1, rw * 0.35, 1.5).fill({ color: 0xcfae6e, alpha: 0.2 });
    this.puddleAt = { x, y, rw };
  }
  private puddleAt = { x: 0, y: 0, rw: 0 };
  private R(r: number) { return this.rows[r + 1]; }
  drawTile(r: number, i: number) {
    const row = this.R(r); if (!row) return; const t = row.tiles[i]; const st = this.states[r][i]; const summit = isSummit(this.level, r);
    const g = t.g.clear(); const { w, h } = t; const hw = w / 2, hh = h / 2, R = Math.min(12, h * 0.24);
    const open = st === 'safe' || st === 'safePicked', broken = st === 'trap' || st === 'trapPicked', active = st === 'active';
    g.roundRect(-hw + 1, -hh + 7, w, h, R).fill({ color: 0x000000, alpha: 0.5 });
    g.roundRect(-hw, -hh + 4, w, h, R).fill(0x0f1215);
    const rim = summit ? 0x5b4a24 : active ? 0x404952 : 0x2d3339;
    g.roundRect(-hw, -hh, w, h, R).fill(rim);
    g.roundRect(-hw + 1.5, -hh + 1, w - 3, h * 0.4, R).fill({ color: 0xffffff, alpha: active ? 0.1 : 0.05 });
    const ix = -hw + 5, iy = -hh + 5, iw = w - 10, ih = h - 10, ir = R * 0.7;
    if (open) {
      g.roundRect(ix, iy, iw, ih, ir).fill(0x07090b).roundRect(ix, iy, iw, 5, ir).fill({ color: 0x000000, alpha: 0.6 });
    } else {
      const plate = summit ? (active ? 0x7a6430 : 0x5f4f2a) : broken ? 0x2b2725 : active ? 0x4d565f : 0x3b4249;
      g.roundRect(ix, iy, iw, ih, ir).fill(plate);
      g.roundRect(ix, iy, iw, 5, ir).fill({ color: 0x000000, alpha: 0.38 }).rect(ix + 4, iy + ih - 2, iw - 8, 1.5).fill({ color: 0xffffff, alpha: 0.12 });
      const rr = seeded(r * 31 + i * 7 + 5);
      for (let yy = iy + 8; yy < iy + ih - 5; yy += 7) for (let xx = ix + 6 + ((yy / 7) % 2) * 4; xx < ix + iw - 6; xx += 9) g.moveTo(xx, yy).lineTo(xx + 3, yy - 2).stroke({ width: 1, color: 0x000000, alpha: 0.18 + rr() * 0.08 });
      for (const [bx, by] of [[ix + 4, iy + 4], [ix + iw - 4, iy + 4], [ix + 4, iy + ih - 4], [ix + iw - 4, iy + ih - 4]]) g.circle(bx, by, 2.3).fill(0x1b1f23).circle(bx - 0.6, by - 0.6, 1).fill({ color: 0xffffff, alpha: 0.25 });
      if (broken) {
        const cr = seeded(r * 13 + i + 1);
        g.poly([-w * 0.12, -h * 0.1, w * 0.02, -h * 0.2, w * 0.14, -h * 0.04, w * 0.08, h * 0.16, -w * 0.06, h * 0.14, -w * 0.16, h * 0.04]).fill(0x050404);
        if (st === 'trapPicked') g.poly([-w * 0.07, -h * 0.04, w * 0.03, -h * 0.1, w * 0.09, 0, w * 0.04, h * 0.09, -w * 0.06, h * 0.07]).fill({ color: 0xff6a2a, alpha: 0.75 });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + cr(); let px = Math.cos(a) * w * 0.12, py = Math.sin(a) * h * 0.14; g.moveTo(px, py); for (let s = 0; s < 3; s++) { px += Math.cos(a + (cr() - 0.5)) * w * 0.09; py += Math.sin(a + (cr() - 0.5)) * h * 0.1; g.lineTo(px, py); } g.stroke({ width: 1.6, color: 0x050404, alpha: 0.9 }); }
      }
    }
    if (active) { g.roundRect(-hw - 2, -hh - 2, w + 4, h + 4, R + 2).stroke({ width: 5, color: summit ? GOLD : CYAN, alpha: 0.12 }); g.roundRect(-hw - 0.5, -hh - 0.5, w + 1, h + 1, R).stroke({ width: 1.8, color: summit ? GOLD : CYAN, alpha: 0.9 }); }
    // engraved or embossed multiplier
    const showTxt = !open && st !== 'trapPicked';
    t.txt.visible = t.txtShade.visible = showTxt;
    t.txt.style.fill = summit ? (active ? 0xffe7a6 : 0xcfb070) : active ? 0xf0fdff : broken ? 0x5d5752 : 0xa2acb5;
    t.txt.alpha = st === 'dim' ? 0.5 : 1;
    // gold Housebets chip seated in the open hatch
    const c = t.chip.clear(); t.chip.visible = t.chipTxt.visible = open;
    if (open) {
      const rx = Math.min(hw - 7, hh * 1.5), ry = hh - 6;
      c.ellipse(0, 3, rx, ry).fill(0x8a5a10);
      c.ellipse(0, 0, rx, ry).fill(GOLD);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; c.ellipse(Math.cos(a) * rx * 0.86, Math.sin(a) * ry * 0.86, rx * 0.1, ry * 0.12).fill(0xfff1c9); }
      c.ellipse(0, 0, rx * 0.7, ry * 0.68).fill(0xdc9b22).ellipse(0, 0, rx * 0.7, ry * 0.68).stroke({ width: 1.4, color: 0xffe08a });
      c.ellipse(-rx * 0.3, -ry * 0.45, rx * 0.25, ry * 0.12).fill({ color: 0xffffff, alpha: 0.35 });
      t.chip.alpha = t.chipTxt.alpha = st === 'safePicked' ? 1 : 0.4;
    }
    t.c.alpha = st === 'dim' ? 0.55 : st === 'trap' ? 0.7 : 1;
  }
  setState(r: number, i: number, s: TileState) { if (!this.states[r]) return; this.states[r][i] = s; this.drawTile(r, i); }
  setActiveRow(r: number | null) {
    this.states.forEach((row, rr) => row.forEach((s, i) => { if (s === 'active' && rr !== r) this.setState(rr, i, 'idle'); }));
    if (r !== null && r < this.level.rows) this.states[r].forEach((s, i) => { if (s === 'idle') this.setState(r, i, 'active'); });
  }
  /** Pointer hover and press feedback from the DOM tile buttons. */
  hover(i: number, on: boolean) { const t = this.R(this.cleared)?.tiles[i]; if (!t || this.states[this.cleared][i] !== 'active') return; gsap.to(t.c, { y: this.tileCY(this.cleared) - (on ? 3 : 0), duration: 0.12 }); gsap.to(t.c.scale, { x: on ? 1.04 : 1, y: on ? 1.04 : 1, duration: 0.12 }); }
  press(i: number) { const t = this.R(this.cleared)?.tiles[i]; if (!t) return; gsap.fromTo(t.c.scale, { x: 0.93, y: 0.9 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }); }
  /** Safe step: the hatch flips over into a gold chip and Hubie leaves glowing cyan claw prints. */
  flipChip(r: number, i: number) {
    const t = this.R(r)?.tiles[i]; if (!t) return; t.c.y = this.tileCY(r);
    const tl = gsap.timeline();
    tl.to(t.c.scale, { y: 0.05, x: 1.06, duration: this.d(0.11), ease: 'power2.in', onComplete: () => this.setState(r, i, 'safePicked') })
      .to(t.c.scale, { y: 1, x: 1, duration: this.d(0.45), ease: 'elastic.out(1, 0.45)' });
    this.track(tl);
    const p = t.prints.clear(); const s = Math.max(0.7, t.h / 50);
    // glowing cyan claw prints: a pad and three claw dots for each foot
    for (const [x, y] of [[-0.2, 0.26], [0.2, 0.16]]) { const px = t.w * x, py = t.h * y;
      p.ellipse(px, py, 5 * s, 3.4 * s).fill({ color: CYAN, alpha: 0.18 }).ellipse(px, py + 0.6 * s, 2.6 * s, 1.8 * s).fill({ color: 0x9ffcff, alpha: 0.85 });
      for (const k of [-1, 0, 1]) p.ellipse(px + k * 2.4 * s, py - 2.6 * s + Math.abs(k) * 0.6 * s, 0.7 * s, 1.2 * s).fill({ color: 0xd8feff, alpha: 0.9 }); }
    p.alpha = 0; this.track(gsap.to(p, { alpha: 0.85, duration: 0.3, delay: this.d(0.35) }));
    this.cleared = r + 1; this.hubieTile = i;
  }
  /** Trap: the hatch cracks, smoke rises from the hole. */
  crack(r: number, i: number) {
    const t = this.R(r)?.tiles[i]; if (!t) return; this.setState(r, i, 'trapPicked');
    this.track(gsap.fromTo(t.c, { x: t.c.x - 4 }, { x: t.c.x, duration: 0.4, ease: 'elastic.out(1,0.25)' }));
    const wx = t.c.x, wy = t.c.y; for (let k = 0; k < 14; k++) this.puff(wx + (Math.random() - 0.5) * t.w * 0.3, wy, 0x7d858c, 1.4);
  }
  private puff(x: number, y: number, col: number, size = 1, layer: Container = this.world) {
    if (this.puffs.length > 80) return; const g = new Graphics(); g.circle(0, 0, 6 * size).fill({ color: col, alpha: 0.35 }); g.position.set(x, y); layer.addChild(g);
    this.puffs.push({ g, vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random() * 0.9, life: 0, max: 60 + Math.random() * 50 });
  }

  // ---------- Hubie ----------
  /** Hubie is 137 units tall with the hat: about 100 to 120 CSS px on a phone, a little taller on desktop. */
  private hubieScale() { const n = this.level ? Math.max(...Array.from({ length: Math.min(3, this.level.rows) }, (_, r) => tilesOn(this.level, r))) : 3;
    const px = this.w < 600 ? Math.max(100, Math.min(112, this.rowH * 1.15)) : Math.min(140, this.rowH * 1.2); return Math.min(px / 137, (this.tileW(n) + 40) / 84); }
  private placeHubie() {
    const H = this.hubie; H.scale.set(this.hubieScale());
    const r = this.cleared - 1; H.x = r < 0 ? this.idleX() : this.tileX(r, Math.max(0, this.hubieTile)); H.y = this.feetY(r);
    this.drawShadow();
  }
  private drawShadow() { const s = this.hubieScale(); this.hubieShadow.clear().ellipse(0, 0, 30 * s, 4.5 * s).fill({ color: 0x000000, alpha: 0.45 }); }
  /** Hubie walks in from the left edge to his start spot. */
  walkIn(): Promise<void> {
    const H = this.hubie; H.x = -40; H.y = this.feetY(-1); H.mode = 'walk'; H.scale.x = this.hubieScale();
    return new Promise(res => this.track(gsap.to(H, { x: this.idleX(), duration: this.d(1.1), ease: 'none', onComplete: () => { H.mode = 'idle'; res(); } })));
  }
  /** After a fall Hubie walks back onto the rooftop floor while the revealed board stays. */
  respawn() {
    const H = this.hubie; this.cleared = 0; this.hubieTile = -1; H.alpha = 1; H.rotation = 0; H.scale.set(this.hubieScale()); H.resetHat(); H.restPose(); H.mode = 'walk';
    this.panTo(0); void this.walkIn();
  }
  /** At the bet Hubie strolls to the middle of the floor, under the first row. */
  walkToStart(): Promise<void> {
    const H = this.hubie; if (this.cleared > 0) return Promise.resolve(); H.mode = 'walk';
    return new Promise(res => this.track(gsap.to(H, { x: this.cx, duration: this.d(0.45), ease: 'none', onComplete: () => { H.mode = 'idle'; res(); } })));
  }
  /** Hubie hops onto tile i of row r. Resolves on landing. */
  hop(r: number, i: number): Promise<void> {
    return new Promise(res => {
      const b = this.hubieScale(), H = this.hubie; gsap.killTweensOf(H); H.mode = 'air'; const x0 = H.x, y0 = H.y;
      const x1 = this.tileX(r, i), y1 = this.feetY(r); const peak = this.rowH * 0.75;
      const p = { t: 0 }; const tl = gsap.timeline({ onComplete: () => { H.mode = 'idle'; res(); } });
      tl.to(H.scale, { x: b * 1.15, y: b * 0.8, duration: this.d(0.11), ease: 'power2.out' })
        .to(H.rig, { rotation: -0.06, duration: this.d(0.15) }, '<')
        .to(p, { t: 1, duration: this.d(0.42), ease: 'none', onUpdate: () => { const t = p.t; H.x = x0 + (x1 - x0) * t; H.y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * peak; } }, '>')
        .to(H.scale, { x: b * 0.9, y: b * 1.12, duration: this.d(0.18), ease: 'power1.out' }, '<')
        .to(H.rig, { rotation: 0.05, duration: this.d(0.3) }, '<').to(H.hat, { y: H.hat.y - 4, duration: this.d(0.2), yoyo: true, repeat: 1 }, '<')
        .to(H.scale, { x: b * 1.2, y: b * 0.78, duration: this.d(0.08), ease: 'power2.out' }, '>')
        .call(() => { H.mode = 'idle'; })
        .to(H.rig, { rotation: 0, duration: this.d(0.2) }, '<')
        .to(H.scale, { x: b, y: b, duration: this.d(0.35), ease: 'elastic.out(1, 0.45)' }, '<');
      this.track(tl);
    });
  }
  panTo(cleared: number) { this.camY = this.camFor(cleared); this.track(gsap.to(this.world, { y: this.camY, duration: this.d(0.6), ease: 'power2.inOut' })); }
  lightRow(_r: number) { /* footprints are drawn by flipChip */ }
  setMultTag(text: string | null) {
    if (!text) { this.tag.visible = false; return; }
    this.tagTxt.text = text; const w = this.tagTxt.width + 14, h = 18;
    this.tagBg.clear().roundRect(-w / 2, -h / 2, w, h, 9).fill({ color: 0x06090c, alpha: 0.85 }).roundRect(-w / 2, -h / 2, w, h, 9).stroke({ width: 1, color: CYAN, alpha: 0.6 });
    this.tag.visible = true; this.track(gsap.fromTo(this.tag.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' }));
  }
  /** Trap: Hubie flails and drops through the cracked hatch. */
  tumble(): Promise<void> {
    return new Promise(res => {
      const H = this.hubie; H.mode = 'fall'; this.tag.visible = false;
      const tl = gsap.timeline({ onComplete: () => res() });
      tl.to(H, { y: H.y - this.rowH * 0.45, duration: this.d(0.28), ease: 'power2.out' })
        .to(H, { rotation: (Math.random() < 0.5 ? -1 : 1) * 0.8, duration: this.d(0.2) }, '<')
        .to(H.hat, { y: H.hat.y - 45, x: H.hat.x + 18, rotation: 1.4, duration: this.d(0.5), ease: 'power1.out' }, '<')
        .to(H, { rotation: '+=' + ((Math.random() < 0.5 ? -1 : 1) * 3.2), duration: this.d(0.9), ease: 'power1.in' }, '>-0.1')
        .to(H, { y: H.y + this.rowH * 1.6, duration: this.d(0.7), ease: 'power2.in' }, '>0.15')
        .to(H.scale, { x: this.hubieScale() * 0.6, y: this.hubieScale() * 0.6, duration: this.d(0.7) }, '<')
        .to(H, { alpha: 0, duration: this.d(0.3) }, '>-0.3');
      this.track(tl);
    });
  }
  /** Win: tier 0 small hop, 1 hat tip, 2 spotlight, 3 city lights up, 4 fireworks too. */
  celebrate(tier = 0) {
    const H = this.hubie, b = this.hubieScale(); H.mode = 'win'; gsap.killTweensOf([H.hat, H.armR, H.armL]); H.resetHat(); const hx = H.hat.x, hy = H.hat.y, hr = H.hat.rotation;
    const tl = gsap.timeline({ onComplete: () => { H.mode = 'idle'; H.faceOverride = null; } });
    if (tier >= 3) {
      // big win: a proper jump with both arms up, the hat bouncing on the head
      tl.to(H.scale, { x: b * 1.15, y: b * 0.82, duration: 0.14, ease: 'power2.out' })
        .to(H.armR, { rotation: -2.6, duration: 0.2, ease: 'back.out(2)' }, '>').to(H.armL, { rotation: 2.6, duration: 0.2, ease: 'back.out(2)' }, '<')
        .to(H.scale, { x: b * 0.92, y: b * 1.1, duration: 0.2 }, '<').to(H, { y: H.y - this.rowH * 0.55, duration: 0.3, ease: 'power2.out', yoyo: true, repeat: 3 }, '<')
        .to(H.hat, { y: hy - 8, duration: 0.3, ease: 'power2.out', yoyo: true, repeat: 3 }, '<')
        .to(H.scale, { x: b, y: b, duration: 0.4, ease: 'elastic.out(1,0.5)' }, '>')
        .to([H.armR, H.armL], { rotation: 0, duration: 0.35 }, '+=0.6');
    } else {
      // hat tip with a grin, then a small fist pump
      tl.to(H, { y: H.y - this.rowH * 0.15, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.out' })
        .to(H.armR, { rotation: -2.75, duration: 0.28, ease: 'back.out(1.6)' }, 0.05)
        .to(H.hat, { x: hx + 14, y: hy - 12, rotation: 0.35, duration: 0.28, ease: 'back.out(1.6)' }, '<0.06')
        .to(H.head, { rotation: -0.08, duration: 0.25 }, '<')
        .to(H.hat, { x: hx, y: hy, rotation: hr, duration: 0.3, ease: 'power2.inOut' }, '+=0.55').to(H.armR, { rotation: 0, duration: 0.3 }, '<').to(H.head, { rotation: 0, duration: 0.3 }, '<')
        .to(H.armL, { rotation: 1.5, duration: 0.12, yoyo: true, repeat: 3, ease: 'power2.out' }, '>');
    }
    if (tier >= 1) tl.to(H.rig.scale, { x: 1.06, y: 0.95, duration: 0.12, yoyo: true, repeat: 3 }, 0.1);
    this.track(tl);
    if (tier >= 2) this.spotlight(tier >= 3 ? 6 : 3);
    if (tier >= 3) { this.cityBoost = 1; this.track(gsap.to(this, { cityBoost: 0, duration: 7, ease: 'power1.in' })); }
    if (tier >= 4) for (let k = 0; k < 8; k++) this.track(gsap.delayedCall(k * 0.45, () => this.firework()));
  }
  private spotlight(sec: number) {
    const g = this.beam; g.alpha = 0; const draw = (a: number) => { const x0 = this.w * 0.85, y0 = this.h + 20; const tx = this.cx + Math.sin(a) * this.w * 0.4; g.clear().poly([x0 - 8, y0, x0 + 8, y0, tx + 70, -20, tx - 70, -20]).fill({ color: 0xfff2c4, alpha: 0.07 }); };
    const o = { a: -1 }; this.track(gsap.timeline().to(g, { alpha: 1, duration: 0.3 }).to(o, { a: 1, duration: sec / 2, yoyo: true, repeat: 1, ease: 'sine.inOut', onUpdate: () => draw(o.a) }, '<').to(g, { alpha: 0, duration: 0.4 }));
  }
  private firework() {
    const x = this.w * (0.2 + Math.random() * 0.6), y = this.h * (0.1 + Math.random() * 0.25); const col = Math.random() < 0.6 ? GOLD : CYAN;
    for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2; const g = new Graphics(); g.circle(0, 0, 2).fill(col); g.position.set(x, y); this.fireworks.addChild(g);
      this.track(gsap.to(g, { x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70 + 20, alpha: 0, duration: 1.2, ease: 'power2.out', onComplete: () => g.destroy() })); }
  }
  hubieScreen() { const r = this.app.canvas.getBoundingClientRect(); return { x: r.left + this.hubie.x, y: r.top + this.world.y + this.hubie.y - this.hubieScale() * 60 }; }
  /** Screen box around Hubie, for test crops. */
  hubieRect() { const c = this.app.canvas.getBoundingClientRect(); const b = this.hubie.getBounds(); return { x: c.left + b.x, y: c.top + b.y, w: b.width, h: b.height }; }
  tileScreen(r: number, i: number) { const c = this.app.canvas.getBoundingClientRect(); const t = this.tileRect(r, i); return { x: c.left + t.x + t.w / 2, y: c.top + t.y + t.h / 2 }; }
  reset(lv: Level) { this.setLevel(lv); }
  /** Reveal the whole layout at the end of a round, sweeping upward from row `from`. */
  reveal(layout: boolean[][], from: number) {
    layout.forEach((row, r) => row.forEach((trap, i) => {
      const s = this.states[r]?.[i]; if (s === undefined || s === 'safePicked' || s === 'trapPicked') return;
      const ns: TileState = trap ? 'trap' : 'safe'; const delay = this.fast ? 0 : Math.max(0, r - from) * 0.05;
      if (delay === 0) this.setState(r, i, ns); else this.track(gsap.delayedCall(delay, () => this.setState(r, i, ns)));
    }));
  }

  // ---------- per frame ----------
  private frame(dt: number) {
    const now = performance.now() / 1000; const { w, h } = this;
    this.hubie?.tick(now);
    if (this.hubie) {
      const H = this.hubie; this.hubieShadow.position.set(H.x, this.cleared === 0 && H.mode !== 'air' ? this.feetY(-1) : H.mode === 'air' ? H.y + 999 : this.feetY(this.cleared - 1));
      this.hubieShadow.visible = H.mode !== 'air' && H.mode !== 'fall';
      this.tag.position.set(H.x, H.y + 14);
      this.onFrame(H.x, this.world.y + H.y + 28);
    }
    this.parallax();
    // neon flicker and city glow
    const fl = Math.random() < 0.015 ? 0.35 : 1; this.neon.alpha = (0.75 + Math.sin(now * 3) * 0.05) * fl + this.cityBoost * 0.25;
    this.neonGlow.alpha = 0.1 * fl + this.cityBoost * 0.25; this.farWin.alpha = 1 + this.cityBoost * (1.5 + Math.sin(now * 12) * 0.5);
    this.cloths.forEach((c, k) => { c.rotation = Math.sin(now * 1.4 + k) * 0.08; });
    // rain
    const g = this.rain.clear(); const wind = 2.2;
    for (const d of this.drops) { d.y += d.v * dt; d.x -= wind * dt * 0.5; if (d.y > h) { if (Math.random() < 0.06) this.ripples.push({ x: this.puddleAt.x + (Math.random() - 0.5) * this.puddleAt.rw * 1.4, y: this.puddleAt.y, t: 0 }); d.y = -d.l; d.x = Math.random() * (w + 60); } g.moveTo(d.x, d.y).lineTo(d.x + wind, d.y + d.l); }
    g.stroke({ width: 1, color: 0xa9bccb, alpha: 0.22 });
    for (let k = this.ripples.length - 1; k >= 0; k--) { const r = this.ripples[k]; r.t += dt / 40; if (r.t > 1) { this.ripples.splice(k, 1); continue; } g.ellipse(r.x, r.y + this.world.y, 3 + r.t * 10, 1 + r.t * 2.5).stroke({ width: 1, color: 0xa9bccb, alpha: 0.4 * (1 - r.t) }); }
    // steam from foreground vents
    if (this.vents.length && Math.random() < 0.12) { const v = this.vents[Math.random() < 0.5 ? 0 : 1]; this.puff(v[0] + (Math.random() - 0.5) * 8, v[1], 0x9aa6af, 1.2, this.steam); }
    for (let k = this.puffs.length - 1; k >= 0; k--) { const p = this.puffs[k]; p.life += dt; p.g.x += p.vx * dt; p.g.y += p.vy * dt; p.g.scale.set(1 + p.life / 30); p.g.alpha = Math.max(0, 1 - p.life / p.max); if (p.life > p.max) { p.g.destroy(); this.puffs.splice(k, 1); } }
    // multiplier labels follow their hatch (hover lift, press squash, flip)
    for (const row of this.rows) for (const t of row.tiles) { t.lab.position.copyFrom(t.c.position); t.lab.scale.copyFrom(t.c.scale); t.lab.alpha = t.c.alpha; }
    // active row breathes
    if (this.level) { const row = this.R(this.cleared); if (row) row.tiles.forEach((t, i) => { if (this.states[this.cleared]?.[i] === 'active') t.g.alpha = 0.9 + Math.sin(now * 4 + i) * 0.1; else t.g.alpha = 1; }); }
  }
  get camSettled() { return Math.abs(this.world.y - this.camY) < 0.5; }
  /** Hubie as an SVG data URL for the header badge (bust), the intro and the celebrations (full body). */
  async portrait(pose: 'idle' | 'win' | 'bust' = 'idle') {
    if (pose === 'bust') return svgUrl(fullSvg({}, [-34, -140, 34, -50], 136));
    if (pose === 'win') return svgUrl(fullSvg({ face: 'happy', mouth: 'grin', armF: -2.75, hat: { x: 14, y: -12, rot: 0.35 }, head: -0.08 }, undefined, 300));
    return svgUrl(fullSvg({}, undefined, 300));
  }
}

function mix(a: number, b: number, t: number) { const f = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return (f(16) << 16) | (f(8) << 8) | f(0); }
export const fmtMult = (m: number) => (m >= 10000 ? '10,000' : m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + 'x';
