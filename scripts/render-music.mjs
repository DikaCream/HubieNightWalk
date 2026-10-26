// Renders the music engine offline (OfflineAudioContext in Chromium) to audio/music-sample.wav,
// then reports peak, clipping, loudness per section and the beat period found in the energy envelope.
import { chromium } from 'playwright';
import fs from 'node:fs';
const SECONDS = 60;
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
await p.addInitScript(() => localStorage.setItem('hnw-intro', '2'));
await p.goto('http://127.0.0.1:4190/?musiccheck'); await p.waitForFunction(() => window.__renderMusic, null, { timeout: 30000 });
const b64 = await p.evaluate(async s => {
  const buf = await window.__renderMusic(s); const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new Int16Array(L.length * 2); let clip = 0, peak = 0;
  for (let i = 0; i < L.length; i++) { for (const [k, v] of [[0, L[i]], [1, R[i]]]) { const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clip++; out[i * 2 + k] = Math.max(-32768, Math.min(32767, Math.round(v * 32767))); } }
  let bin = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return JSON.stringify({ data: btoa(bin), rate: buf.sampleRate, clip, peak });
}, SECONDS);
await b.close();
const { data, rate, clip, peak } = JSON.parse(b64); const pcm = Buffer.from(data, 'base64');
const hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(rate, 24); hdr.writeUInt32LE(rate * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
fs.mkdirSync('audio', { recursive: true }); fs.writeFileSync('audio/music-sample.wav', Buffer.concat([hdr, pcm]));
// analysis on the left channel
const n = pcm.length / 4; const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = pcm.readInt16LE(i * 4) / 32768;
const lines = [`music-sample.wav: ${SECONDS}s, ${rate} Hz, peak ${peak.toFixed(3)} (${(20 * Math.log10(peak)).toFixed(1)} dBFS), samples at full scale ${clip}`];
const sec = Math.floor(n / rate); const rms = []; for (let s = 0; s < sec; s++) { let a = 0; for (let i = s * rate; i < (s + 1) * rate; i++) a += x[i] * x[i]; rms.push(Math.sqrt(a / rate)); }
lines.push('RMS dBFS per second: ' + rms.map(v => (20 * Math.log10(v + 1e-9)).toFixed(0)).join(' '));
// beat period: autocorrelation of a 10 ms energy envelope, per 10 s window (intensity steps every 10 s)
const hop = Math.round(rate / 100); const env = []; for (let i = 0; i + hop < n; i += hop) { let a = 0; for (let j = 0; j < hop; j++) a += Math.abs(x[i + j]); env.push(a / hop); }
const d = env.map((v, i) => Math.max(0, v - (env[i - 1] ?? v)));
for (let w = 0; w < 5; w++) {
  const seg = d.slice(w * 1000, (w + 1) * 1000); const m = seg.reduce((a, b) => a + b, 0) / seg.length; const z = seg.map(v => v - m);
  let best = 0, bl = 0; const ac0 = z.reduce((a, v) => a + v * v, 0);
  for (let lag = 25; lag <= 160; lag++) { let a = 0; for (let i = 0; i + lag < z.length; i++) a += z[i] * z[i + lag]; if (a > best) { best = a; bl = lag; } }
  lines.push(`window ${w * 10}s to ${(w + 1) * 10}s (intensity ${w}): strongest onset period ${(bl * 10)} ms = ${(6000 / bl).toFixed(1)} BPM if quarter notes, periodicity strength ${(best / ac0).toFixed(2)}`);
}
lines.push('Last 10 s hold the trap stinger and cash out stingers for tiers 0, 2 and 4.');
console.log(lines.join('\n')); fs.writeFileSync('audio/music-check.txt', lines.join('\n') + '\n');
