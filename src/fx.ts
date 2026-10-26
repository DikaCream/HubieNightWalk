// Reused from the Housebets slot, plus a smoke puff kind for the vent traps.
// Single full-screen canvas particle system: ambient dust, coin showers, bursts.
// Perf: pre-rendered sprites (drawImage + setTransform, no paths per frame), capped DPR and particle count,
// swap-remove pool instead of filter(), and the canvas is not touched while idle.
type Kind = 'dust' | 'coin' | 'spark' | 'bill' | 'ember' | 'smoke';
type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: Kind; r: number; rot: number; vr: number; hue: number; g: number };
const MOBILE = Math.min(innerWidth, innerHeight) < 600;
const CAP = MOBILE ? 260 : 600;
function sprite(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); return c; }
const COIN = sprite(64, 64, x => { x.fillStyle = '#b86e00'; x.beginPath(); x.arc(32, 32, 31, 0, 7); x.fill(); x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(32, 30, 25, 0, 7); x.fill(); x.fillStyle = '#fff6c2'; x.fillRect(24, 16, 6, 16); });
const COIN_DARK = sprite(64, 64, x => { x.fillStyle = '#b86e00'; x.beginPath(); x.arc(32, 32, 31, 0, 7); x.fill(); x.fillStyle = '#f2a516'; x.beginPath(); x.arc(32, 30, 25, 0, 7); x.fill(); });
const BILL = sprite(64, 32, x => { x.fillStyle = '#5fb36a'; x.fillRect(0, 0, 64, 32); x.fillStyle = '#2f7a3a'; x.beginPath(); x.arc(32, 16, 10, 0, 7); x.fill(); });
const SPARKS = Array.from({ length: 8 }, (_, i) => sprite(32, 8, x => { x.fillStyle = `hsl(${34 + i * 4},100%,${60 + i * 3}%)`; x.fillRect(0, 0, 32, 8); }));
const DOT = sprite(16, 16, x => { x.fillStyle = '#7ff3ef'; x.beginPath(); x.arc(8, 8, 8, 0, 7); x.fill(); });
const SMOKE = sprite(64, 64, x => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(200,215,220,0.55)'); g.addColorStop(1, 'rgba(200,215,220,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const EMBER = sprite(16, 16, x => { x.fillStyle = '#ff8a1f'; x.beginPath(); x.arc(8, 8, 8, 0, 7); x.fill(); });
export class FX {
  ps: P[] = []; ctx: CanvasRenderingContext2D; w = 0; h = 0; d = 1; c: HTMLCanvasElement;
  shower = 0; ambient = false; heat = false; private dirty = false; private rt = 0;
  clear() { this.ps.length = 0; this.shower = 0; }
  constructor(c: HTMLCanvasElement) { this.c = c; this.ctx = c.getContext('2d')!; this.resize(); addEventListener('resize', this.onResize); requestAnimationFrame(this.loop); }
  private onResize = () => { clearTimeout(this.rt); this.rt = window.setTimeout(() => this.resize(), 150); };
  resize() { this.d = Math.min(devicePixelRatio || 1, MOBILE ? 1.25 : 1.75); this.w = this.c.width = Math.round(innerWidth * this.d); this.h = this.c.height = Math.round(innerHeight * this.d); }
  private add(p: Partial<P>) { if (this.ps.length >= CAP) return; this.ps.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 100, kind: 'spark', r: 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, hue: 45, g: .35, ...p }); }
  /** Burst at CSS-pixel coordinates. */
  burst(n: number, x = innerWidth / 2, y = innerHeight / 2, kinds: Kind[] = ['coin', 'spark'], power = 1) {
    if (MOBILE) n = Math.ceil(n * .6);
    const s0 = this.d * Math.min(1.4, innerWidth / 900);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (3 + Math.random() * 11) * s0 * power; const k = kinds[Math.floor(Math.random() * kinds.length)];
      this.add({ x: x * this.d, y: y * this.d, vx: Math.cos(a) * s * (k === 'smoke' ? .35 : 1), vy: Math.sin(a) * s * (k === 'smoke' ? .35 : 1) - 5 * s0 * (k === 'smoke' ? .3 : 1), kind: k, r: (k === 'coin' ? 7 + Math.random() * 7 : k === 'bill' ? 10 : k === 'smoke' ? 10 + Math.random() * 10 : 2 + Math.random() * 3) * s0, hue: Math.floor(Math.random() * 8), g: k === 'bill' ? .08 : k === 'smoke' ? -.02 : .3 * s0, max: k === 'smoke' ? 50 + Math.random() * 30 : 70 + Math.random() * 70 }); }
  }
  burstAt(el: Element | null, n = 24, kinds: Kind[] = ['spark'], power = .6) { if (!el) return; const r = el.getBoundingClientRect(); this.burst(n, r.left + r.width / 2, r.top + r.height / 2, kinds, power); }
  loop = () => {
    requestAnimationFrame(this.loop);
    const { ctx, w, h, d } = this;
    if (this.ambient && Math.random() < .25) this.add({ x: Math.random() * w, y: h + 10, vx: (Math.random() - .5) * .4, vy: -(.4 + Math.random() * 1.1) * d, max: 500, kind: this.heat ? 'ember' : 'dust', r: (1 + Math.random() * 2) * d, g: 0 });
    const sh = MOBILE ? this.shower * .6 : this.shower;
    for (let i = 0; i < sh; i++) if (Math.random() < .25) this.add({ x: Math.random() * w, y: -20 - Math.random() * 60, vx: (Math.random() - .5) * 2, vy: (5 + Math.random() * 6) * d, max: 220, kind: Math.random() < .8 ? 'coin' : 'bill', r: (5 + Math.random() * 6) * d, g: .12 * d });
    if (!this.ps.length) { if (this.dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); this.dirty = false; } return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, w, h); this.dirty = true;
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) { const p = ps[i];
      if (p.life++ >= p.max || p.y > h + 60 || p.y < -200) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; if (p.kind === 'bill') p.vx = Math.sin(p.life / 12) * 2 * d;
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) / 25, p.life / 6));
      if (p.kind === 'smoke') { p.r *= 1.025; p.vx *= .95; p.vy *= .95; ctx.globalAlpha *= .8; ctx.setTransform(1, 0, 0, 1, p.x, p.y); ctx.drawImage(SMOKE, -p.r, -p.r, p.r * 2, p.r * 2); continue; }
      if (p.kind === 'dust' || p.kind === 'ember') { ctx.globalAlpha *= .7; ctx.setTransform(1, 0, 0, 1, p.x + Math.sin(p.life / 25) * 6 * d, p.y); ctx.drawImage(p.kind === 'ember' ? EMBER : DOT, -p.r, -p.r, p.r * 2, p.r * 2); continue; }
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      if (p.kind === 'coin') { const sx = Math.max(.12, Math.abs(Math.cos(p.life / 5 + p.rot))); ctx.setTransform(c * sx, s * sx, -s, c, p.x, p.y); ctx.drawImage(sx > .5 ? COIN : COIN_DARK, -p.r, -p.r, p.r * 2, p.r * 2); }
      else if (p.kind === 'bill') { ctx.setTransform(c, s, -s, c, p.x, p.y); ctx.drawImage(BILL, -p.r, -p.r * .5, p.r * 2, p.r); }
      else { ctx.setTransform(c, s, -s, c, p.x, p.y); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SPARKS[p.hue & 7], -p.r * 2, -p.r / 3, p.r * 4, p.r / 1.5); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  };
}
