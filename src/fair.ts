// Provably fair stream, same scheme as the Housebets slot:
// block b bytes = HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${b}`),
// read as eight big endian u32 values, each divided by 2^32.
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(s: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export function randomHex(bytes: number) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return hex(a.buffer); }
export async function hmacFloats(serverSeed: string, clientSeed: string, nonce: number, count: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const blocks = Math.ceil(count / 8);
  const bufs = await Promise.all(Array.from({ length: blocks }, (_, b) => crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${b}`))));
  const out: number[] = [];
  for (const buf of bufs) { const v = new DataView(buf); for (let i = 0; i < 32; i += 4) out.push(v.getUint32(i, false) / 2 ** 32); }
  return out.slice(0, count);
}
