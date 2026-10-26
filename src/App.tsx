import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import gsap from 'gsap';
import { Game, type HistoryItem } from './game';
import { Scene, fmtMult } from './scene';
import { FX } from './fx';
import { LEVELS, LEVEL_ORDER, MAX_BET, MIN_BET, buildLayout, floatsNeeded, isSummit, tilesOn, type LevelId } from './engine';
import { hmacFloats, randomHex, sha256Hex } from './fair';
import { getVolume, isMuted, setIntensity, setMuted, setVolume, sfx, unlock } from './sound';
import { liveSource, type LiveEvent } from './live';
import { ART } from './art';

const game = new Game();
const q = new URLSearchParams(location.search);
const FORCE = q.get('force'); // debug preview of a celebration: hat | king | night | max. Never touches balance or seeds.
const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const TIERS = [
  { min: 25, name: 'HAT TIP', sub: 'Hubie tips the top hat to you', cls: 't1' },
  { min: 100, name: 'ROOFTOP KING', sub: 'The whole block saw that jump', cls: 't2' },
  { min: 1000, name: 'OWN THE NIGHT', sub: 'Every sign in the city is blinking your name', cls: 't3' },
  { min: 10000, name: 'TOP OF THE CITY', sub: 'Max win. Hubie made the summit', cls: 't4' },
];
const tierOf = (m: number) => (m >= 10000 ? 4 : m >= 1000 ? 3 : m >= 100 ? 2 : m >= 25 ? 1 : 0);
type Celeb = { tier: number; mult: number; amount: number; forced?: boolean };
type Tab = 'rules' | 'paytable' | 'fair' | 'history';

declare global { interface Window { __hnw?: () => unknown } }
window.__hnw = () => ({ balance: game.balance, bet: game.betCents, level: game.level, status: game.round?.status ?? 'idle', step: game.round?.step ?? 0, busy: game.busy, auto: game.autoRunning, clientSeed: game.clientSeed, nonce: game.nonce, history: game.history.map(h => ({ ...h })) });

export default function App() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const stageRef = useRef<HTMLDivElement>(null); const fxRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null); const fx = useRef<FX | null>(null);
  const [rects, setRects] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [celeb, setCeleb] = useState<Celeb | null>(null); const celebDone = useRef<(() => void) | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'win' | 'lose' } | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [intro, setIntro] = useState(() => localStorage.getItem('hnw-intro') !== '2');
  const [slide, setSlide] = useState(0);
  const [sheet, setSheet] = useState<'auto' | 'live' | 'sound' | null>(null);
  const [feed, setFeed] = useState<LiveEvent[]>([]); const [bigs, setBigs] = useState<string[]>([]);
  const [betText, setBetText] = useState((game.betCents / 100).toFixed(2));
  const [targetText, setTargetText] = useState('');
  const [verify, setVerify] = useState<{ server: string; client: string; nonce: string; level: LevelId; out?: { hash: string; layout: boolean[][] } | string }>({ server: '', client: '', nonce: '0', level: 'medium' });
  const [, setVolTick] = useState(0);
  const lv = game.lv; const r = game.round;

  useEffect(() => game.on(bump), []);
  useEffect(() => { if (!game.inRound) setBetText((game.betCents / 100).toFixed(2)); }, [game.betCents]);
  useEffect(() => {
    const sc = new Scene(stageRef.current!); scene.current = sc; sc.fast = game.fast;
    sc.onLayout = () => updateRects();
    void sc.ready.then(() => { sc.padR = ladderW(); sc.setLevel(LEVELS[game.level]); });
    fx.current = new FX(fxRef.current!);
    const off = liveSource.subscribe(e => {
      setFeed(f => [e, ...f].slice(0, 40));
      if (e.kind === 'cashout' && (e.mult >= 10 || e.payout >= 40)) setBigs(b => [`${e.player} cashed out ${fmtMult(e.mult)} on ${LEVELS[e.level].name} for ${money(Math.round(e.payout * 100))}`, ...b].slice(0, 20));
    });
    const onR = () => { if (scene.current) { scene.current.padR = ladderW(); scene.current.layout(); } };
    addEventListener('resize', onR);
    const onKey = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT' || tab || intro) return; if (e.code === 'Space') { e.preventDefault(); mainAction(); } const n = Number(e.key); if (n >= 1 && n <= 4) void doPick(n - 1); };
    addEventListener('keydown', onKey);
    return () => { off(); removeEventListener('resize', onR); removeEventListener('keydown', onKey); sc.app.destroy?.(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (FORCE && !intro) { const m = { hat: 25, king: 100, night: 1000, max: 10000 }[FORCE] ?? 25; void wait(600).then(() => showCeleb({ tier: tierOf(m), mult: m, amount: Math.floor(game.betCents * m), forced: true })); } }, [intro]);

  function ladderW() { return innerWidth < 960 ? 70 : 96; }
  function updateRects() {
    const sc = scene.current; const g = game.round;
    if (!sc || !sc.level || !g || g.status !== 'live' || game.busy) { setRects([]); return; }
    setRects(Array.from({ length: tilesOn(sc.level, g.step) }, (_, i) => sc.tileRect(g.step, i)));
  }
  useEffect(updateRects);

  function intensityFor(step: number) { const L = game.lv; const f = step / L.rows; const m = L.mult100[step] / 100; return f >= 0.75 || m >= 100 ? 4 : f >= 0.5 || m >= 20 ? 3 : f >= 0.25 || m >= 5 ? 2 : 1; }

  async function doBet() {
    unlock(); if (!game.canBet()) { if (game.betCents > game.balance) flash('Not enough demo balance for that bet', 'lose'); return false; }
    setToast(null);
    const ok = await game.bet(); if (!ok) return false;
    sfx.sfxBet(); const sc = scene.current!; sc.fast = game.fast; sc.padR = ladderW(); sc.reset(LEVELS[game.round!.level]); sc.setActiveRow(0); setIntensity(1); bump();
    return true;
  }
  async function doPick(i: number) {
    const sc = scene.current; const g = game.round; if (!sc || !g) return;
    const res = game.peek(i); if (!res) return;
    game.busy = true; game.emit(); const row = g.step; unlock();
    sfx.sfxPick(); sfx.sfxHop(); sc.setActiveRow(null);
    await sc.hop(row, i); sfx.sfxLand();
    const out = game.commitPick(i);
    if (out === 'trap') {
      sc.setState(row, i, 'trapPicked'); const p = sc.tileScreen(row, i);
      fx.current?.burst(18, p.x, p.y, ['smoke'], 0.8); fx.current?.burst(16, p.x, p.y, ['spark', 'ember'], 0.7);
      sfx.stingTrap(); setIntensity(0); stage(); await sc.tumble(); sc.reveal(g.layout, row);
      flash(isSummit(LEVELS[g.level], row) ? 'Missed the summit jump. Round over' : `Vent blew on row ${row + 1}. Round over`, 'lose');
      game.busy = false; game.emit(); return;
    }
    sc.setState(row, i, 'safePicked'); sc.lightRow(row); sfx.sfxSafe(row);
    const p = sc.tileScreen(row, i); fx.current?.burst(8, p.x, p.y - 20, ['coin', 'spark'], 0.35);
    if (out === 'max') { sc.reveal(g.layout, row); game.busy = false; await celebrate(g.betCents, LEVELS[g.level].mult100[g.step] / 100, g.payoutCents); return; }
    setIntensity(intensityFor(g.step)); sc.panTo(g.step); sc.setActiveRow(g.step);
    game.busy = false; game.emit();
    if (game.shouldAutoCash()) await doCash();
  }
  async function doCash() {
    const g = game.round; if (!g || g.status !== 'live' || game.busy || g.step < 1) return;
    const pay = game.cashOut(); scene.current?.reveal(g.layout, g.step); setIntensity(0);
    await celebrate(g.betCents, LEVELS[g.level].mult100[g.step] / 100, pay);
  }
  function stage() { const el = stageRef.current; if (el) gsap.fromTo(el, { x: -6 }, { x: 0, duration: 0.35, ease: 'elastic.out(1,0.3)' }); }
  async function celebrate(_bet: number, mult: number, amount: number) {
    const t = tierOf(mult); sfx.stingCash(t); scene.current?.celebrate();
    const hp = scene.current!.hubieScreen(); fx.current?.burst(18 + t * 10, hp.x, hp.y, ['coin', 'spark'], 0.7);
    if (t === 0) { flash(`Cashed out ${fmtMult(mult)}`, 'win', amount); return; }
    await showCeleb({ tier: t, mult, amount });
  }
  function showCeleb(c: Celeb) {
    setCeleb(c); const f = fx.current!; f.shower = c.tier >= 3 ? 10 : c.tier * 4; if (c.forced) sfx.stingCash(c.tier);
    return new Promise<void>(res => {
      let closed = false; const close = () => { if (closed) return; closed = true; f.shower = 0; setCeleb(null); celebDone.current = null; res(); };
      celebDone.current = close; const ms = game.autoRunning ? (game.fast ? 1400 : 2400) : c.tier >= 3 ? 9000 : 6500; setTimeout(close, ms);
    });
  }
  function flash(text: string, kind: 'win' | 'lose', amount?: number) {
    setToast({ text: amount !== undefined ? `${text}  +${money(amount)}` : text, kind });
    if (amount !== undefined) { const o = { v: 0 }; gsap.to(o, { v: amount, duration: game.fast ? 0.4 : 0.9, ease: 'power2.out', onUpdate: () => setToast({ text: `${text}  +${money(Math.round(o.v))}`, kind }) }); }
  }
  function mainAction() { if (game.autoRunning) { game.stopAuto(); return; } if (game.inRound) void doCash(); else void doBet(); }
  async function runAuto() {
    unlock(); const t = parseTarget(targetText); if (t === null) { flash('Set an auto cash out multiplier first', 'lose'); setSheet('auto'); return; }
    game.autoTarget = t; setSheet(null); if (!game.startAuto()) return;
    while (game.autoRunning) {
      if (!(await doBet())) { game.stopAuto(); break; }
      while (game.round?.status === 'live') {
        await wait(game.fast ? 90 : 260);
        if (!game.autoRunning && game.round.step > 0) break; // stopped mid round: the player decides
        const n = tilesOn(game.lv, game.round.step); await doPick(Math.floor(Math.random() * n));
      }
      await wait(game.fast ? 250 : 650);
    }
    bump();
  }
  function parseTarget(s: string) { const v = Number(s.replace(/[^0-9.]/g, '')); if (!s.trim() || !isFinite(v) || v < 1.01) return null; return Math.min(10000, Math.round(v * 100) / 100); }
  function commitBet(s: string) { const v = Number(s.replace(/[^0-9.]/g, '')); if (isFinite(v) && v > 0) game.setBet(Math.round(v * 100)); else game.setBet(game.betCents); setBetText((game.betCents / 100).toFixed(2)); }
  function chooseLevel(l: LevelId) { if (game.inRound) return; sfx.sfxClick(); game.setLevel(l); scene.current?.setLevel(LEVELS[l]); setToast(null); }
  async function runVerify() {
    try {
      const L = LEVELS[verify.level]; const fl = await hmacFloats(verify.server, verify.client, Number(verify.nonce), floatsNeeded(L));
      setVerify(v => ({ ...v, out: { hash: '', layout: buildLayout(L, fl) } })); const h = await sha256Hex(verify.server); setVerify(v => ({ ...v, out: { hash: h, layout: buildLayout(L, fl) } }));
    } catch { setVerify(v => ({ ...v, out: 'Could not verify. Check the server seed and nonce.' })); }
  }
  function openVerify(h: HistoryItem) { setVerify({ server: h.serverSeed, client: h.clientSeed, nonce: String(h.nonce), level: h.level }); setTab('fair'); }

  const step = r?.step ?? 0; const live = game.inRound; const busy = game.busy;
  const nextRow = live ? step : 0; const nextMult = lv.mult100[Math.min(lv.rows, nextRow + 1)] / 100;
  const ladder = useMemo(() => { const from = live ? step + 1 : 1; const out: number[] = []; for (let k = Math.min(lv.rows, from + 4); k >= from; k--) out.push(k); return out; }, [lv, step, live]);
  const winAmount = live && step > 0 ? game.currentPayout() : 0;
  const levelLocked = live || game.autoRunning;

  const mainLabel = game.autoRunning ? <>STOP AUTO <small>{game.auto.rounds ? `${game.autoLeft} left` : 'no limit'}</small></> : live ? (step > 0 ? <>CASH OUT <small>{money(winAmount)}</small></> : <>PICK A TILE <small>or cash out after one step</small></>) : <>BET <small>{money(game.betCents)} on {LEVELS[game.level].name}</small></>;

  return (
    <div className={'app' + (live ? ' live' : '')}>
      <canvas ref={fxRef} className="fx" />
      <header className="top">
        <div className="brand"><img src={ART('hubie_idle')} alt="" /><div><b>HUBIE'S NIGHT WALK</b><span>Housebets original</span></div></div>
        <div className="bal" aria-label="Demo balance"><span>DEMO</span><b>{money(game.balance)}</b></div>
        <div className="icons">
          <button className="ic snd" aria-label="Sound" onClick={() => { unlock(); setSheet(sheet === 'sound' ? null : 'sound'); }}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{isMuted() ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" />}</svg></button>
          <button className="ic info" aria-label="Rules and fairness" onClick={() => setTab('rules')}>?</button>
        </div>
        {sheet === 'sound' && <div className="pop sound-pop">
          <label className="row"><input type="checkbox" checked={!isMuted()} onChange={e => { setMuted(!e.target.checked); setVolTick(x => x + 1); }} /> Sound on</label>
          <label className="row">Volume <input type="range" min={0} max={1} step={0.05} defaultValue={getVolume()} onChange={e => setVolume(Number(e.target.value))} /></label>
          <button className="txt" onClick={() => setSheet(null)}>Done</button>
        </div>}
      </header>

      <div className="ticker" onClick={() => setSheet('live')} role="button" aria-label="Open live feed">
        <span className="tag">Simulated players, demo only</span>
        <span className="tick-msg" key={bigs[0]}>{bigs[0] ?? 'Waiting for the first big cash out of the night'}</span>
      </div>

      <main className="stage-wrap">
        <div className="stage" ref={stageRef} />
        <div className="hud">
          <div className="next-chip">{live ? (isSummit(lv, step) ? <>Summit jump <b>{(lv.summitP * 100).toFixed(1)}%</b> for <b>10,000x</b></> : <>Row {nextRow + 1} of {lv.rows} <b>next {fmtMult(nextMult)}</b></>) : <>{lv.name}: {lv.tiles} tiles, {lv.traps} trap{lv.traps > 1 ? 's' : ''} per row</>}</div>
          {live && step > 0 && <div className="cur-chip">Now <b>{fmtMult(game.currentMult100() / 100)}</b></div>}
          {game.autoTarget !== null && (live || game.autoRunning) && <div className="tgt-chip">Auto cash out {fmtMult(game.autoTarget)}</div>}
        </div>
        <ol className="ladder" aria-label="Upcoming multipliers" style={{ width: ladderW() }}>
          {ladder.map(k => <li key={k} className={(k === (live ? step + 1 : 1) ? 'next ' : '') + (k === lv.rows ? 'cap' : '')}><span>{k === lv.rows ? 'TOP' : 'R' + k}</span><b>{fmtMult(lv.mult100[k] / 100)}</b></li>)}
        </ol>
        <div className="tiles-ov">{rects.map((t, i) => <button key={i} className="tile-btn" aria-label={`Tile ${i + 1}`} style={{ left: t.x, top: t.y, width: t.w, height: t.h }} onClick={() => void doPick(i)} disabled={busy || game.autoRunning} />)}</div>
        {toast && <div className={'toast ' + toast.kind} key={toast.text.slice(0, 12)}>{toast.text}</div>}
      </main>

      <section className="panel">
        <div className="prow betrow">
          <label className="field"><span>Bet</span><i>$</i><input inputMode="decimal" aria-label="Bet amount" value={betText} disabled={levelLocked} onChange={e => setBetText(e.target.value)} onBlur={e => commitBet(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitBet((e.target as HTMLInputElement).value); }} /></label>
          <button className="sm half" disabled={levelLocked} onClick={() => game.setBet(Math.floor(game.betCents / 2))}>½</button>
          <button className="sm dbl" disabled={levelLocked} onClick={() => game.setBet(game.betCents * 2)}>2x</button>
        </div>
        <div className="prow chips">{[20, 100, 500, 2000].map(c => <button key={c} className={'chip' + (game.betCents === c ? ' on' : '')} disabled={levelLocked} onClick={() => { sfx.sfxClick(); game.setBet(c); }}>{money(c)}</button>)}</div>
        <div className="prow levels" role="radiogroup" aria-label="Difficulty">{LEVEL_ORDER.map(l => <button key={l} role="radio" aria-checked={game.level === l} className={'lvl' + (game.level === l ? ' on' : '')} disabled={levelLocked} onClick={() => chooseLevel(l)}><b>{LEVELS[l].name}</b><span>{LEVELS[l].traps}/{LEVELS[l].tiles} traps</span></button>)}</div>
        <div className="prow desk-only target"><label className="field"><span>Auto cash out</span><input inputMode="decimal" aria-label="Auto cash out multiplier" placeholder="off" value={targetText} onChange={e => { setTargetText(e.target.value); game.autoTarget = parseTarget(e.target.value); }} /><i>x</i></label></div>
        <div className="prow actions">
          <button className="side auto-btn" onClick={() => (live && !game.autoRunning ? void doPick(Math.floor(Math.random() * tilesOn(lv, step))) : setSheet('auto'))} disabled={busy || game.autoRunning}>{live ? 'Pick for me' : 'Auto'}</button>
          <button className={'main' + (live && step > 0 ? ' cash' : '') + (game.autoRunning ? ' stop' : '')} onClick={mainAction} disabled={!game.autoRunning && (busy || (live && step === 0) || (!live && !game.canBet()))}>{mainLabel}</button>
          <button className={'side fast' + (game.fast ? ' on' : '')} aria-pressed={game.fast} onClick={() => { game.setFast(!game.fast); if (scene.current) scene.current.fast = game.fast; }}>Fast<small>{game.fast ? 'on' : 'off'}</small></button>
        </div>
      </section>

      <aside className="livepanel">
        <h3>Live table <em>Simulated players, demo only</em></h3>
        <ul className="feed">{feed.map(e => <li key={e.id} className={e.kind}><span className="who">{e.player}</span><span className="what">{e.kind === 'bet' ? `bet ${money(Math.round(e.bet * 100))} on ${LEVELS[e.level].name}` : e.kind === 'cashout' ? `cashed out ${fmtMult(e.mult)}` : `hit a vent on row ${e.step}`}</span><b>{e.kind === 'cashout' ? '+' + money(Math.round(e.payout * 100)) : e.kind === 'bust' ? money(Math.round(e.bet * 100)) : ''}</b></li>)}</ul>
        <h3>Big wins chat</h3>
        <ul className="chat">{bigs.slice(0, 8).map((b, i) => <li key={b + i}>{b}</li>)}</ul>
      </aside>

      {sheet === 'auto' && <div className="ov" onClick={() => setSheet(null)}><div className="modal sheet" onClick={e => e.stopPropagation()}>
        <div className="mh"><b>Auto play</b><button className="x" aria-label="Close" onClick={() => setSheet(null)}>✕</button></div>
        <div className="mb auto-form">
          <label className="field"><span>Auto cash out at</span><input inputMode="decimal" aria-label="Auto cash out multiplier" placeholder="for example 2.16" value={targetText} onChange={e => { setTargetText(e.target.value); game.autoTarget = parseTarget(e.target.value); }} /><i>x</i></label>
          <p className="mut">Manual rounds also cash out here once the multiplier reaches it. Leave it empty to turn it off.</p>
          <div className="seg"><span>Rounds</span>{[5, 10, 25, 100, 0].map(n => <button key={n} className={game.auto.rounds === n ? 'on' : ''} onClick={() => { game.auto.rounds = n; bump(); }}>{n || '∞'}</button>)}</div>
          <div className="seg"><span>On win</span><button className={game.auto.onWin === 'reset' ? 'on' : ''} onClick={() => { game.auto.onWin = 'reset'; bump(); }}>Reset bet</button><button className={game.auto.onWin === 'raise' ? 'on' : ''} onClick={() => { game.auto.onWin = 'raise'; bump(); }}>Raise</button><input aria-label="Raise on win percent" inputMode="numeric" value={game.auto.winPct} onChange={e => { game.auto.winPct = Math.max(0, Number(e.target.value) || 0); bump(); }} /><i>%</i></div>
          <div className="seg"><span>On loss</span><button className={game.auto.onLoss === 'reset' ? 'on' : ''} onClick={() => { game.auto.onLoss = 'reset'; bump(); }}>Reset bet</button><button className={game.auto.onLoss === 'raise' ? 'on' : ''} onClick={() => { game.auto.onLoss = 'raise'; bump(); }}>Raise</button><input aria-label="Raise on loss percent" inputMode="numeric" value={game.auto.lossPct} onChange={e => { game.auto.lossPct = Math.max(0, Number(e.target.value) || 0); bump(); }} /><i>%</i></div>
          <div className="seg"><span>Stop at profit</span><i>$</i><input aria-label="Stop on profit" inputMode="decimal" value={game.auto.stopProfit || ''} placeholder="off" onChange={e => { game.auto.stopProfit = Number(e.target.value) || 0; bump(); }} /></div>
          <div className="seg"><span>Stop at loss</span><i>$</i><input aria-label="Stop on loss" inputMode="decimal" value={game.auto.stopLoss || ''} placeholder="off" onChange={e => { game.auto.stopLoss = Number(e.target.value) || 0; bump(); }} /></div>
          <p className="mut">Auto play picks a random tile on each row and cashes out at your multiplier. Tile choice does not change the odds; every tile on a row has the same chance to hide a trap.</p>
          <button className="main start-auto" onClick={() => void runAuto()} disabled={!game.canBet()}>START AUTO</button>
        </div>
      </div></div>}

      {sheet === 'live' && <div className="ov" onClick={() => setSheet(null)}><div className="modal sheet" onClick={e => e.stopPropagation()}>
        <div className="mh"><b>Live table</b><button className="x" aria-label="Close" onClick={() => setSheet(null)}>✕</button></div>
        <div className="mb"><p className="demo-note">Simulated players, demo only. These names and bets are made up to show how the feed will look inside the casino.</p>
          <ul className="feed">{feed.slice(0, 25).map(e => <li key={e.id} className={e.kind}><span className="who">{e.player}</span><span className="what">{e.kind === 'bet' ? `bet ${money(Math.round(e.bet * 100))}` : e.kind === 'cashout' ? `cashed out ${fmtMult(e.mult)}` : `vent on row ${e.step}`}</span><b>{e.kind === 'cashout' ? '+' + money(Math.round(e.payout * 100)) : ''}</b></li>)}</ul></div>
      </div></div>}

      {tab && <div className="ov" onClick={() => setTab(null)}><div className="modal info" onClick={e => e.stopPropagation()}>
        <div className="mh"><div className="tabs">{(['rules', 'paytable', 'fair', 'history'] as Tab[]).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'fair' ? 'Provably fair' : t[0].toUpperCase() + t.slice(1)}</button>)}</div><button className="x" aria-label="Close" onClick={() => setTab(null)}>✕</button></div>
        <div className="mb">{tab === 'rules' && <Rules />}{tab === 'paytable' && <Paytable />}
          {tab === 'fair' && <div className="fair">
            <p>Before every round you can see the hash of the server seed that will decide it. The seed itself stays hidden until the round ends, so the game can't change the traps after you bet, and you can't see them early.</p>
            <dl><dt>Next server seed hash</dt><dd className="mono">{game.nextHash || 'loading'}</dd><dt>Client seed</dt><dd><input className="mono" aria-label="Client seed" value={game.clientSeed} disabled={live} onChange={e => game.setClientSeed(e.target.value)} /> <button className="txt" disabled={live} onClick={() => game.setClientSeed(randomHex(8))}>New</button></dd><dt>Next nonce</dt><dd className="mono">{game.nonce}</dd></dl>
            <h4>Verify a round</h4>
            <div className="vgrid"><label>Server seed<input className="mono" value={verify.server} onChange={e => setVerify({ ...verify, server: e.target.value, out: undefined })} /></label><label>Client seed<input className="mono" value={verify.client} onChange={e => setVerify({ ...verify, client: e.target.value, out: undefined })} /></label><label>Nonce<input className="mono" inputMode="numeric" value={verify.nonce} onChange={e => setVerify({ ...verify, nonce: e.target.value, out: undefined })} /></label><label>Difficulty<select value={verify.level} onChange={e => setVerify({ ...verify, level: e.target.value as LevelId, out: undefined })}>{LEVEL_ORDER.map(l => <option key={l} value={l}>{LEVELS[l].name}</option>)}</select></label></div>
            <button className="main small" onClick={() => void runVerify()} disabled={!verify.server}>Verify</button>
            {typeof verify.out === 'string' && <p className="lose">{verify.out}</p>}
            {verify.out && typeof verify.out !== 'string' && <div className="vout"><p className="mono">SHA256 of the seed: {verify.out.hash}</p><div className="vmap">{verify.out.layout.map((row, ri) => ({ row, ri })).reverse().map(({ row, ri }) => <div key={ri} className="vrow"><span>{ri + 1}</span>{row.map((t, i) => <i key={i} className={t ? 'x' : 's'}>{t ? 'trap' : 'safe'}</i>)}</div>)}</div></div>}
            <details><summary>How the traps are drawn</summary><p>For block b the game computes HMAC SHA256 with the server seed as key and <code>clientSeed:nonce:b</code> as the message, then reads the 32 bytes as eight numbers between 0 and 1 (big endian u32 divided by 2^32). Row r uses numbers 4r to 4r+3. On a normal row those numbers shuffle the tile list with a Fisher Yates shuffle and the first tiles of the shuffled list are the traps. On the Summit row the jump works when the first number is below the Summit chance. The repo has <code>scripts/verify.ts</code>, which does the same thing in Node.</p></details>
          </div>}
          {tab === 'history' && <div className="hist">{game.history.length === 0 ? <p className="mut">No rounds yet tonight.</p> : <table><thead><tr><th>Level</th><th>Bet</th><th>Result</th><th>Payout</th><th /></tr></thead><tbody>{game.history.map(h => <tr key={h.id + ':' + h.nonce} className={h.payoutCents ? 'won' : 'lost'}><td>{LEVELS[h.level].name}</td><td>{money(h.betCents)}</td><td>{h.payoutCents ? fmtMult(h.mult100 / 100) : `trap, row ${h.steps + 1}`}</td><td>{h.payoutCents ? money(h.payoutCents) : '$0.00'}</td><td><button className="txt" onClick={() => openVerify(h)}>Verify</button></td></tr>)}</tbody></table>}</div>}
        </div>
      </div></div>}

      {celeb && <div className={'celeb ' + TIERS[celeb.tier - 1].cls} onClick={() => celebDone.current?.()}>
        <div className="rays" />
        <div className="c-inner">
          {celeb.tier === 4 && <div className="max-tag">MAX WIN</div>}
          <img className="c-hubie" src={ART('hubie_bigwin')} alt="" />
          <div className="c-name">{TIERS[celeb.tier - 1].name}</div>
          <div className="c-sub">{TIERS[celeb.tier - 1].sub}</div>
          <CountUp to={celeb.amount} mult={celeb.mult} dur={celeb.tier >= 3 ? 3 : 1.6} />
          <div className="c-hint">{celeb.forced ? 'Debug preview, balance unchanged. Tap to close' : 'Tap to continue'}</div>
        </div>
      </div>}

      {intro && <div className="ov intro"><div className="modal slides">
        {slide === 0 ? <div className="slide"><img src={ART('hubie_idle')} alt="" /><h2>Get Hubie across the roof</h2><p>Every row of the rooftop has vents. Most hold, some blow. Tap a vent and Hubie hops onto it; if it holds, your multiplier climbs and the next row lights up.</p></div>
          : <div className="slide"><img src={ART('hubie_react')} alt="" /><h2>Cash out before a vent blows</h2><p>After the first safe step you can cash out at any time. Hit a trap and the bet is gone. Clear the Summit and you take 10,000x. Medium is the default, with 1 trap in 3 tiles.</p></div>}
        <div className="dots"><i className={slide === 0 ? 'on' : ''} /><i className={slide === 1 ? 'on' : ''} /></div>
        <div className="sbtns"><button className="txt skip" onClick={() => { localStorage.setItem('hnw-intro', '2'); setIntro(false); }}>Skip</button><button className="main cta" onClick={() => { unlock(); if (slide === 0) setSlide(1); else { localStorage.setItem('hnw-intro', '2'); setIntro(false); } }}>{slide === 0 ? 'Next' : "Let's walk"}</button></div>
      </div></div>}
    </div>
  );
}

function CountUp({ to, mult, dur }: { to: number; mult: number; dur: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const o = { v: 0 }; const t = gsap.to(o, { v: to, duration: dur, ease: 'power2.out', onUpdate: () => { if (ref.current) ref.current.textContent = money(Math.round(o.v)); } }); return () => { t.kill(); }; }, [to, dur]);
  return <><div className="c-amt" ref={ref}>{money(0)}</div><div className="c-mult">{fmtMult(mult)}</div></>;
}

function Rules() {
  return <div className="rules">
    <p>Hubie is crossing a rooftop at night, one row of vents at a time. You bet, then pick one tile on the lowest row. A safe tile moves Hubie up and raises your multiplier. A trap ends the round and the bet is lost.</p>
    <h4>Cashing out</h4>
    <p>After at least one safe step, the big button shows CASH OUT with the amount you would get. Press it whenever you like. You can also type an auto cash out multiplier; the game cashes out for you as soon as the multiplier reaches it. Payout equals bet times multiplier, rounded down to the cent.</p>
    <h4>Difficulty</h4>
    <ul><li>Easy: 4 tiles per row, 1 trap. 3 in 4 chance per row. 33 rows.</li><li>Medium (default): 3 tiles, 1 trap. 2 in 3 chance per row. 23 rows.</li><li>Hard: 3 tiles, 2 traps. 1 in 3 chance per row. 9 rows.</li><li>Extreme: 4 tiles, 3 traps. 1 in 4 chance per row. 7 rows.</li></ul>
    <p>The multiplier after n safe steps is 0.96 divided by the chance of surviving n rows, rounded down to 2 decimals. So every cash out point returns about 96% over time, and the game keeps about 4%.</p>
    <h4>The Summit</h4>
    <p>The top row of every level is one wide ledge that pays the 10,000x maximum. The jump works with a set chance per level (Easy 95.6%, Medium 71.8%, Hard 63.0%, Extreme 39.3%), picked so that the Summit also returns 96%. Reaching it cashes out automatically.</p>
    <h4>Limits</h4>
    <p>Minimum bet $0.10, maximum bet $20. Maximum win 10,000x the bet, so $200,000 at the top bet. RTP 96% on every level and at every cash out point. This demo runs on play money with a $10,000 starting balance; nothing here touches a wallet.</p>
    <h4>Auto play and fast mode</h4>
    <p>Auto play needs an auto cash out multiplier. It picks a random tile on each row, which doesn't change the odds, and it can raise or reset your bet after a win or a loss and stop at a profit or loss limit. Fast mode only shortens the animations.</p>
    <h4>Live table</h4>
    <p>Simulated players, demo only. The live feed and the big wins chat show made up players and bets so you can see how the feed will look once the casino connects real data. They are not other people playing.</p>
    <h4>Fairness</h4>
    <p>All the traps of a round are fixed when you bet, from the server seed, your client seed and the nonce. The Provably fair tab explains how to check any finished round.</p>
  </div>;
}

function Paytable() {
  const [l, setL] = useState<LevelId>('medium'); const L = LEVELS[l];
  return <div className="paytable">
    <div className="tabs small">{LEVEL_ORDER.map(x => <button key={x} className={x === l ? 'on' : ''} onClick={() => setL(x)}>{LEVELS[x].name}</button>)}</div>
    <p className="mut">{L.tiles} tiles and {L.traps} trap{L.traps > 1 ? 's' : ''} per row, {L.rows} rows, the last one is the Summit. Chance is the odds of getting that far from the start.</p>
    <table><thead><tr><th>Row</th><th>Multiplier</th><th>$1 pays</th><th>Chance</th></tr></thead><tbody>
      {Array.from({ length: L.rows }, (_, i) => i + 1).map(k => { let p = 1; for (let j = 0; j < k; j++) p *= j === L.rows - 1 ? L.summitP : L.num / L.den; return <tr key={k} className={k === L.rows ? 'cap' : ''}><td>{k === L.rows ? 'Summit' : k}</td><td>{fmtMult(L.mult100[k] / 100)}</td><td>{'$' + (Math.floor(L.mult100[k]) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>{p >= 0.01 ? (p * 100).toFixed(1) + '%' : '1 in ' + Math.round(1 / p).toLocaleString('en-US')}</td></tr>; })}
    </tbody></table>
  </div>;
}
