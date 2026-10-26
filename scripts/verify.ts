// Re-derive a round from its seeds. Run:
//   npx tsx scripts/verify.ts <serverSeed> <clientSeed> <nonce> <easy|medium|hard|extreme> [serverSeedHash]
// Prints the server seed hash (compare with the hash shown before the round) and the trap map, bottom row first.
import { createHash, createHmac } from 'node:crypto';
import { LEVELS, buildLayout, floatsNeeded, isSummit, type LevelId } from '../src/engine.ts';

const [serverSeed, clientSeed, nonceS, levelS, shownHash] = process.argv.slice(2);
if (!serverSeed || clientSeed === undefined || !nonceS || !levelS || !(levelS in LEVELS)) {
  console.log('usage: npx tsx scripts/verify.ts <serverSeed> <clientSeed> <nonce> <easy|medium|hard|extreme> [serverSeedHash]'); process.exit(1);
}
const lv = LEVELS[levelS as LevelId]; const nonce = Number(nonceS);
const hash = createHash('sha256').update(serverSeed).digest('hex');
console.log('server seed hash', hash);
if (shownHash) console.log(hash === shownHash ? 'hash matches the one shown before the round' : 'HASH DOES NOT MATCH');
const fl: number[] = [];
for (let b = 0; fl.length < floatsNeeded(lv); b++) { const h = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${b}`).digest(); for (let i = 0; i < 32; i += 4) fl.push(h.readUInt32BE(i) / 2 ** 32); }
const lay = buildLayout(lv, fl);
console.log(`${lv.name}, ${lv.rows} rows. S = safe, X = trap, tiles numbered from the left starting at 1`);
lay.forEach((row, r) => console.log(`row ${String(r + 1).padStart(2)}  ${isSummit(lv, r) ? (row[0] ? 'SUMMIT X (miss)' : 'SUMMIT S (made it)') : row.map(t => (t ? 'X' : 'S')).join(' ')}`));
console.log('JSON', JSON.stringify(lay.map(r => r.map(t => (t ? 1 : 0)))));
