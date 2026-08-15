// Browser-side witness helpers + in-memory seal-code store.
//
// The batch secret (authenticity) and handoff secret (authorization) are used
// ONLY as zero-knowledge witness inputs inside the circuit. They never leave
// the browser, are never persisted to the ledger, and are never sent anywhere.
// Products registered in this tab keep their seal codes in memory so their
// checkpoints / verifications can be proven for the rest of the session.

import { bytesToHex, hexToBytes } from './hex';

export interface SupplyChainSecrets {
  batchSecret: Uint8Array;
  handoffSecret: Uint8Array;
}

export type PrivateState = Record<string, never>;

/** Witnesses object expected by the compiled contract (no private ledger state). */
export const createWitnesses = (secrets: SupplyChainSecrets) => ({
  batchSecret: (): [PrivateState, Uint8Array] => [{}, secrets.batchSecret],
  handoffSecret: (): [PrivateState, Uint8Array] => [{}, secrets.handoffSecret],
});

/** Fresh random 32-byte seal code, CSPRNG-backed (Web Crypto). */
export function randomSecret(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

// Domain prefix used by the contract's `authenticityCommitment` circuit. Must
// stay in sync with `pad(32, "sc:auth:")` in contracts/supply-chain.compact.
const AUTHENTICITY_DOMAIN = 'sc:auth:';
const DOMAIN_BYTES = 32;

function domainSeparator(prefix: string): Uint8Array {
  const out = new Uint8Array(DOMAIN_BYTES);
  for (let i = 0; i < prefix.length && i < DOMAIN_BYTES; i++) out[i] = prefix.charCodeAt(i);
  return out;
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Recompute the contract's domain-separated SHA-256 authenticity commitment
 * for a seal code, as a lowercase hex string. Mirrors `authenticityCommitment`
 * in contracts/supply-chain.compact so the app can cheaply pre-check a
 * consumer-supplied code against the on-chain commitment before proving.
 */
export async function authenticityCommitmentHex(secretHex: string): Promise<string> {
  const secret = hexToBytes(secretHex);
  if (secret.length !== 32) {
    throw new Error('Seal code must be exactly 32 bytes (64 hex characters).');
  }
  const domain = domainSeparator(AUTHENTICITY_DOMAIN);
  const preimage = new Uint8Array(DOMAIN_BYTES + 32);
  preimage.set(domain, 0);
  preimage.set(secret, DOMAIN_BYTES);
  return sha256Hex(preimage);
}

/** True when the given seal code commits to the given on-chain authenticity hash. */
export async function matchesAuthenticityHash(
  secretHex: string,
  onChainAuthenticityHex: string,
): Promise<boolean> {
  try {
    return (await authenticityCommitmentHex(secretHex)).toLowerCase() === onChainAuthenticityHex.toLowerCase();
  } catch {
    return false;
  }
}

// ─── Per-session in-memory secret store ────────────────────────────────────────
//
// The Node CLI persists secrets to a gitignored file; a browser cannot. Seal
// codes for products registered in this tab live in memory for the session
// (and are printed once so the owner can keep them for the QR payload).

const sessionSecrets = new Map<string, SupplyChainSecrets>();

export function storeSecrets(productId: string, secrets: SupplyChainSecrets): void {
  sessionSecrets.set(productId, secrets);
}

export function getSecrets(productId: string): SupplyChainSecrets | undefined {
  return sessionSecrets.get(productId);
}
