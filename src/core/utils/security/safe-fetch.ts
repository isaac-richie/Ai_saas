import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(message = 'This media address is not allowed.') {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (version === 6) {
    const v = address.toLowerCase();
    if (v === '::' || v === '::1') return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicIp(mapped[1]);
    if (/^(fc|fd|fe[89ab]|ff)/.test(v)) return false;
    return true;
  }
  return false;
}

export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError();
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new UnsafeUrlError();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0 || !addresses.every((a) => isPublicIp(a.address))) throw new UnsafeUrlError();
  return url;
}

/** Downloads a public HTTPS file without following redirects, stopping once it exceeds maxBytes. */
export async function fetchPublicBytes(raw: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  const url = await assertPublicHttpsUrl(raw);
  const response = await fetch(url, { redirect: 'error', signal });
  if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status})`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('File is too large');
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('File is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
