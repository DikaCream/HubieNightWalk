// Hubie in Pixi: layered parts drawn in code (see hubieArt.ts), each rasterised once at 4 pixels per unit and
// hung on its own pivot so the limbs, head, hat and coat tails can move. Local units: feet on y = 0, about
// 137 units tall with the hat. The scene animates the big moves with GSAP; tick() adds the life (breathing,
// blinking, sway, walk cycle) and keeps the face in step with the mode.
import { Container, Sprite, Texture } from 'pixi.js';
import { HAT_REST, PARTS, partSvg, svgUrl, type PartName } from './hubieArt';

export type Mode = 'idle' | 'walk' | 'air' | 'win' | 'fall';
const RES = 4;
let tex: Record<PartName, Texture> | null = null;
async function raster(name: PartName) {
  const p = PARTS[name]; const img = new Image(); img.src = svgUrl(partSvg(p, RES)); await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.drawImage(img, 0, 0);
  return Texture.from(c);
}
export async function loadHubieArt() {
  if (tex) return;
  const names = Object.keys(PARTS) as PartName[]; const all = await Promise.all(names.map(raster));
  tex = Object.fromEntries(names.map((n, i) => [n, all[i]])) as Record<PartName, Texture>;
}
/** Rest position of the hat brim centre, in head units (absolute local units). */
export const HAT = { x: HAT_REST.x, y: HAT_REST.y };
const sprite = (n: PartName, ox = 0, oy = 0) => { const p = PARTS[n]; const s = new Sprite(tex![n]); s.position.set(p.box[0] - ox, p.box[1] - oy); s.width = p.box[2] - p.box[0]; s.height = p.box[3] - p.box[1]; return s; };
/** A part hung on its pivot: rotate the container and the art swings around the joint. */
const node = (n: PartName) => { const c = new Container(); const [px, py] = PARTS[n].pivot; c.position.set(px, py); c.addChild(sprite(n, px, py)); return c; };

type Face = 'sleepy' | 'wide' | 'happy' | 'closed'; type Mouth = 'smile' | 'grin' | 'o';
export class Hubie extends Container {
  rig = new Container(); body!: Container; tails!: Container; tail!: Container; head = new Container(); hat!: Container;
  armR!: Container; armL!: Container; legL!: Container; legR!: Container;
  mode: Mode = 'idle'; phase = 0; private t0 = performance.now() / 1000; private nextBlink = 2; private eyes: Record<Face, Sprite>; private mouths: Record<Mouth, Sprite>;
  /** Set to force an expression (for example during a hat tip), null follows the mode. */
  faceOverride: [Face, Mouth] | null = null;
  constructor() {
    super();
    if (!tex) throw new Error('loadHubieArt first');
    this.tail = node('tail'); this.tails = node('tails'); this.armL = node('armB'); this.legL = node('legL'); this.legR = node('legR');
    this.body = node('torso'); this.armR = node('armF');
    const [hx, hy] = PARTS.head.pivot; this.head.position.set(hx, hy);
    const art = new Container(); art.position.set(-hx, -hy); this.head.addChild(art);
    art.addChild(sprite('head'));
    this.eyes = { sleepy: sprite('eyesSleepy'), wide: sprite('eyesWide'), happy: sprite('eyesHappy'), closed: sprite('eyesClosed') };
    this.mouths = { smile: sprite('mouthSmile'), grin: sprite('mouthGrin'), o: sprite('mouthO') };
    art.addChild(...Object.values(this.eyes), ...Object.values(this.mouths));
    this.hat = node('hat'); art.addChild(this.hat); this.resetHat();
    this.rig.addChild(this.tail, this.tails, this.armL, this.legL, this.legR, this.body, this.head, this.armR);
    this.addChild(this.rig); this.setFace('sleepy', 'smile');
  }
  setFace(e: Face, m: Mouth) { for (const k in this.eyes) this.eyes[k as Face].visible = k === e; for (const k in this.mouths) this.mouths[k as Mouth].visible = k === m; }
  resetHat() { this.hat.position.set(HAT.x, HAT.y); this.hat.rotation = HAT_REST.rot; this.hat.alpha = 1; }
  /** Puts every limb back to rest (used when a round resets mid tween). */
  restPose() { for (const c of [this.armL, this.armR, this.legL, this.legR, this.head, this.tails, this.tail, this.rig]) c.rotation = 0; this.legL.y = this.legR.y = PARTS.legL.pivot[1]; this.rig.scale.set(1); this.rig.y = 0; this.faceOverride = null; }
  /** Called every frame. */
  tick(now: number) {
    const t = now - this.t0; const m = this.mode;
    // expression
    if (this.faceOverride) this.setFace(...this.faceOverride);
    else if (m === 'fall') this.setFace('wide', 'o');
    else if (m === 'win') this.setFace('happy', 'grin');
    else { const blink = t > this.nextBlink; if (t > this.nextBlink + 0.13) this.nextBlink = t + 2.5 + Math.random() * 3; this.setFace(blink ? 'closed' : 'sleepy', 'smile'); }
    const LY = PARTS.legL.pivot[1];
    this.tail.rotation = Math.sin(t * 2.1) * 0.25;
    if (m === 'idle') {
      this.rig.y = 0; this.body.scale.y = 1 + Math.sin(t * 2.2) * 0.018; this.body.scale.x = 1 - Math.sin(t * 2.2) * 0.008;
      this.head.rotation = Math.sin(t * 0.7) * 0.05; this.head.y = PARTS.head.pivot[1] - Math.sin(t * 2.2) * 0.5;
      this.armR.rotation = Math.sin(t * 1.3) * 0.05; this.armL.rotation = -Math.sin(t * 1.3 + 1) * 0.05;
      this.legL.rotation = this.legR.rotation = 0; this.legL.y = this.legR.y = LY; this.tails.rotation = Math.sin(t * 1.1) * 0.03;
    } else if (m === 'walk') {
      this.phase += 0.24; const s = Math.sin(this.phase);
      this.rig.y = -Math.abs(Math.cos(this.phase)) * 2; this.rig.rotation = s * 0.04;
      this.legL.y = LY - Math.max(0, s) * 4; this.legR.y = LY - Math.max(0, -s) * 4; this.legL.rotation = s * 0.12; this.legR.rotation = s * 0.12;
      this.armR.rotation = s * 0.35; this.armL.rotation = s * 0.35; this.head.rotation = -s * 0.04; this.tails.rotation = -s * 0.08; this.body.scale.set(1);
    } else if (m === 'air') {
      this.legL.y = this.legR.y = LY - 3; this.legL.rotation = 0.15; this.legR.rotation = -0.15;
      this.armR.rotation += (-0.9 - this.armR.rotation) * 0.2; this.armL.rotation += (0.9 - this.armL.rotation) * 0.2; this.tails.rotation += (0.12 - this.tails.rotation) * 0.2;
    } else if (m === 'fall') {
      this.armR.rotation = -2.3 + Math.sin(t * 26) * 0.5; this.armL.rotation = 2.2 + Math.sin(t * 23 + 1) * 0.5;
      this.legL.y = LY - 2 + Math.sin(t * 20) * 2; this.legR.y = LY - 2 - Math.sin(t * 20) * 2; this.tails.rotation = Math.sin(t * 18) * 0.2;
    } else if (m === 'win') {
      this.legL.y = this.legR.y = LY; this.tails.rotation = Math.sin(t * 6) * 0.06;
    }
  }
}
