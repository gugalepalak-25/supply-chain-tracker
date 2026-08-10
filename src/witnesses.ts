// Witness implementations + per-product secret helpers for the Supply Chain
// Tracker contract.
//
// PRIVACY GUARANTEE: the batch secret and handoff secret are JS-side values
// that are handed to the proof builder as WITNESS INPUTS. They are consumed
// inside the zero-knowledge circuit (which only ever writes their SHA-256
// commitments to the ledger) and are never persisted on-chain, never logged,
// and never rendered in the UI.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface SupplyChainSecrets {
  /** Authenticity seal code — proved (never revealed) by verifyAuthenticity. */
  batchSecret: Uint8Array;
  /** Transfer authorization token — proved (never revealed) by recordCheckpoint. */
  handoffSecret: Uint8Array;
}

export type PrivateState = Record<string, never>;

/**
 * Build the witnesses object expected by the compiled contract. Each witness
 * returns the *next* private state and the value to feed into the circuit.
 * This contract keeps no private ledger state, so the private state is the
 * empty object.
 */
export const createWitnesses = (secrets: SupplyChainSecrets) => ({
  batchSecret: (): [PrivateState, Uint8Array] => [{}, secrets.batchSecret],
  handoffSecret: (): [PrivateState, Uint8Array] => [{}, secrets.handoffSecret],
});

/** Generate a fresh random 32-byte secret as a Uint8Array. */
export function randomSecret(): Uint8Array {
  return crypto.randomBytes(32);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().startsWith('0x') ? hex.trim().slice(2) : hex.trim();
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) {
    throw new Error('Secret must be a hex string (e.g. 64 hex chars for 32 bytes).');
  }
  return Uint8Array.from(Buffer.from(clean, 'hex'));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

// Domain prefix used by the contract's `authenticityCommitment` circuit. Must
// stay in sync with `pad(32, "sc:auth:")` in contracts/supply-chain.compact.
const AUTHENTICITY_DOMAIN = 'sc:auth:';
const DOMAIN_BYTES = 32;

/**
 * Recompute the contract's domain-separated SHA-256 authenticity commitment
 * for a seal code, as a lowercase hex string.
 *
 * Mirrors `authenticityCommitment` in contracts/supply-chain.compact so the
 * server can cheaply pre-check a consumer-supplied code against the on-chain
 * commitment before spending proof-server time. The ZK proof itself is still
 * produced by the circuit and submitted to the ledger — this helper is a fast
 * "fail before proving" guard, not a substitute for the proof.
 */
export function authenticityCommitmentHex(secretHex: string): string {
  const domain = Buffer.concat([
    Buffer.from(AUTHENTICITY_DOMAIN, 'utf8'),
    Buffer.alloc(DOMAIN_BYTES - Buffer.byteLength(AUTHENTICITY_DOMAIN)),
  ]);
  const secret = hexToBytes(secretHex);
  if (secret.length !== 32) {
    throw new Error('Seal code must be exactly 32 bytes (64 hex characters).');
  }
  return crypto.createHash('sha256').update(Buffer.concat([domain, Buffer.from(secret)])).digest('hex');
}

/**
 * True when the given seal code commits to the given on-chain authenticity
 * hash — i.e. the consumer's code is the genuine one for that product.
 */
export function matchesAuthenticityHash(secretHex: string, onChainAuthenticityHex: string): boolean {
  try {
    return authenticityCommitmentHex(secretHex).toLowerCase() === onChainAuthenticityHex.toLowerCase();
  } catch {
    return false;
  }
}

// ─── CLI secret store ─────────────────────────────────────────────────────────
//
// The interactive CLI keeps the secrets it generates on disk (gitignored) so
// a product's checkpoints / verifications can be recorded in later sessions.
// The frontend instead keeps secrets only in memory for the current tab.

export interface StoredSecrets {
  productId: string;
  batchSecretHex: string;
  handoffSecretHex: string;
  createdAt: string;
}

const SECRETS_FILE = '.supply-chain-secrets.json';

function secretsPath(cwd?: string): string {
  return path.join(cwd ?? process.cwd(), SECRETS_FILE);
}

export function loadStoredSecrets(cwd?: string): StoredSecrets[] {
  const p = secretsPath(cwd);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as StoredSecrets[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveStoredSecrets(productId: string, secrets: SupplyChainSecrets, cwd?: string): void {
  const p = secretsPath(cwd);
  const existing = loadStoredSecrets(cwd).filter((s) => s.productId !== productId);
  existing.push({
    productId,
    batchSecretHex: bytesToHex(secrets.batchSecret),
    handoffSecretHex: bytesToHex(secrets.handoffSecret),
    createdAt: new Date().toISOString(),
  });
  fs.writeFileSync(p, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600 });
}

export function getStoredSecrets(productId: string, cwd?: string): StoredSecrets | undefined {
  return loadStoredSecrets(cwd).find((s) => s.productId === productId);
}
