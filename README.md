# Hubie's Night Walk

A climb and cash out game for Housebets. Hubie, the Housebets mascot, walks over a rainy rooftop at night, one row of iron hatches at a time. You pick a tile on each row; a safe tile moves him up and raises the multiplier, a trap ends the round. Cash out whenever you like after the first safe step. The top row is the Summit, which pays the 10,000x maximum and cashes out by itself.

Stack: Vite, React, TypeScript, PixiJS v8, GSAP, WebAudio. No wallet connect; the game runs on a $10,000 demo balance and is meant to be embedded in the Housebets casino.

## Look

Hubie is drawn in code, an original illustration of the Housebets mascot. The official art was studied for identity only (what he looks like), nothing was traced, cut out or copied: a chunky three toed sloth with a big round head, warm brown fur, a cream face mask, dark eye bands running from each eye toward the ear, half closed sleepy eyes and a gentle smile, a navy top hat with an orange band and a gold H buckle, a navy tailcoat with orange piping and tails, an orange waistcoat with gold buttons, a white shirt and an orange bow tie. For the night scene he has a cyan rim light on his left side from the billboard, a wet shine on the hat and fur, his collar turned up against the rain, and no scooter: he walks and hops on foot.

`src/hubieArt.ts` holds every part as an SVG string with gradients and dark outlines (fur tufts are generated): tail, coat tails with the raised collar, back arm, two legs with three clawed feet, torso with waistcoat and bow tie, head, eyes in four states (sleepy, blink, wide, happy), mouth in three (smile, grin, surprised O), top hat, front arm with three long hooked claws. `src/hubie.ts` rasterises each part once at 4 pixels per unit and hangs it on its joint. Animations: idle (breathing, blinking, slow head sway, tail sway), walk (alternating legs, arm swing, bob), hop (anticipation squash, stretch with arms out and legs tucked, landing squash, hat bounce), win (hat tip with a grin and a small fist pump), big win (jumps with both arms up), fall (wide eyes, hat flies off, tumble through the cracked hatch) and walking back on after a respawn. A safe hatch keeps glowing cyan claw prints. Tile multipliers are drawn on a layer above Hubie so he never hides the number you need. The header badge (bust), intro, celebrations, favicon and touch icon use the same parts. `npx tsx tools/hubie-sheet.ts` renders the pose sheet to `shots/hubie-sheet.png`, the side by side with the references and the icons.

## Audio

`src/sound.ts` plays a procedural noir jazz groove over a CC0 rain recording and synthetic vinyl crackle. It runs on a swung triplet grid at 82 BPM, plus 3 BPM per intensity level, and has five sections: intro (rhodes and rain), groove A (two feel upright bass, brushes, ride, Charleston rhodes comping on Dm9, G13, Cmaj9, A7b13), groove B (walking bass, pad, vibraphone motif on Bbmaj7#11, A7alt, Dm9, Gm9), tension (a half step up, pedal bass, busier drums, brighter filter) and release (four calm bars after a cash out or a fall). The rhodes is a two operator FM voice with rootless voicings. The vibraphone motif comes from scale rules and a seeded random generator, and each phrase develops it (transposed, inverted, displaced, answered by the rhodes), so the loop never repeats exactly. Each cash out tier has its own stinger. Audio starts on the first user gesture; the mute toggle and volume slider fade the master gain. `audio/music-check.txt` has the offline render analysis and `CREDITS.md` lists sources and licenses.

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
* `src/scene.ts` PixiJS scene: sky, parallax skyline, rows of hatches, Hubie hop and tumble, camera
* `src/hubieArt.ts` Hubie drawn as SVG parts, `src/hubie.ts` the Pixi rig and animation
* `src/sound.ts` music engine with a lookahead scheduler, sections and layers by height, stingers, offline render
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
