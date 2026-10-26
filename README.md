# Hubie's Night Walk

A climb and cash out game for Housebets. Hubie, the top hat sloth, crosses a neon rooftop at night one row of vents at a time. You pick a tile on each row; a safe tile moves him up and raises the multiplier, a trap ends the round. Cash out whenever you like after the first safe step. The top row is the Summit, which pays the 10,000x maximum and cashes out by itself.

Stack: Vite, React, TypeScript, PixiJS v8, GSAP, WebAudio. No wallet connect; the game runs on a $10,000 demo balance and is meant to be embedded in the Housebets casino.

## Run it

```
npm install
npm run dev            # local dev server
npm run build          # type check and production build into dist/
npx tsx scripts/sim.ts 2000000                     # math simulator, writes sim-result.txt
npx tsx scripts/verify.ts <serverSeed> <clientSeed> <nonce> <level> [hash]
npx vite preview --port 4190 --host 127.0.0.1      # then, in another shell:
npx tsx scripts/playtest.mjs 390 844 m390          # Playwright playtest, screenshots in shots/
node scripts/render-music.mjs                      # offline music render to audio/music-sample.wav
```

## Math

RTP is 96% at every cash out point on every level. With p the chance to clear one row, the multiplier after n safe steps is 0.96 / p^n, rounded down to 2 decimals (computed with integer math so the rounding is exact). Payouts are bet times multiplier, rounded down to the cent; the ledger keeps balances in integer cents.

| Level | Tiles | Traps | Safe chance | Rows to cap | Row 1 | Summit chance |
|---|---|---|---|---|---|---|
| Easy | 4 | 1 | 3/4 | 33 | 1.28x | 95.57% |
| Medium (default) | 3 | 1 | 2/3 | 23 | 1.44x | 71.83% |
| Hard | 3 | 2 | 1/3 | 9 | 2.88x | 62.99% |
| Extreme | 4 | 3 | 1/4 | 7 | 3.84x | 39.32% |

Why the Summit exists: if the last row used the same tiles as the others, the 10,000x cap would cut the multiplier on that row and walking all the way up would return far less than 96% (about 51% on Hard). So the top row is one wide ledge, and the jump works with chance m(rows minus 1) / 10,000. That keeps the full climb at 96% too. The rules screen states those chances.

`sim-result.txt` has the simulator output: 2,000,000 rounds per strategy, exact RTP next to the simulated one, hit rate, max win and standard deviation. Deep strategies (cash out at row 20 on Easy, for example) hit less than 0.1% of the time, so 2 million rounds can't pin their RTP to half a percent. The report shows the 95% range of each simulated value and checks that it agrees with the exact figure.

## Provably fair

Every round has its own server seed. The game shows its SHA256 hash before you bet and reveals the seed after the round. For block b it computes HMAC SHA256 with the server seed as key and `clientSeed:nonce:b` as the message, and reads the 32 bytes as eight big endian u32 values divided by 2^32. Row r uses values 4r to 4r+3: a Fisher Yates shuffle of the tile indexes on normal rows (the first `traps` indexes are traps), or a single comparison with the Summit chance on the top row. All rows are fixed at bet time. Same scheme as the Housebets slot. `scripts/verify.ts` re-derives any round, and the Provably fair tab has the same verifier in the browser.

## Code map

* `src/engine.ts` pure math: levels, multiplier ladders, layout from floats, payout in cents
* `src/fair.ts` HMAC stream in the browser
* `src/game.ts` round controller: balance, bet, picks, cash out, auto play bookkeeping, history
* `src/scene.ts` PixiJS scene: sky, parallax skyline, rows of vents, Hubie hop and tumble, camera
* `src/sound.ts` music engine with a lookahead scheduler, layers by height, stingers, offline render
* `src/live.ts` live feed interface. `SimulatedLive` invents players for the demo; swap `liveSource` for real casino data
* `src/fx.ts` pooled 2D particle canvas from the slot, with a smoke kind added
* `src/App.tsx` React UI

Debug query params, none of which touch balance or fairness: `?force=hat`, `?force=king`, `?force=night`, `?force=max` preview a celebration; `?musiccheck` exposes the offline music render. `?debugseed=x` fixes the server seed so the playtest knows the traps in advance; it is a test hook and the casino build should strip it.

## Celebrations

* 25x and up: HAT TIP, the banner swings in like a tipped hat
* 100x and up: ROOFTOP KING, the title drops in under turning gold rays
* 1,000x and up: OWN THE NIGHT, a flickering neon sign with a steady coin shower
* 10,000x: TOP OF THE CITY, a separate max win screen with its own stamp and fanfare

## Live table

The live feed and the big wins chat use made up players. The UI and the rules say "Simulated players, demo only". The UI only reads the `LiveSource` interface in `src/live.ts`, so the casino can plug in real data later.
