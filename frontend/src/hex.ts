// Browser-safe hex helpers (no Node Buffer dependency).

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().startsWith('0x') ? hex.trim().slice(2) : hex.trim();
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) {
    throw new Error('Expected a hex string.');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
