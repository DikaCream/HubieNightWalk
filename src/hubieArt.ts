// Hubie drawn in code: every body part is an SVG string in local units (feet on y = 0, about 137 units tall
// with the hat). Nothing here is traced from a picture; the parts follow the official look only for identity:
// a three toed sloth with a cream face mask and dark eye bands, a top hat with an H buckle, a navy tailcoat,
// an orange waistcoat and an orange bow tie. The same strings feed the Pixi textures, the badge and the sheets.

export type Box = [number, number, number, number]; // x0, y0, x1, y1
export interface Part { box: Box; pivot: [number, number]; svg: string }

const OL = '#2a160b', COAT_OL = '#07080f', CYAN = '#00E5FF';
const FUR = '#8B5A35', FUR_HI = '#b07a4c', FUR_LO = '#5f3a20';
const NAVY = '#1F2438', NAVY_HI = '#33395a', NAVY_LO = '#11131f', ORANGE = '#F07F1E', ORANGE_D = '#c95f0e', GOLD = '#f2b73a';
const f = (n: number) => +n.toFixed(2);

/** Closed outline of an ellipse with pointed fur tufts; depth(a) sets tuft size by angle. */
function tufts(cx: number, cy: number, rx: number, ry: number, n: number, depth: (a: number) => number, sweep = 0.35) {
  const P = (a: number, k: number) => `${f(cx + Math.cos(a) * rx * k)},${f(cy + Math.sin(a) * ry * k)}`;
  const da = (Math.PI * 2) / n; let d = `M${P(0, 1)}`;
  for (let i = 0; i < n; i++) {
    const a = i * da, dp = depth(a + da / 2);
    d += ` Q${P(a + da * (0.15 + sweep * 0.3), 1 + dp * 0.7)} ${P(a + da * (0.5 + sweep * 0.25), 1 + dp)}`;
    d += ` Q${P(a + da * 0.8, 1 + dp * 0.25)} ${P(a + da, 1)}`;
  }
  return d + 'Z';
}
const lin = (id: string, x1: number, y1: number, x2: number, y2: number, stops: [number, string, number?][]) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
const rad = (id: string, cx: number, cy: number, r: number, stops: [number, string, number?][]) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
const H_GLYPH = (x: number, y: number, s: number, col: string) =>
  `<path d="M${x - s * 0.5},${y - s * 0.55}v${s * 1.1}M${x + s * 0.5},${y - s * 0.55}v${s * 1.1}M${x - s * 0.5},${y}h${s}" stroke="${col}" stroke-width="${f(s * 0.32)}" stroke-linecap="square" fill="none"/>`;

// ---------------- head ----------------
const HC = { x: 0, y: -83, rx: 27, ry: 23.5 };
const headOutline = tufts(HC.x, HC.y, HC.rx, HC.ry, 26, a => 0.04 + 0.1 * Math.abs(Math.cos(a)) * (Math.sin(a) > -0.3 ? 1 : 0.5));
const band = 'M-3.6,-84.6 C-5.6,-89.4 -12,-90.6 -17,-89 C-21.5,-87.6 -25.5,-84 -27.6,-78.6 C-24.6,-77.6 -20.4,-79 -16.4,-80.2 C-11,-81.2 -6.4,-79.8 -3.8,-81.6 C-2.6,-82.4 -2.6,-83.8 -3.6,-84.6Z';
/** Cyan rim light from the billboard: the outline stroked thick, clipped to the shape and to its right side. */
const rimLight = (id: string, d: string, x0: number, w = 3.2, op = 0.9) => `<clipPath id="${id}s"><path d="${d}"/></clipPath><clipPath id="${id}r"><rect x="${x0}" y="-200" width="100" height="300"/></clipPath><g clip-path="url(#${id}r)"><path d="${d}" clip-path="url(#${id}s)" stroke="${CYAN}" stroke-width="${w}" fill="none" opacity="${op}"/></g>`;
const head: Part = {
  box: [-34, -112, 34, -54], pivot: [0, -61],
  svg: `<defs>${rad('hF', -7, -95, 34, [[0, FUR_HI], [0.55, FUR], [1, FUR_LO]])}${rad('hM', -4, -86, 26, [[0, '#f6d6a8'], [0.6, '#E6B688'], [1, '#c99566']])}
${lin('hB', -3, -84, -27, -82, [[0, '#3f2618'], [1, '#6E442B']])}${rad('hN', -1.5, -81, 6, [[0, '#4a2c1a'], [1, '#160b05']])}</defs>
<path d="${headOutline}" fill="url(#hF)" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="${tufts(0, -79, 24.5, 19.5, 22, a => 0.05 + 0.06 * Math.abs(Math.cos(a)), 0.5)}" fill="#c48d5c" opacity="0.75"/>
<path d="M-23,-81 C-24,-93 -10,-96.5 0,-90.5 C10,-96.5 24,-93 23,-81 C23,-68 13,-60.5 0,-60.5 C-13,-60.5 -23,-68 -23,-81Z" fill="url(#hM)"/>
<path d="M-8,-97 q2,-4 5,-5 M-2,-99 q1,-4 3,-5 M5,-98 q2,-3 5,-3 M-15,-95 q1,-3 4,-5 M12,-95 q2,-3 5,-3" stroke="${FUR_LO}" stroke-width="0.9" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="${band}" fill="url(#hB)"/><path d="${band}" fill="url(#hB)" transform="scale(-1,1)"/>
<path d="M-4.6,-79.6 C-4.6,-83 4.6,-83 4.6,-79.6 C4.6,-76.6 1.6,-75.2 0,-75.2 C-1.6,-75.2 -4.6,-76.6 -4.6,-79.6Z" fill="url(#hN)" stroke="${OL}" stroke-width="0.6"/>
<ellipse cx="-1.4" cy="-81" rx="1.6" ry="0.7" fill="#fff" opacity="0.55"/>
<path d="M0,-75.2 v1.6" stroke="${OL}" stroke-width="0.8" stroke-linecap="round"/>
<ellipse cx="-14" cy="-72" rx="4" ry="2.2" fill="#e09a74" opacity="0.28"/><ellipse cx="14" cy="-72" rx="4" ry="2.2" fill="#e09a74" opacity="0.28"/>
${rimLight('hR', headOutline, 14, 2.4, 0.75)}
<path d="M-17,-100 q3,-2.5 7,-3" stroke="#fff" stroke-width="1" opacity="0.35" fill="none" stroke-linecap="round"/>`,
};

// eyes: centred on (±11, -84), each tilted so the outer corner droops a little (the sleepy smug look)
const EYE = 11, EY = -84.6;
function eyes(kind: 'sleepy' | 'wide' | 'happy' | 'closed') {
  const one = (s: number) => {
    const t = `transform="translate(${s * EYE},${EY}) rotate(${s * 9}) scale(${s},1)"`;
    if (kind === 'sleepy') return `<g ${t}><ellipse cx="0" cy="0.4" rx="3.9" ry="2.5" fill="#f4e6cf"/><circle cx="-0.6" cy="0.9" r="2.3" fill="#5c3416"/><circle cx="-0.6" cy="0.9" r="1.2" fill="#120804"/><circle cx="0.4" cy="0.1" r="0.6" fill="#fff"/>
<path d="M-4.6,1 C-3,-0.9 3,-0.9 4.6,0.8 L4.6,-4 L-4.6,-4Z" fill="#4c2f1f"/><path d="M-4.4,1.1 C-2.6,-0.4 2.6,-0.4 4.4,0.8" stroke="#160b05" stroke-width="1.1" fill="none" stroke-linecap="round"/>
<path d="M-4,3 C-2,3.8 2,3.8 3.8,2.8" stroke="#2c1a10" stroke-width="0.5" fill="none" opacity="0.6"/></g>`;
    if (kind === 'wide') return `<g ${t}><ellipse cx="0" cy="-0.2" rx="3.9" ry="4.4" fill="#fbf3e4" stroke="#160b05" stroke-width="0.9"/><circle cx="0" cy="0.2" r="1.7" fill="#120804"/><circle cx="0.7" cy="-0.6" r="0.6" fill="#fff"/>
<path d="M-4.5,-6.6 Q0,-9 4.6,-6.2" stroke="#2a160b" stroke-width="1.1" fill="none" stroke-linecap="round"/></g>`;
    if (kind === 'happy') return `<g ${t}><path d="M-4,1.2 Q0,-3.6 4,1.2" stroke="#160b05" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>`;
    return `<g ${t}><path d="M-4.2,0.4 Q0,2 4.2,0.2" stroke="#160b05" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>`;
  };
  return { box: [-20, -95, 20, -74] as Box, pivot: [0, -61] as [number, number], svg: one(-1) + one(1) };
}
function mouth(kind: 'smile' | 'grin' | 'o') {
  const svg = kind === 'smile'
    ? `<path d="M-8.5,-72.6 C-5,-68.2 5,-68.2 8.5,-72.6" stroke="#1e0f07" stroke-width="1.25" fill="none" stroke-linecap="round"/><path d="M-9.2,-73.6 l0.9,1.2 M9.2,-73.6 l-0.9,1.2" stroke="#1e0f07" stroke-width="0.9" stroke-linecap="round"/>`
    : kind === 'grin'
      ? `<path d="M-9,-73.4 Q0,-71.6 9,-73.4 Q6.5,-65 0,-64.6 Q-6.5,-65 -9,-73.4Z" fill="#3b1810" stroke="#1e0f07" stroke-width="1"/><path d="M-5.5,-72.2 Q0,-71.4 5.5,-72.2 L5,-70.8 Q0,-70.2 -5,-70.8Z" fill="#fff6e6"/><ellipse cx="0" cy="-66.8" rx="3.4" ry="1.6" fill="#d8706a"/>`
      : `<ellipse cx="0" cy="-69.8" rx="2.7" ry="3.3" fill="#3b1810" stroke="#1e0f07" stroke-width="0.9"/>`;
  return { box: [-12, -77, 12, -62] as Box, pivot: [0, -61] as [number, number], svg };
}

// ---------------- hat ----------------
const hat: Part = {
  box: [-27, -140, 27, -99], pivot: [0, -104],
  svg: `<defs>${lin('tC', -15, 0, 15, 0, [[0, '#1C2235'], [0.35, '#262d46'], [0.7, '#111016'], [1, '#0a0a0f']])}${lin('tB', 0, -110, 0, -100, [[0, '#262c45'], [1, '#0b0c13']])}
${lin('tO', 0, -113, 0, -107, [[0, '#ff9a3c'], [1, '#d8650f']])}${lin('tG', 0, -115, 0, -105, [[0, '#ffd877'], [1, '#d99418']])}</defs>
<path d="M-14,-107.5 L-16.2,-133.5 C-16.2,-137.6 16.2,-137.6 16.2,-133.5 L14,-107.5Z" fill="url(#tC)" stroke="${COAT_OL}" stroke-width="1.5" stroke-linejoin="round"/>
<ellipse cx="0" cy="-134" rx="15.4" ry="2.6" fill="#2a3150" stroke="${COAT_OL}" stroke-width="0.8"/>
<path d="M-11,-131 L-10,-112" stroke="#5a6488" stroke-width="2" opacity="0.45" stroke-linecap="round"/>
<path d="M-8.5,-132 L-8,-126" stroke="#fff" stroke-width="0.9" opacity="0.5" stroke-linecap="round"/>
<path d="M-14.6,-113.2 L14.6,-113.2 L14.2,-107.6 L-14.2,-107.6Z" fill="url(#tO)" stroke="${COAT_OL}" stroke-width="0.8"/>
<rect x="-5.2" y="-115.6" width="10.4" height="9.8" rx="1.3" fill="url(#tG)" stroke="#5a3a08" stroke-width="0.9"/>
<rect x="-3.4" y="-113.8" width="6.8" height="6.2" rx="0.6" fill="none" stroke="#a86d10" stroke-width="0.6"/>
${H_GLYPH(0, -110.7, 3.8, '#1c1410')}
<path d="M-25,-104.6 C-25.5,-109.5 -20,-108.8 -14,-108 C-5,-107 5,-107 14,-108 C20,-108.8 25.5,-109.5 25,-104.6 C23,-100.6 12,-100.4 0,-100.4 C-12,-100.4 -23,-100.6 -25,-104.6Z" fill="url(#tB)" stroke="${COAT_OL}" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M-21,-103.6 C-12,-102 12,-102 21,-103.6" stroke="#4a5378" stroke-width="0.8" fill="none" opacity="0.7"/>
<path d="M15.6,-133 L13.6,-108.5 M24.6,-104.6 C23,-101.6 18,-101 12,-100.8" stroke="${CYAN}" stroke-width="1.3" fill="none" opacity="0.9" stroke-linecap="round"/>`,
};

// ---------------- torso: pear body, shirt, orange waistcoat, open navy tailcoat, bow tie ----------------
const coatL = 'M-19.5,-61.5 C-30,-58.5 -34.5,-41 -32.5,-24 C-31.5,-16 -27.5,-12.5 -24,-12.5 L-21.5,-24.5 C-24,-35 -22,-47 -14.5,-58.5Z';
const lapelL = 'M-14.5,-58.5 L-19,-61 L-21,-52 L-16.5,-47.5 L-19.5,-42 L-15,-37Z';
const torso: Part = {
  box: [-37, -66, 37, -5], pivot: [0, -12],
  svg: `<defs>${rad('bF', -6, -40, 34, [[0, FUR_HI], [0.6, FUR], [1, FUR_LO]])}${lin('bV', -18, -60, 14, -20, [[0, '#ffa04a'], [0.5, ORANGE], [1, ORANGE_D]])}
${lin('bC', -34, 0, -16, 0, [[0, NAVY_LO], [0.6, NAVY], [1, NAVY_HI]])}${lin('bC2', 34, 0, 16, 0, [[0, '#2a3552'], [0.4, NAVY], [1, NAVY_HI]])}${lin('bT', 0, -62, 0, -50, [[0, '#ffa64e'], [1, ORANGE_D]])}</defs>
<path d="M-19.5,-61 C-30.5,-56 -32.5,-36 -30.5,-23 C-28.5,-11 -16,-7.5 0,-7.5 C16,-7.5 28.5,-11 30.5,-23 C32.5,-36 30.5,-56 19.5,-61Z" fill="url(#bF)" stroke="${OL}" stroke-width="1.6"/>
<path d="M-14,-16 q-1,3 1,6 M-6,-14 q-1,3 0.5,5.5 M3,-14 q0,3 1.5,5 M11,-15 q0,3 2,5.5" stroke="${FUR_LO}" stroke-width="0.9" fill="none" stroke-linecap="round"/>
<path d="M-10,-61 L10,-61 L0,-41Z" fill="#f6f1e6" stroke="${OL}" stroke-width="0.8"/>
<path d="M-15,-58.5 L-9.4,-60.2 L0,-41.5 L9.4,-60.2 L15,-58.5 C22,-47 24,-35 21.5,-24 L12,-18 L0,-22.5 L-12,-18 L-21.5,-24 C-24,-35 -22,-47 -15,-58.5Z" fill="url(#bV)" stroke="${OL}" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M-9.4,-60.2 L0,-41.5 L9.4,-60.2" stroke="#9c4a08" stroke-width="0.9" fill="none"/>
<path d="M-18,-44 L-11,-44.6 M11,-44.6 L18,-44" stroke="#9c4a08" stroke-width="0.9" stroke-linecap="round"/>
${[-36.5, -30.5, -24.8].map(y => `<circle cx="0" cy="${y}" r="1.45" fill="${GOLD}" stroke="#5a3408" stroke-width="0.6"/><circle cx="-0.4" cy="${y - 0.4}" r="0.45" fill="#fff6c8"/>`).join('')}
<circle cx="0" cy="-55" r="0.7" fill="#23202a"/><circle cx="0" cy="-50" r="0.7" fill="#23202a"/>
<path d="${coatL}" fill="url(#bC)" stroke="${COAT_OL}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="${coatL}" fill="url(#bC2)" stroke="${COAT_OL}" stroke-width="1.4" stroke-linejoin="round" transform="scale(-1,1)"/>
<path d="${lapelL}" fill="#171b2c" stroke="${COAT_OL}" stroke-width="0.9"/><path d="${lapelL}" fill="#232a44" stroke="${COAT_OL}" stroke-width="0.9" transform="scale(-1,1)"/>
<path d="M-14.8,-57.5 L-15.6,-37.6 M14.8,-57.5 L15.6,-37.6" stroke="${ORANGE}" stroke-width="0.9" opacity="0.9"/>
<path d="M-21.9,-26 L-23.8,-13.4 M21.9,-26 L23.8,-13.4" stroke="${ORANGE}" stroke-width="0.8" opacity="0.8"/>
<g transform="translate(-26.5,-45) rotate(-8)"><rect x="-2.6" y="-2.6" width="5.2" height="5.2" rx="0.8" fill="${GOLD}" stroke="#4a2c06" stroke-width="0.5"/>${H_GLYPH(0, 0, 2.4, '#1c1410')}</g>
<path d="M-31,-48 C-30,-38 -30,-30 -29,-22" stroke="#5a6488" stroke-width="1.2" fill="none" opacity="0.5" stroke-linecap="round"/>
<path d="M20,-60.5 C30.5,-56.5 34.4,-41 32.4,-24 C31.6,-17 28.5,-13.4 25,-12.8" stroke="${CYAN}" stroke-width="1.5" fill="none" opacity="0.9" stroke-linecap="round"/>
<path d="M-1.6,-55.4 L-9.6,-60.2 C-12,-57.6 -12,-52.6 -9.6,-50 Z M1.6,-55.4 L9.6,-60.2 C12,-57.6 12,-52.6 9.6,-50Z" fill="url(#bT)" stroke="${OL}" stroke-width="1" stroke-linejoin="round"/>
<path d="M-8.4,-57.6 L-4,-55.6 M8.4,-57.6 L4,-55.6" stroke="#a54d07" stroke-width="0.6"/>
<rect x="-2.3" y="-57.8" width="4.6" height="4.8" rx="1.3" fill="#e2700f" stroke="${OL}" stroke-width="0.9"/>`,
};

// coat tails behind the body, with the collar turned up against the rain
const tailsPart: Part = {
  box: [-38, -76, 38, -1], pivot: [0, -40],
  svg: `<defs>${lin('cT', -36, 0, 36, 0, [[0, NAVY_LO], [0.5, NAVY], [1, '#2b3450']])}</defs>
<path d="M-27,-42 C-34,-30 -37.5,-15 -34,-3.5 L-23,-8.5 C-22,-20 -20,-30 -18,-42Z" fill="url(#cT)" stroke="${COAT_OL}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M27,-42 C34,-30 37.5,-15 34,-3.5 L23,-8.5 C22,-20 20,-30 18,-42Z" fill="url(#cT)" stroke="${COAT_OL}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M-33.6,-4.5 L-23.6,-9 M33.6,-4.5 L23.6,-9" stroke="${ORANGE}" stroke-width="1" opacity="0.85"/>
<path d="M35.6,-16 C36.4,-11 35.6,-6 34,-3.6" stroke="${CYAN}" stroke-width="1.3" fill="none" opacity="0.85" stroke-linecap="round"/>
<path d="M-12,-61 L-27,-72.5 L-25.5,-58Z" fill="${NAVY}" stroke="${COAT_OL}" stroke-width="1.3" stroke-linejoin="round"/><path d="M-14,-61 L-25,-69.5 L-24,-60Z" fill="${ORANGE}" opacity="0.85"/>
<path d="M12,-61 L27,-72.5 L25.5,-58Z" fill="#283050" stroke="${COAT_OL}" stroke-width="1.3" stroke-linejoin="round"/><path d="M14,-61 L25,-69.5 L24,-60Z" fill="${ORANGE}" opacity="0.85"/>
<path d="M27,-72.5 L25.5,-58" stroke="${CYAN}" stroke-width="1.1" opacity="0.85"/>`,
};

// ---------------- arms: navy sleeve, orange cuff, furry paw with three long hooked claws ----------------
function arm(side: 1 | -1, rim: boolean): Part {
  const claw = (x: number, y: number, r: number) => `<path transform="translate(${x},${y}) rotate(${r})" d="M-1.1,0 C-1.6,4.2 -0.6,7.4 -3.6,9.8 C0.4,8.4 1.6,4.4 1.2,0Z" fill="#efe2c8" stroke="${OL}" stroke-width="0.7" stroke-linejoin="round"/>`;
  const svg = `<defs>${lin('aS' + side, 20, 0, 34, 0, [[0, NAVY_LO], [0.55, NAVY], [1, NAVY_HI]])}${rad('aP' + side, 29, -29, 7, [[0, FUR_HI], [1, FUR_LO]])}</defs>
<path d="M18.5,-58.5 C27,-61 31.5,-55.5 32.5,-48 L34.6,-33 C34.6,-29.8 26,-29.2 24.8,-32 L20.5,-48Z" fill="url(#aS${side})" stroke="${COAT_OL}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M22,-50 C23,-45 24.5,-40 25.5,-36" stroke="#4a5378" stroke-width="1" fill="none" opacity="0.6" stroke-linecap="round"/>
${claw(26.4, -25.6, 18)}${claw(29.6, -24.4, 8)}${claw(32.6, -25.2, -4)}
<path d="${tufts(29.8, -27.6, 5.4, 4.6, 9, () => 0.12)}" fill="url(#aP${side})" stroke="${OL}" stroke-width="1.1"/>
<path d="M24.4,-34.6 L34.6,-36.6 L35,-31.6 C33.4,-29.4 26.6,-28.8 25,-31.4Z" fill="${ORANGE}" stroke="${COAT_OL}" stroke-width="1"/>
<circle cx="29.6" cy="-32.6" r="0.8" fill="${GOLD}"/>
${rim ? `<path d="M27,-60 C31.5,-56 32.6,-50 33,-47 L35,-33.5 M35.2,-31 C35.2,-27 33,-24 31.5,-23" stroke="${CYAN}" stroke-width="1.3" fill="none" opacity="0.9" stroke-linecap="round"/>` : ''}`;
  return { box: [16, -63, 40, -12], pivot: [23, -55], svg: side === 1 ? svg : `<g transform="scale(-1,1)">${svg}</g>` };
}
const mirrorBox = (b: Box): Box => [-b[2], b[1], -b[0], b[3]];
const armF = arm(1, true), armB0 = arm(-1, false);
const armB: Part = { ...armB0, box: mirrorBox(armB0.box), pivot: [-23, -55] };

// ---------------- legs and feet ----------------
function leg(side: 1 | -1, rim: boolean): Part {
  const claw = (x: number) => `<path d="M${x - 1.3},-1.4 C${x - 1.1},0.2 ${x - 0.2},1.6 ${x + 1},2.1 C${x + 1.2},0.8 ${x + 1.3},-0.4 ${x + 1.1},-1.4Z" fill="#efe2c8" stroke="${OL}" stroke-width="0.6"/>`;
  const svg = `<defs>${lin('lF' + side, 4, 0, 19, 0, [[0, FUR_LO], [0.5, FUR], [1, FUR_HI]])}</defs>
<path d="M4,-21 L18,-21 C19.5,-13 18.6,-8 17.4,-4.5 L5,-4.5 C3.8,-9 3,-15 4,-21Z" fill="url(#lF${side})" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
${claw(7.6)}${claw(11.6)}${claw(15.6)}
<path d="${tufts(11.8, -4, 8.8, 3.8, 10, a => (Math.sin(a) < 0 ? 0.12 : 0.03))}" fill="url(#lF${side})" stroke="${OL}" stroke-width="1.3"/>
<path d="M7,-6 q1,-2 3,-2.4 M13,-6.4 q1.5,-1.6 3,-1.6" stroke="${FUR_LO}" stroke-width="0.7" fill="none" stroke-linecap="round"/>
${rim ? `<path d="M18.6,-18 C19.4,-12 18.6,-8 17.6,-5.8 M20,-5 C20.6,-3.6 20,-2 18.6,-1.4" stroke="${CYAN}" stroke-width="1.2" fill="none" opacity="0.85" stroke-linecap="round"/>` : ''}`;
  return { box: [1, -24, 23, 4], pivot: [11, -19], svg: side === 1 ? svg : `<g transform="scale(-1,1)">${svg}</g>` };
}
const legR = leg(1, true), legL0 = leg(-1, false);
const legL: Part = { ...legL0, box: mirrorBox(legL0.box), pivot: [-11, -19] };

const tail: Part = {
  box: [-44, -20, -27, -2], pivot: [-31, -10],
  svg: `<defs>${rad('tl', -37, -13, 7, [[0, FUR_HI], [1, FUR_LO]])}</defs><path d="${tufts(-36, -10.5, 5.6, 4.6, 9, () => 0.16)}" fill="url(#tl)" stroke="${OL}" stroke-width="1.3"/>`,
};

export const PARTS = {
  tail, tails: tailsPart, armB, legL, legR, torso, head, hat, armF,
  eyesSleepy: eyes('sleepy'), eyesWide: eyes('wide'), eyesHappy: eyes('happy'), eyesClosed: eyes('closed'),
  mouthSmile: mouth('smile'), mouthGrin: mouth('grin'), mouthO: mouth('o'),
};
export type PartName = keyof typeof PARTS;
export const HAT_REST = { x: 0, y: -104, rot: -0.1 };

/** One part as a standalone SVG document, `res` pixels per unit. */
export function partSvg(p: Part, res: number) {
  const [x0, y0, x1, y1] = p.box; const w = x1 - x0, h = y1 - y0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${Math.ceil(w * res)}" height="${Math.ceil(h * res)}">${p.svg}</svg>`;
}

export interface Pose {
  face?: 'sleepy' | 'wide' | 'happy' | 'closed'; mouth?: 'smile' | 'grin' | 'o';
  armF?: number; armB?: number; head?: number; legL?: number; legR?: number; legLy?: number; legRy?: number; tails?: number; tail?: number;
  hat?: { x?: number; y?: number; rot?: number } | null; body?: number; sx?: number; sy?: number;
}
/** Whole character as one SVG group in a pose (rotations in radians), for sheets, badges and the favicon. */
export function composeSvg(pose: Pose = {}) {
  const deg = (r = 0) => (r * 180) / Math.PI;
  const g = (p: Part, rot = 0, dx = 0, dy = 0, inner = p.svg) => `<g transform="translate(${p.pivot[0] + dx},${p.pivot[1] + dy}) rotate(${deg(rot)}) translate(${-p.pivot[0]},${-p.pivot[1]})">${inner}</g>`;
  const E = { sleepy: PARTS.eyesSleepy, wide: PARTS.eyesWide, happy: PARTS.eyesHappy, closed: PARTS.eyesClosed }[pose.face ?? 'sleepy'];
  const M = { smile: PARTS.mouthSmile, grin: PARTS.mouthGrin, o: PARTS.mouthO }[pose.mouth ?? 'smile'];
  const h = pose.hat === null ? '' : g(hat, pose.hat?.rot ?? HAT_REST.rot, pose.hat?.x ?? 0, pose.hat?.y ?? 0);
  const headG = g(head, pose.head, 0, 0, head.svg + E.svg + M.svg + h);
  return `<g transform="rotate(${deg(pose.body)}) scale(${pose.sx ?? 1},${pose.sy ?? 1})">${g(tail, pose.tail)}${g(tailsPart, pose.tails)}${g(armB, pose.armB)}${g(legL, pose.legL, 0, pose.legLy)}${g(legR, pose.legR, 0, pose.legRy)}${g(torso)}${headG}${g(armF, pose.armF)}</g>`;
}
export function fullSvg(pose: Pose = {}, view: Box = [-48, -142, 48, 6], px = 300) {
  const [x0, y0, x1, y1] = view; const w = x1 - x0, h = y1 - y0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${px}" height="${Math.round((px * h) / w)}">${composeSvg(pose)}</svg>`;
}
export const svgUrl = (s: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
