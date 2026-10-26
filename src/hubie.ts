// Hubie, the top hat sloth, drawn with Pixi vector shapes so he matches the rooftop scene.
// Local units: feet at y = 0, about 96 units tall with the hat. Parts are separate so they can animate.
import { Container, Graphics } from 'pixi.js';

const FUR = 0x86765f, FUR_D = 0x6c5d4a, BELLY = 0xb19f82, MASK = 0xdcc9a7, PATCH = 0x3a2c22, INK = 0x221a15, CLAW = 0xe6dcc4;
export type Mode = 'idle' | 'walk' | 'air' | 'win' | 'fall';

export class Hubie extends Container {
  legL = new Graphics(); legR = new Graphics(); armL = new Graphics(); armR = new Graphics();
  body = new Graphics(); head = new Container(); eyes = new Graphics(); hat = new Container();
  mode: Mode = 'idle'; phase = 0; private blinkAt = 2; private t0 = performance.now() / 1000;
  constructor() {
    super();
    for (const [g, x] of [[this.legL, -8], [this.legR, 8]] as const) {
      g.roundRect(-5, 0, 10, 14, 4.5).fill(FUR_D);
      for (const dx of [-3, 0, 3]) g.moveTo(dx, 12).lineTo(dx + 0.6, 16).stroke({ width: 1.4, color: CLAW });
      g.position.set(x, -15);
    }
    const b = this.body;
    b.ellipse(0, -32, 19.5, 21).fill(FUR);
    b.ellipse(0, -29, 12, 15).fill(BELLY);
    for (const [x, y] of [[-14, -40], [-16, -30], [14, -38], [15, -27], [-6, -16], [6, -15]]) b.moveTo(x, y).lineTo(x + (x < 0 ? -2 : 2), y + 3).stroke({ width: 1.2, color: FUR_D });
    b.arc(0, -32, 19.5, -1.25, 0.95).stroke({ width: 1.6, color: 0xb5cadb, alpha: 0.35 });
    for (const [g, x, s] of [[this.armL, -15, -1], [this.armR, 15, 1]] as const) {
      g.roundRect(-4.2, -2, 8.4, 29, 4.2).fill(FUR_D);
      for (const dx of [-2.6, 0, 2.6]) g.moveTo(dx, 25).quadraticCurveTo(dx + s * 1.5, 30, dx + s * 3, 32).stroke({ width: 1.5, color: CLAW });
      g.position.set(x, -46); g.rotation = -s * 0.28;
    }
    const h = new Graphics();
    h.circle(0, 0, 16.5).fill(FUR);
    h.arc(0, 0, 16.5, -1.1, 0.7).stroke({ width: 1.5, color: 0xb5cadb, alpha: 0.35 });
    h.ellipse(0, 2.5, 13.5, 10.5).fill(MASK);
    const patch = (x: number, rot: number) => { const p = new Graphics(); p.ellipse(0, 0, 5.4, 3.2).fill(PATCH); p.position.set(x, 1.6); p.rotation = rot; return p; };
    this.eyes.circle(-6, 1.2, 1.9).fill(0x0c0907).circle(6, 1.2, 1.9).fill(0x0c0907).circle(-5.4, 0.6, 0.7).fill(0xffffff).circle(6.6, 0.6, 0.7).fill(0xffffff);
    this.eyes.pivot.set(0, 1.2); this.eyes.y = 1.2;
    const nose = new Graphics(); nose.ellipse(0, 6, 3, 2).fill(INK).moveTo(-3.2, 8.6).quadraticCurveTo(0, 11.2, 3.2, 8.6).stroke({ width: 1.2, color: INK });
    this.head.addChild(h, patch(-6, 0.35), patch(6, -0.35), this.eyes, nose); this.head.position.set(0, -57);
    const hg = new Graphics();
    hg.ellipse(0, 0, 18.5, 3.8).fill(0x131418);
    hg.roundRect(-11, -24, 22, 24, 2).fill(0x1b1d22);
    hg.ellipse(0, -24, 11, 2.6).fill(0x2a2d33);
    hg.rect(-11, -7.5, 22, 4.6).fill(0x02f7fd);
    hg.rect(-11, -3, 22, 1).fill({ color: 0x000000, alpha: 0.4 });
    hg.rect(-8, -21, 2.6, 12).fill({ color: 0xffffff, alpha: 0.1 });
    this.hat.addChild(hg); this.hat.position.set(1, -70); this.hat.rotation = -0.1;
    this.addChild(this.legL, this.legR, this.armL, this.body, this.armR, this.head, this.hat);
  }
  /** Called every frame. */
  tick(now: number) {
    const t = now - this.t0;
    if (this.mode === 'idle') {
      this.body.scale.y = 1 + Math.sin(t * 2.2) * 0.02; this.body.y = -Math.sin(t * 2.2) * 0.6;
      this.head.y = -57 + Math.sin(t * 2.2) * 0.8; this.hat.y = -70 + Math.sin(t * 2.2 - 0.4) * 0.9;
      this.armL.rotation = 0.28 + Math.sin(t * 1.3) * 0.06; this.armR.rotation = -0.28 - Math.sin(t * 1.3 + 1) * 0.06;
      this.legL.rotation = this.legR.rotation = 0; this.head.rotation = Math.sin(t * 0.6) * 0.05;
    } else if (this.mode === 'walk') {
      this.phase += 0.24; const s = Math.sin(this.phase);
      this.legL.rotation = s * 0.55; this.legR.rotation = -s * 0.55; this.armL.rotation = 0.3 - s * 0.45; this.armR.rotation = -0.3 - s * 0.45;
      const bob = Math.abs(Math.cos(this.phase)) * 2.2; this.body.y = -bob; this.head.y = -57 - bob; this.hat.y = -70 - bob; this.head.rotation = s * 0.06;
    } else if (this.mode === 'fall') {
      this.armL.rotation = 2.4 + Math.sin(t * 30) * 0.6; this.armR.rotation = -2.4 - Math.sin(t * 30 + 1) * 0.6;
      this.legL.rotation = Math.sin(t * 25) * 0.5; this.legR.rotation = -Math.sin(t * 25) * 0.5;
    }
    if (t > this.blinkAt) { this.eyes.scale.y = 0.12; if (t > this.blinkAt + 0.12) { this.eyes.scale.y = 1; this.blinkAt = t + 2 + Math.random() * 3; } }
  }
}
