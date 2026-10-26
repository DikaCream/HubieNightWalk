// Playwright playtest. Run with the preview server on :4190:  npx tsx scripts/playtest.mjs <width> <height> <tag>
// Uses ?debugseed so the test knows every trap in advance and can choose safe tiles or traps on purpose.
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { LEVELS, buildLayout, floatsNeeded, payoutCents } from '../src/engine.ts';

const [W, H, TAG] = [+process.argv[2], +process.argv[3], process.argv[4]];
const mobile = W < 600; const SHOT = `/workspace/hubie-night-walk/shots/${TAG}-`;
const SEED = 'playtest-' + TAG, CLIENT = 'playtest';
const bad = [], log = [], errs = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
function layoutFor(level, seed, client, nonce) {
  const lv = LEVELS[level]; const fl = [];
  for (let b = 0; fl.length < floatsNeeded(lv); b++) { const h = createHmac('sha256', seed).update(`${client}:${nonce}:${b}`).digest(); for (let i = 0; i < 32; i += 4) fl.push(h.readUInt32BE(i) / 2 ** 32); }
  return buildLayout(lv, fl);
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
async function open(query, intro = false) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(([c, i]) => { localStorage.setItem('hnw-client', c); if (!i) localStorage.setItem('hnw-intro', '2'); }, [CLIENT, intro]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(TAG + ' pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(TAG + ' console ' + m.text()); if (/audio|AudioContext/i.test(m.text()) && m.type() === 'warning') errs.push(TAG + ' audio warning ' + m.text()); });
  await p.goto('http://127.0.0.1:4190/' + query); await p.waitForSelector('.panel'); await wait(1200);
  return p;
}
const st = p => p.evaluate(() => window.__hnw());
const audio = p => p.evaluate(() => window.__hnwAudio());
/** Crops a box around Hubie, scaled up, so his look can be compared with the official art. */
async function hubieCrop(p, name) { const r = await p.evaluate(() => window.__hubieRect()); if (!r) return bad.push(TAG + ' no hubie rect');
  const pad = 14; const clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(W, r.w + pad * 2), height: Math.min(H, r.h + pad * 2) };
  if (r.h < (mobile ? 60 : 64)) bad.push(`${TAG} hubie only ${r.h | 0} px tall`); log.push(`hubie ${name}: ${r.w | 0}x${r.h | 0} css px`);
  await p.screenshot({ path: SHOT + 'hubie-' + name + '.png', clip }); }
/** Hubie must stay inside the screen. The multipliers are drawn on a layer above him, so his hat cannot hide them. */
async function hubieCheck(p, where) { const o = await p.evaluate(() => { const r = window.__hubieRect(); if (!r) return ['no rect']; const out = [];
  if (r.x < -1 || r.x + r.w > innerWidth + 1) out.push(`hubie outside screen x ${r.x | 0}..${(r.x + r.w) | 0}`);
  return out; }); for (const x of o) bad.push(`${TAG} ${where}: ${x}`); }
const click = (p, sel) => (mobile ? p.tap(sel) : p.click(sel));
async function until(p, fn, what, ms = 25000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(p); if (fn(s)) return s; await wait(60); } bad.push(`${TAG} FROZEN waiting for ${what}`); await p.screenshot({ path: SHOT + 'frozen.png' }); throw new Error('frozen ' + what); }
async function layoutCheck(p, where) {
  const out = await p.evaluate(() => {
    const o = []; const vis = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight) o.push('page overflow ' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight);
    const sel = '.top *, .next-pill, .feed-mini, .win-pill, .panel button, .panel .field, .toast, .modal, .modal .mh *, .celeb .c-inner > *';
    for (const e of document.querySelectorAll(sel)) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) o.push(`outside ${e.tagName}.${e.className} ${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}`); }
    const groups = [['.panel button, .panel .field'], ['.next-pill, .toast, .feed-mini, .win-pill'], ['.top > *'], ['.celeb .c-inner > *'], ['.modal .mh > *']];
    for (const [g] of groups) { const els = [...document.querySelectorAll(g)].filter(vis); for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; if (ov(els[i].getBoundingClientRect(), els[j].getBoundingClientRect())) o.push(`overlap ${els[i].className || els[i].tagName} X ${els[j].className || els[j].tagName}`); } }
    for (const e of document.querySelectorAll('.panel button, .tile-btn')) if (vis(e)) { const r = e.getBoundingClientRect(); if (innerWidth < 600 && (r.height < 34 || r.width < 40)) o.push(`small target ${e.className} ${r.width | 0}x${r.height | 0}`); }
    const bal = document.querySelector('.bal b')?.textContent; const s = window.__hnw(); const exp = '$' + (s.balance / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (bal !== exp) o.push(`balance text ${bal} vs ${exp}`);
    return o; });
  for (const x of out) bad.push(`${TAG} ${where}: ${x}`);
}
let expected = 1_000_000; const midShots = new Set();
async function setBet(p) { await p.fill('input[aria-label="Bet amount"]', '0.20'); await p.press('input[aria-label="Bet amount"]', 'Enter'); await wait(150); }
async function fastOn(p) { await click(p, '.ic.snd'); await wait(150); await p.check('.pop input.fast'); await click(p, '.pop .txt'); await wait(100); }
async function closeOverlays(p) { for (let i = 0; i < 40; i++) { if (await p.$('.celeb')) { await p.click('.celeb', { force: true, timeout: 2000 }).catch(() => {}); await wait(300); continue; } return; } }
/** Plays one round: k safe steps then cash out, or k safe steps then a trap on purpose. */
async function playRound(p, level, k, trap, shotName) {
  const s0 = await st(p); const lay = layoutFor(level, SEED, CLIENT, s0.nonce); const lv = LEVELS[level];
  await click(p, '.panel .main'); await until(p, s => s.status === 'live' && !s.busy, 'bet');
  expected -= s0.bet; let s = await st(p); if (s.balance !== expected) bad.push(`${TAG} after bet balance ${s.balance} expected ${expected}`);
  for (let r = 0; r < k + (trap ? 1 : 0); r++) {
    const isTrap = trap && r === k; const row = lay[r]; const tile = row.findIndex(t => t === isTrap);
    if (tile < 0) { bad.push(`${TAG} no ${isTrap ? 'trap' : 'safe'} tile on row ${r}`); break; }
    await p.waitForSelector(`.tile-btn:nth-child(${tile + 1}):not([disabled])`, { timeout: 15000 }).catch(async e => { const x = await st(p); console.log('STUCK', level, r, JSON.stringify({ ...x, history: undefined })); await p.screenshot({ path: SHOT + 'stuck.png' }); throw e; });
    await click(p, `.tile-btn:nth-child(${tile + 1})`);
    if (isTrap && shotName) { await wait(mobile ? 420 : 380); await p.screenshot({ path: SHOT + shotName + '-fall.png' }); }
    s = await until(p, x => !x.busy && (x.status !== 'live' || x.step === r + 1), 'pick');
    if (!isTrap && s.status === 'live') { await wait(150); await hubieCheck(p, `${level} row ${r}`); }
    if (r === 0 && shotName && !isTrap) { await layoutCheck(p, 'in round'); await p.screenshot({ path: SHOT + shotName + '-climb.png' }); }
    if (r === 3 && !isTrap && !midShots.has(level)) { midShots.add(level); await wait(500); await layoutCheck(p, 'mid climb'); await p.screenshot({ path: SHOT + level + '-midclimb.png' }); await hubieCrop(p, level + '-mid'); const a = await audio(p); log.push(`${level} row 4 music ${a.section} intensity ${a.intensity}`); }
  }
  if (!trap && s.status === 'live') { await wait(200); await click(p, '.panel .main'); }
  s = await until(p, x => x.status !== 'live' && !x.busy, 'round end');
  const h = s.history[0]; const steps = Math.min(k, lv.rows);
  if (trap) { if (h.payoutCents !== 0 || s.status !== 'lost') bad.push(`${TAG} trap round paid ${h.payoutCents}`); }
  else { const pay = payoutCents(s0.bet, lv.mult100[steps]); expected += pay; if (h.payoutCents !== pay || h.mult100 !== lv.mult100[steps]) bad.push(`${TAG} payout ${h.payoutCents} mult ${h.mult100} expected ${pay} at ${lv.mult100[steps]}`); }
  if (s.balance !== expected) bad.push(`${TAG} balance ${s.balance} expected ${expected} after ${level} k=${k} trap=${trap}`);
  if (shotName) { await wait(trap ? 900 : 400); await layoutCheck(p, shotName); await p.screenshot({ path: SHOT + shotName + '.png' }); }
  await closeOverlays(p);
  return h;
}

// ---------- intro ----------
{ const p = await open('', true); await p.waitForSelector('.slides'); await layoutCheck(p, 'intro1'); await p.screenshot({ path: SHOT + 'intro1.png' });
  await click(p, '.cta'); await wait(300); await layoutCheck(p, 'intro2'); await p.screenshot({ path: SHOT + 'intro2.png' }); await click(p, '.cta'); await wait(300);
  if (await p.$('.slides')) bad.push(TAG + ' intro did not close'); await p.context().close(); }

// ---------- main session ----------
const p = await open(`?debugseed=${SEED}`);
await layoutCheck(p, 'idle'); await hubieCheck(p, 'idle'); await p.screenshot({ path: SHOT + 'idle.png' }); await hubieCrop(p, 'idle');
{ const a0 = await audio(p); if (a0.state === 'running') bad.push(TAG + ' audio started before any gesture'); }
await setBet(p);
await click(p, '.panel .main'); await wait(50); await until(p, s => s.status === 'live' && !s.busy, 'first bet').catch(() => {});
{ await wait(1500); const a = await audio(p); log.push('audio after first gesture: ' + JSON.stringify(a)); if (a.state !== 'running' || !a.playing) bad.push(TAG + ' audio not running after gesture ' + JSON.stringify(a)); if (!a.rain) bad.push(TAG + ' rain loop did not load'); }
await hubieCrop(p, 'floor');
{ const s0 = await st(p); const lay = layoutFor(s0.level, SEED, CLIENT, s0.nonce - 1); const t = lay[0].findIndex(x => !x); await click(p, `.tile-btn:nth-child(${t + 1})`); await until(p, x => !x.busy && x.step === 1, 'warm pick'); await wait(700); await hubieCrop(p, 'tile'); await p.screenshot({ path: SHOT + 'hubie-on-tile-full.png' });
  await click(p, '.panel .main'); await until(p, x => x.status !== 'live' && !x.busy, 'warm cash'); expected += payoutCents(s0.bet, LEVELS[s0.level].mult100[1]) - s0.bet; await closeOverlays(p); }
// mute toggle
{ await click(p, '.ic.snd'); await wait(150); const box = await p.$('.pop input[type=checkbox]:not(.fast)'); if (box) { await box.click(); await wait(300); const a = await audio(p); if (a.gain > 0.01) bad.push(TAG + ' mute did not silence ' + a.gain); await box.click(); await wait(300); const b2 = await audio(p); if (b2.gain < 0.01) bad.push(TAG + ' unmute stayed silent'); log.push('mute toggle ok'); } else log.push('no mute checkbox found in sound pop'); await click(p, '.pop .txt'); await wait(100); }
await setBet(p);
if ((await st(p)).bet !== 20) bad.push(TAG + ' $0.20 chip did not set the bet');
const plan = { easy: [[1, 0], [3, 0], [2, 1], [6, 0], [0, 1], [10, 0], [4, 1], [8, 0]], medium: [[1, 0], [2, 0], [0, 1], [4, 0], [3, 1], [6, 0], [1, 1], [8, 0]], hard: [[1, 0], [0, 1], [2, 0], [1, 1], [3, 0], [1, 0]], extreme: [[1, 0], [0, 1], [2, 0], [1, 0], [0, 1], [3, 0]] };
let rounds = 0;
for (const level of ['easy', 'medium', 'hard', 'extreme']) {
  await click(p, `.lvl:has-text("${LEVELS[level].name}")`); await wait(200);
  if ((await st(p)).level !== level) bad.push(`${TAG} level ${level} not selected`);
  if (level === 'hard') { await fastOn(p); log.push('fast mode on from hard'); }
  for (const [i, [k, trap]] of plan[level].entries()) { const name = i === 0 ? `${level}-cash` : i === 1 && trap ? `${level}-trap` : i === 2 && trap ? `${level}-trap` : null; await playRound(p, level, k, !!trap, name); rounds++; }
}
log.push(`${rounds} manual rounds, balance ${(await st(p)).balance} expected ${expected}`);
// a round that reaches 25x for a real HAT TIP celebration (medium, 8 steps = 24.60x, so use easy 12 = 30.30x)
await click(p, '.lvl:has-text("Easy")'); await wait(150);
{ const s0 = await st(p); const lay = layoutFor('easy', SEED, CLIENT, s0.nonce); log.push('easy 12 step round');
  await click(p, '.panel .main'); await until(p, s => s.status === 'live' && !s.busy, 'bet'); expected -= s0.bet;
  for (let r = 0; r < 12; r++) { const t = lay[r].findIndex(x => !x); await p.waitForSelector(`.tile-btn:nth-child(${t + 1}):not([disabled])`); await click(p, `.tile-btn:nth-child(${t + 1})`); await until(p, x => !x.busy && x.step === r + 1, 'pick'); }
  await click(p, '.panel .main'); await p.waitForSelector('.celeb', { timeout: 8000 }).catch(() => bad.push(TAG + ' no celebration at 30.30x'));
  await wait(500); await hubieCrop(p, 'hat-tip'); await p.screenshot({ path: SHOT + 'hat-tip-scene.png' }); await wait(1400); await layoutCheck(p, 'real hat tip'); await p.screenshot({ path: SHOT + 'real-hat-tip.png' });
  expected += payoutCents(s0.bet, LEVELS.easy.mult100[12]); await closeOverlays(p); const s = await st(p); if (s.balance !== expected) bad.push(`${TAG} balance after 30.30x ${s.balance} vs ${expected}`); }

// ---------- auto play ----------
await click(p, '.lvl:has-text("Medium")'); await wait(150);
const before = await st(p);
await click(p, '.mode:has-text("Auto")'); await p.waitForSelector('.autorow');
await p.fill('.autorow input[aria-label="Auto cash out multiplier"]', '2.16');
await p.selectOption('.autorow select', '5'); await wait(100);
await click(p, '.autorow .more'); await p.waitForSelector('.auto-form'); await layoutCheck(p, 'auto sheet'); await p.screenshot({ path: SHOT + 'auto-sheet.png' }); await click(p, '.modal .x'); await wait(200);
await layoutCheck(p, 'auto panel'); await p.screenshot({ path: SHOT + 'auto-panel.png' });
await click(p, '.panel .main');
await wait(2500); await p.screenshot({ path: SHOT + 'auto-running.png' });
const after = await until(p, s => !s.auto && !s.busy && s.status !== 'live', 'auto play end', 120000);
const newH = after.history.slice(0, after.history.length - before.history.length);
let delta = 0; for (const h of newH) { delta += h.payoutCents - h.betCents; if (h.payoutCents && (h.mult100 !== 216 || h.payoutCents !== payoutCents(h.betCents, 216))) bad.push(`${TAG} auto payout ${h.payoutCents} at ${h.mult100}`); }
if (newH.length !== 5) bad.push(`${TAG} auto played ${newH.length} rounds, expected 5`);
expected += delta; if (after.balance !== expected) bad.push(`${TAG} balance after auto ${after.balance} vs ${expected}`);
log.push(`auto: ${newH.map(h => (h.payoutCents ? 'W' : 'L')).join('')}, delta ${delta}`);
await closeOverlays(p); await click(p, '.mode:has-text("Manual")'); await wait(150);

// ---------- info modal ----------
for (const [t, n] of [['Rules', 'rules'], ['Paytable', 'paytable'], ['Provably fair', 'fair'], ['History', 'history']]) {
  await click(p, '.ic.info'); await p.waitForSelector('.modal.info'); await click(p, `.modal .tabs button:has-text("${t}")`); await wait(250);
  await layoutCheck(p, 'modal ' + n); await p.screenshot({ path: SHOT + 'info-' + n + '.png' });
  if (n === 'history') { await click(p, '.hist tbody tr:first-child .txt'); await wait(200); await click(p, '.fair .main.small'); await p.waitForSelector('.vmap', { timeout: 8000 });
    const h = (await st(p)).history[0]; const exp = layoutFor(h.level, h.serverSeed, h.clientSeed, h.nonce);
    const got = await p.$$eval('.vrow', rows => rows.map(r => [...r.querySelectorAll('i')].map(i => i.className === 'x')).reverse());
    if (JSON.stringify(got) !== JSON.stringify(exp)) bad.push(TAG + ' verifier output differs from node'); else log.push('verifier matches node for nonce ' + h.nonce);
    await p.screenshot({ path: SHOT + 'info-verify.png' }); }
  await click(p, '.modal .x'); await wait(200);
}
// sound popover
await click(p, '.ic.snd'); await wait(200); await layoutCheck(p, 'sound pop'); await p.screenshot({ path: SHOT + 'sound.png' }); await click(p, '.pop .txt');
if (!mobile) { await layoutCheck(p, 'desktop live'); } else { await click(p, '.feed-mini'); await wait(600); await layoutCheck(p, 'live sheet'); await p.screenshot({ path: SHOT + 'live-sheet.png' }); await click(p, '.modal .x'); }
log.push(`final balance ${(await st(p)).balance} expected ${expected}, rounds in history ${(await st(p)).history.length}`);
await p.context().close();

// ---------- max win: find a nonce 0 layout where the extreme summit is safe ----------
{ let seed = ''; for (let i = 0; i < 500; i++) { const L = layoutFor('extreme', 'maxwin-' + i, CLIENT, 0); if (!L[6][0]) { seed = 'maxwin-' + i; break; } }
  const q = await open(`?debugseed=${seed}`); await click(q, '.lvl:has-text("Extreme")'); await fastOn(q); await setBet(q);
  const lay = layoutFor('extreme', seed, CLIENT, 0); await click(q, '.panel .main'); await until(q, s => s.status === 'live' && !s.busy, 'bet');
  for (let r = 0; r < 7; r++) { const t = lay[r].findIndex(x => !x); await q.waitForSelector(`.tile-btn:nth-child(${t + 1}):not([disabled])`); if (r === 6) { await layoutCheck(q, 'summit'); await q.screenshot({ path: SHOT + 'summit-row.png' }); } await click(q, `.tile-btn:nth-child(${t + 1})`); await until(q, x => !x.busy && (x.step === r + 1 || x.status !== 'live'), 'pick'); }
  await q.waitForSelector('.celeb.t4', { timeout: 8000 }).catch(() => bad.push(TAG + ' no max win screen'));
  const s = await st(q); if (s.status !== 'won' || s.history[0].mult100 !== 1_000_000 || s.balance !== 1_000_000 - 20 + 200_000) bad.push(`${TAG} max win wrong: ${s.status} ${s.history[0]?.mult100} bal ${s.balance}`); else log.push('max win auto cash out: $0.20 to $2,000.00, balance exact');
  await wait(3300); await layoutCheck(q, 'max win'); await q.screenshot({ path: SHOT + 'maxwin.png' }); await q.context().close(); }

// ---------- forced celebration previews ----------
for (const f of ['hat', 'king', 'night', 'max']) {
  const q = await open(`?force=${f}`); await q.waitForSelector('.celeb', { timeout: 8000 }).catch(() => bad.push(`${TAG} force ${f} no overlay`));
  await wait(f === 'night' || f === 'max' ? 3300 : 1900); await layoutCheck(q, 'force ' + f); await q.screenshot({ path: SHOT + 'force-' + f + '.png' });
  const s = await st(q); if (s.balance !== 1_000_000 || s.history.length || s.nonce !== 0) bad.push(`${TAG} force ${f} touched state`); await q.context().close();
}
await browser.close();
console.log(log.join('\n'));
console.log('ERRORS', JSON.stringify(errs));
console.log('BAD', bad.length, JSON.stringify(bad, null, 1));
