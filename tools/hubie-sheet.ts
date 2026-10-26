// Renders the drawn Hubie into review sheets (turnaround of poses, side by side with references) and the icons.
// Run: npx tsx tools/hubie-sheet.ts
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fullSvg, type Pose } from '../src/hubieArt.ts';

const poses: [string, Pose][] = [
  ['idle', {}], ['blink', { face: 'closed' }], ['walk', { legLy: -3, legL: 0.15, armF: 0.3, armB: 0.3, head: 0.03 }],
  ['hop up', { armF: -0.7, armB: 0.7, legLy: -3, legRy: -3, sy: 1.08, sx: 0.93 }],
  ['hat tip', { face: 'happy', mouth: 'grin', armF: -2.75, hat: { x: 14, y: -12, rot: 0.35 }, head: -0.05 }],
  ['big win', { face: 'happy', mouth: 'grin', armF: -2.6, armB: 2.6 }],
  ['fall', { face: 'wide', mouth: 'o', armF: -2.2, armB: 2.0, hat: { x: 18, y: -40, rot: 1.2 }, body: 0.3 }],
];
const cell = (s: string, label: string) => `<div class="c"><div class="i">${s}</div><p>${label}</p></div>`;
const b64 = (p: string) => 'data:image/jpeg;base64,' + readFileSync(p).toString('base64');
const R = '/workspace/refs/hubie/best/';
const css = `body{margin:0;font:600 18px Arial;color:#ddd} .row{display:flex;gap:10px;padding:14px;flex-wrap:wrap} .c{text-align:center} .c p{margin:4px} .i svg,.i img{display:block}`;
const sheet = `<style>${css} body{background:#3b4250}</style><div class="row">${poses.map(([n, p]) => cell(fullSvg(p, undefined, 260), n)).join('')}</div>
<div class="row" style="background:#0d1217">${cell(fullSvg({}, undefined, 260), 'on the night scene')}${cell(fullSvg({}, [-34, -140, 34, -48], 260), 'bust (badge)')}${cell(fullSvg({}, [-30, -116, 30, -56], 160), 'head icon')}</div>`;
const cmp = `<style>${css} body{background:#2a2f38}</style><div class="row">${cell(`<img src="${b64(R + 'x-hubie-avatar.jpg')}" height="420">`, 'official avatar (reference)')}${cell(fullSvg({}, [-34, -140, 34, -48], 420 * 68 / 92), 'drawn bust')}
${cell(`<img src="${b64(R + 'x-hubie-post-HVaMvNmWoAEDzFs.jpg')}" height="420">`, 'official full body (reference)')}${cell(fullSvg({}, undefined, 420 * 96 / 148), 'drawn in code')}</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1980, height: 900 } });
await p.setContent(sheet); await p.screenshot({ path: 'shots/hubie-sheet.png', fullPage: true });
await p.setViewportSize({ width: 1500, height: 520 }); await p.setContent(cmp); await p.screenshot({ path: 'shots/r4-hubie-vs-reference.png', fullPage: true });
for (const [name, size] of [['favicon.png', 64], ['apple-touch-icon.png', 180]] as const) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<body style="margin:0;background:transparent">${fullSvg({}, [-31, -140, 31, -78 + 0], size)}</body>`);
  await p.screenshot({ path: 'public/' + name, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await b.close();
