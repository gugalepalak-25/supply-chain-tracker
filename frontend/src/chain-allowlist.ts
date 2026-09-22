// Private Allowlist Access — Midnight Network (Frontend)
//
// Prove membership in an allowlist WITHOUT revealing which member you are.

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as Allowlist from '../contracts/private-allowlist/contract/index.js';

import { INDEXER_URL, INDEXER_WS_URL, ALLOWLIST_CONTRACT_ADDRESS } from './config';
import { bytesToHex, hexToBytes } from './hex';
import { getConnectedWallet } from './chain';
import {
  createInMemoryPrivateStateProvider,
  createProofProviderForWallet,
  createWalletBridge,
} from './providers';

// ─── Configuration ─────────────────────────────────────────────────────────

/** Path where prepare.mjs copies the private-allowlist zk assets. */
const ALLOWLIST_ZK_CONFIG_BASE = '/managed/private-allowlist';

// FetchZkConfigProvider requires an absolute URL (an empty base throws
// "Failed to construct 'URL': Invalid URL").
const zkConfigProvider = new FetchZkConfigProvider<string>(
  new URL(ALLOWLIST_ZK_CONFIG_BASE, window.location.href).toString(),
  (...args) => fetch(...args),
);

const publicDataProvider = indexerPublicDataProvider(
  INDEXER_URL,
  INDEXER_WS_URL,
  WebSocket as unknown as never,
);

export function isAllowlistDeployed(): boolean {
  return ALLOWLIST_CONTRACT_ADDRESS.length > 0;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AllowlistMember {
  label: string;
  addedAt: number;
  active: boolean;
  commitment: string;
}

export interface AccessEvent {
  memberHash: string;
  timestamp: number;
  token: string;
}

// ─── Witnesses ─────────────────────────────────────────────────────────────

interface AllowlistSecrets {
  memberSecret: Uint8Array;
}

const secretHolder: AllowlistSecrets = {
  memberSecret: new Uint8Array(32),
};

function createAllowlistWitnesses(secrets: AllowlistSecrets) {
  return {
    memberSecret: (): [Record<string, never>, Uint8Array] => [{}, secrets.memberSecret],
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function randomSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function computeMemberCommitment(secret: Uint8Array): Promise<string> {
  const domain = new TextEncoder().encode('sc:allowlist:');
  const combined = new Uint8Array(domain.length + secret.length);
  combined.set(domain);
  combined.set(secret, domain.length);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// ─── Contract Connection ───────────────────────────────────────────────────

let deployedPromise: Promise<any> | null = null;

const PRIVATE_STATE_ID = 'allowlistPrivateState';

function requireAllowlistWallet() {
  const api = getConnectedWallet();
  if (!api) {
    throw new Error('Connect your wallet to send transactions.');
  }
  return api;
}

async function getDeployedContract() {
  if (deployedPromise) return deployedPromise;

  deployedPromise = (async () => {
    const api = requireAllowlistWallet();
    const [bridge, proofProvider] = await Promise.all([
      createWalletBridge(api),
      createProofProviderForWallet(api, zkConfigProvider),
    ]);
    const providers = {
      privateStateProvider: createInMemoryPrivateStateProvider(),
      publicDataProvider,
      zkConfigProvider,
      proofProvider,
      walletProvider: bridge.walletProvider,
      midnightProvider: bridge.midnightProvider,
    };
    return findDeployedContract(providers as any, {
      compiledContract: CompiledContract.make('private-allowlist', Allowlist.Contract).pipe(
        CompiledContract.withWitnesses(createAllowlistWitnesses(secretHolder)),
        CompiledContract.withCompiledFileAssets(''),
      ) as any,
      contractAddress: ALLOWLIST_CONTRACT_ADDRESS,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
  })();

  return deployedPromise;
}

/** Forget the cached contract instance (e.g. when the wallet disconnects). */
export function resetAllowlistContract(): void {
  deployedPromise = null;
}

// ─── Ledger Reads (no wallet required) ────────────────────────────────────

export async function readAllowlist(): Promise<AllowlistMember[]> {
  const state = await publicDataProvider.queryContractState(ALLOWLIST_CONTRACT_ADDRESS);
  if (!state || !state.data) return [];

  const ledger = Allowlist.ledger(state.data);
  const members: AllowlistMember[] = [];

  for (const [key, info] of ledger.members) {
    members.push({
      label: info.label,
      addedAt: Number(info.addedAt),
      active: info.active === BigInt(1),
      commitment: bytesToHex(key),
    });
  }

  return members;
}

export async function readMemberCount(): Promise<number> {
  const state = await publicDataProvider.queryContractState(ALLOWLIST_CONTRACT_ADDRESS);
  if (!state || !state.data) return 0;

  const ledger = Allowlist.ledger(state.data);
  return Number(ledger.memberCount);
}

export async function readAccessLog(): Promise<AccessEvent[]> {
  const state = await publicDataProvider.queryContractState(ALLOWLIST_CONTRACT_ADDRESS);
  if (!state || !state.data) return [];

  const ledger = Allowlist.ledger(state.data);
  const events: AccessEvent[] = [];
  for (const ev of ledger.accessLog) {
    events.push({
      memberHash: bytesToHex(ev.memberHash),
      timestamp: Number(ev.timestamp),
      token: bytesToHex(ev.token),
    });
  }
  return events;
}

// ─── Circuit Calls (require wallet) ───────────────────────────────────────

export async function addMember(
  label: string,
): Promise<{ secret: string; commitment: string }> {
  if (!ALLOWLIST_CONTRACT_ADDRESS) {
    throw new Error('Allowlist contract not deployed. Set VITE_ALLOWLIST_CONTRACT_ADDRESS.');
  }
  const contract = await getDeployedContract();
  const secret = randomSecret();
  const commitment = await computeMemberCommitment(secret);

  secretHolder.memberSecret = secret;

  await contract.callTx.addMember(label, hexToBytes(commitment));

  return {
    secret: bytesToHex(secret),
    commitment,
  };
}

export async function proveMembership(
  secretHex: string,
): Promise<AccessEvent> {
  if (!ALLOWLIST_CONTRACT_ADDRESS) {
    throw new Error('Allowlist contract not deployed.');
  }
  const contract = await getDeployedContract();
  const secret = hexToBytes(secretHex);
  const token = randomSecret();

  secretHolder.memberSecret = secret;

  await contract.callTx.proveMembership(token);

  const commitment = await computeMemberCommitment(secret);
  return {
    memberHash: commitment,
    timestamp: Date.now(),
    token: bytesToHex(token),
  };
}

export async function removeMember(
  commitmentHex: string,
): Promise<void> {
  if (!ALLOWLIST_CONTRACT_ADDRESS) {
    throw new Error('Allowlist contract not deployed.');
  }
  const contract = await getDeployedContract();
  await contract.callTx.removeMember(hexToBytes(commitmentHex));
}
