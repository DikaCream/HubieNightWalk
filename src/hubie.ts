// Hubie, the official Housebets mascot: the top hat sloth on his orange hover scooter.
// Built from the official art, cut into three layers (body with scooter, top hat, paper hand) so the
// hat can lift off and the paper hand can wave. Local units: scooter wheels at y = 0, about 96 units tall.
import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import bodyUrl from './art/hubie-body.webp';
import hatUrl from './art/hubie-hat.webp';
import handUrl from './art/hubie-hand.webp';
import meta from './art/hubie-parts.json';

export type Mode = 'idle' | 'walk' | 'air' | 'win' | 'fall';
const K = 96 / meta.H; // art pixels to local units
const px = (x: number) => (x - meta.W / 2) * K, py = (y: number) => (y - meta.H) * K;
let tex: { body: Texture; hat: Texture; hand: Texture } | null = null;
export async function loadHubieArt() {
  if (tex) return;
  const [body, hat, hand] = await Promise.all([Assets.load<Texture>(bodyUrl), Assets.load<Texture>(hatUrl), Assets.load<Texture>(handUrl)]);
  tex = { body, hat, hand };
}
/** Rest position of the hat (its brim centre) in local units. */
export const HAT = { x: px(meta.hat.x + meta.hat.w / 2), y: py(meta.hat.y + meta.hat.h) };
const WRIST = { x: px(meta.wrist[0]), y: py(meta.wrist[1]) };

export class Hubie extends Container {
  rig = new Container(); body = new Container(); hat = new Container(); armR = new Container();
  /** Kept for the scene tweens; the official art has the left hand on the hip, so these are light accents. */
  armL = new Container(); legL = new Container(); legR = new Container();
  glow = new Graphics();
  mode: Mode = 'idle'; phase = 0; private t0 = performance.now() / 1000;
  constructor() {
    super();
    if (!tex) throw new Error('loadHubieArt first');
    const sp = (t: Texture, m: { x: number; y: number; w: number; h: number }, ox: number, oy: number) => {
      const s = new Sprite(t); s.width = m.w * K; s.height = m.h * K; s.position.set(px(m.x) - ox, py(m.y) - oy); return s;
    };
    // hover glow under the scooter
    this.glow.ellipse(0, 0, 40, 6).fill({ color: 0xff9a3c, alpha: 0.18 }).ellipse(0, 0, 26, 3.5).fill({ color: 0xffc070, alpha: 0.28 });
    this.glow.position.set(4, 1);
    this.body.addChild(sp(tex.body, meta.body, 0, 0));
    this.hat.addChild(sp(tex.hat, meta.hat, HAT.x, HAT.y)); this.resetHat();
    this.armR.addChild(sp(tex.hand, meta.hand, WRIST.x, WRIST.y)); this.armR.position.set(WRIST.x, WRIST.y);
    this.rig.addChild(this.body, this.armR, this.hat);
    this.addChild(this.glow, this.rig);
  }
  resetHat() { this.hat.position.set(HAT.x, HAT.y); this.hat.rotation = 0; }
  /** Called every frame. */
  tick(now: number) {
    const t = now - this.t0;
    const hover = this.mode === 'air' || this.mode === 'fall' ? 0 : Math.sin(t * 3.1) * 1.4;
    this.glow.visible = this.mode !== 'fall';
    this.glow.scale.set(1 - hover * 0.04, 1 - hover * 0.06); this.glow.alpha = 0.8 + Math.sin(t * 9) * 0.15;
    if (this.mode === 'idle') {
      this.rig.y = -3 + hover; this.rig.rotation = Math.sin(t * 0.9) * 0.025;
      this.body.scale.y = 1 + Math.sin(t * 2.2) * 0.012; this.body.y = 0;
      this.armR.rotation = Math.sin(t * 1.4) * 0.07;
      this.hat.y = HAT.y + Math.sin(t * 2.2 - 0.5) * 0.5;
    } else if (this.mode === 'walk') {
      this.phase += 0.2; this.rig.y = -3 + Math.sin(this.phase * 2) * 1; this.rig.rotation = 0.06 + Math.sin(this.phase) * 0.02;
      this.armR.rotation = Math.sin(this.phase) * 0.12;
    } else if (this.mode === 'air') {
      this.rig.y = -3; this.rig.rotation *= 0.9; this.glow.alpha = 0.4;
    } else if (this.mode === 'win') {
      this.rig.y = -3 + hover; this.armR.rotation = -0.35 + Math.sin(t * 14) * 0.25;
    } else if (this.mode === 'fall') {
      this.armR.rotation = Math.sin(t * 28) * 0.5; this.rig.rotation = Math.sin(t * 18) * 0.12;
    }
  }
}
