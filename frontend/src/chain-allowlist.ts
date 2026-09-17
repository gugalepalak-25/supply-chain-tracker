// Private Allowlist Access — Midnight Network (Frontend)
//
// Prove membership in an allowlist WITHOUT revealing which member you are.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as Allowlist from '../contracts/private-allowlist/contract/index.js';

import { INDEXER_URL, INDEXER_WS_URL, ALLOWLIST_CONTRACT_ADDRESS } from './config';
import { bytesToHex, hexToBytes } from './hex';
import {
  createInMemoryPrivateStateProvider,
  createProofProviderForWallet,
  createWalletBridge,
} from './providers';

// ─── Configuration ─────────────────────────────────────────────────────────

export function getAllowlistContractAddress(): string {
  return ALLOWLIST_CONTRACT_ADDRESS;
}

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
const compiledContract = CompiledContract.make('private-allowlist', Allowlist.Contract).pipe(
  CompiledContract.withWitnesses(createAllowlistWitnesses(secretHolder)),
  CompiledContract.withCompiledFileAssets(''),
);

async function getDeployedContract(wallet: ConnectedAPI) {
  if (deployedPromise) return deployedPromise;

  deployedPromise = (async () => {
    const zkConfig = new FetchZkConfigProvider('');
    const [bridge, proofProvider] = await Promise.all([
      createWalletBridge(wallet),
      createProofProviderForWallet(wallet, zkConfig),
    ]);
    const providers = {
      privateStateProvider: createInMemoryPrivateStateProvider(),
      publicDataProvider: indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL),
      zkConfigProvider: zkConfig,
      proofProvider,
      walletProvider: bridge.walletProvider,
      midnightProvider: bridge.midnightProvider,
    };
    return findDeployedContract(providers as any, {
      compiledContract: compiledContract as any,
      contractAddress: ALLOWLIST_CONTRACT_ADDRESS,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
  })();

  return deployedPromise;
}

// ─── Ledger Reads (no wallet required) ────────────────────────────────────

export async function readAllowlist(): Promise<AllowlistMember[]> {
  const publicDataProvider = indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL);
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
  const publicDataProvider = indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL);
  const state = await publicDataProvider.queryContractState(ALLOWLIST_CONTRACT_ADDRESS);
  if (!state || !state.data) return 0;

  const ledger = Allowlist.ledger(state.data);
  return Number(ledger.memberCount);
}

export async function readAccessLog(): Promise<AccessEvent[]> {
  const publicDataProvider = indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL);
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
  wallet: ConnectedAPI,
  label: string,
): Promise<{ secret: string; commitment: string }> {
  if (!ALLOWLIST_CONTRACT_ADDRESS) {
    throw new Error('Allowlist contract not deployed. Set VITE_ALLOWLIST_CONTRACT_ADDRESS.');
  }
  const contract = await getDeployedContract(wallet);
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
  wallet: ConnectedAPI,
  secretHex: string,
): Promise<AccessEvent> {
  const contract = await getDeployedContract(wallet);
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
  wallet: ConnectedAPI,
  commitmentHex: string,
): Promise<void> {
  const contract = await getDeployedContract(wallet);
  await contract.callTx.removeMember(hexToBytes(commitmentHex));
}
