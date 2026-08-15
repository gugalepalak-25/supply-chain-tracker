// Direct Midnight contract client for the browser.
//
// Reads the public ledger straight from the public Preprod indexer; writes
// prove/balance/submit through the connected Lace wallet. There is no backend
// API server involved anymore (see `api.ts`, which delegates here).
//
// Seal codes (batch/handoff secrets) only ever exist as ZK witness inputs and
// in this tab's memory. On-chain, only their SHA-256 commitments are stored.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as SupplyChain from '../../contracts/managed/supply-chain/contract/index.js';
import type { Contract as SupplyChainContract } from '../../contracts/managed/supply-chain/contract/index.js';

import { CONTRACT_ADDRESS, INDEXER_URL, INDEXER_WS_URL, NETWORK_ID, ZK_CONFIG_BASE } from './config';
import { bytesToHex, hexToBytes } from './hex';
import {
  createInMemoryPrivateStateProvider,
  createProofProviderForWallet,
  createWalletBridge,
} from './providers';
import {
  createWitnesses,
  getSecrets,
  matchesAuthenticityHash,
  randomSecret,
  storeSecrets,
  type SupplyChainSecrets,
} from './witnesses';

// midnight-js requires a configured network id before any wallet/contract
// operation (see findDeployedContract → getNetworkId()). Default to the config;
// useLaceWallet re-aligns it to the wallet's actual network on connect.
setNetworkId(NETWORK_ID);

// Must match the privateStateId used at deploy time (src/deploy.ts).
const PRIVATE_STATE_ID = 'supplyChainPrivateState';

const STAGE_NAMES = ['Manufactured', 'In Transit', 'At Distributor', 'Delivered'];

// ─── Types (same shapes the API server used to produce) ───────────────────────

export interface JourneyEvent {
  eventIndex: number;
  stage: number;
  stageName: string;
  location: string;
  note: string;
}

export interface Product {
  productId: string;
  name: string;
  manufacturer: string;
  stage: number;
  stageName: string;
  location: string;
  eventCount: number;
  authenticityHash: string;
  authorizationHash: string;
  verifications: number;
  events: JourneyEvent[];
}

export interface HealthInfo {
  ok: boolean;
  network: string;
  contractAddress: string;
  products: number;
}

export interface RegisterResult {
  productId: string;
  txId: string;
  blockHeight: number;
  batchSecretHex: string;
  handoffSecretHex: string;
}

export interface TxResult {
  productId: string;
  txId: string;
  blockHeight: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

let walletApi: ConnectedAPI | null = null;

// Shared witness holder — updated with the right product's secrets before each
// transaction, exactly like the CLI's in-memory holder.
const secretHolder: SupplyChainSecrets = {
  batchSecret: new Uint8Array(32),
  handoffSecret: new Uint8Array(32),
};

// FetchZkConfigProvider requires an absolute URL, so resolve a possibly-relative
// ZK_CONFIG_BASE (default '/managed/supply-chain') against the page origin.
const zkConfigProvider = new FetchZkConfigProvider<string>(
  new URL(ZK_CONFIG_BASE, window.location.href).toString(),
  (...args) => fetch(...args),
);

const publicDataProvider = indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL, WebSocket as unknown as never);

const compiledContract: any = (
  CompiledContract.make(
    'supply-chain',
    SupplyChain.Contract as unknown as typeof SupplyChainContract,
  ) as any
).pipe(
  (CompiledContract.withWitnesses as any)(createWitnesses(secretHolder)),
  (CompiledContract.withCompiledFileAssets as any)(''),
);

let deployedPromise: Promise<any> | null = null;

/** Forget the connected contract instance (e.g. when the wallet disconnects). */
export function resetDeployedContract(): void {
  deployedPromise = null;
}

/** Set (or clear) the connected wallet used for writes. */
export function setWalletApi(api: ConnectedAPI | null): void {
  walletApi = api;
  resetDeployedContract();
}

function requireWallet(): ConnectedAPI {
  if (!walletApi) {
    throw new Error('Connect your wallet to send transactions.');
  }
  return walletApi;
}

async function getDeployed(): Promise<any> {
  if (!deployedPromise) {
    deployedPromise = (async () => {
      const api = requireWallet();
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
        compiledContract: compiledContract as any,
        contractAddress: CONTRACT_ADDRESS,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });
    })();
  }
  return deployedPromise;
}

// ─── Ledger reads (no wallet required) ────────────────────────────────────────

type Ledger = ReturnType<typeof SupplyChain.ledger>;

async function readLedger(): Promise<Ledger | null> {
  const state = await publicDataProvider.queryContractState(CONTRACT_ADDRESS);
  return state ? SupplyChain.ledger(state.data) : null;
}

function shortId(hex: string): string {
  return hex.length > 18 ? `${hex.slice(0, 8)}…${hex.slice(-8)}` : hex;
}

function toProductJson(ledger: Ledger, id: string, p: any): Product {
  const events = Array.from(ledger.history.lookup(id) ?? []).map((ev: any) => ({
    eventIndex: Number(ev.eventIndex),
    stage: Number(ev.stage),
    stageName: STAGE_NAMES[Number(ev.stage)] ?? `UNKNOWN(${ev.stage})`,
    location: ev.location,
    note: ev.note,
  }));
  return {
    productId: id,
    name: p.name,
    manufacturer: p.manufacturer,
    stage: Number(p.stage),
    stageName: STAGE_NAMES[Number(p.stage)] ?? `UNKNOWN(${p.stage})`,
    location: p.location,
    eventCount: Number(p.eventCount),
    authenticityHash: shortId(bytesToHex(p.authenticityHash)),
    authorizationHash: shortId(bytesToHex(p.authorizationHash)),
    verifications: Number(ledger.verifications.member(id) ? ledger.verifications.lookup(id) : 0n),
    events,
  };
}

/** Full (untruncated) on-chain authenticity commitment for a product, or null. */
async function productAuthenticityHash(productId: string): Promise<string | null> {
  const ledger = await readLedger();
  if (!ledger || !ledger.products.member(productId)) return null;
  return bytesToHex(ledger.products.lookup(productId).authenticityHash);
}

// ─── Public API (used by api.ts / App.tsx) ────────────────────────────────────

export const chain = {
  async health(): Promise<HealthInfo> {
    try {
      const ledger = await readLedger();
      return {
        ok: ledger !== null,
        network: NETWORK_ID,
        contractAddress: CONTRACT_ADDRESS,
        products: ledger ? Number(ledger.products.size()) : 0,
      };
    } catch {
      return { ok: false, network: NETWORK_ID, contractAddress: CONTRACT_ADDRESS, products: 0 };
    }
  },

  async products(): Promise<Product[]> {
    const ledger = await readLedger();
    if (!ledger) return [];
    const out: Product[] = [];
    for (const [id, p] of ledger.products) {
      out.push(toProductJson(ledger, id, p));
    }
    return out;
  },

  async product(productId: string): Promise<Product> {
    const all = await chain.products();
    const found = all.find((p) => p.productId === productId);
    if (!found) throw new Error(`Product "${productId}" not found on-chain.`);
    return found;
  },

  async register(input: {
    productId: string;
    name: string;
    manufacturer: string;
    location: string;
    note?: string;
    actor?: string;
  }): Promise<RegisterResult> {
    requireWallet();
    const { productId, name, manufacturer, location } = input;
    const note = input.note?.trim() || 'Manufactured';

    const batchSecret = randomSecret();
    const handoffSecret = randomSecret();
    secretHolder.batchSecret = batchSecret;
    secretHolder.handoffSecret = handoffSecret;
    storeSecrets(productId, { batchSecret, handoffSecret });

    const deployed = await getDeployed();
    const tx = await deployed.callTx.registerProduct(productId, name, manufacturer, location, note);

    return {
      productId,
      txId: tx.public.txId,
      blockHeight: Number(tx.public.blockHeight),
      batchSecretHex: bytesToHex(batchSecret),
      handoffSecretHex: bytesToHex(handoffSecret),
    };
  },

  async checkpoint(productId: string, location: string, note?: string, actor?: string): Promise<TxResult> {
    requireWallet();
    const secrets = getSecrets(productId);
    if (!secrets) {
      throw new Error(
        `No seal codes for "${productId}" in this session. Register it here first, or use the CLI to move a product created elsewhere.`,
      );
    }
    secretHolder.batchSecret = secrets.batchSecret;
    secretHolder.handoffSecret = secrets.handoffSecret;

    const checkpointNote = actor ? `${note ?? 'Checkpoint'} · by ${actor}` : (note ?? 'Checkpoint');
    const deployed = await getDeployed();
    const tx = await deployed.callTx.recordCheckpoint(productId, location, checkpointNote);
    return { productId, txId: tx.public.txId, blockHeight: Number(tx.public.blockHeight) };
  },

  async verify(productId: string, _actor?: string): Promise<TxResult & { authentic: boolean }> {
    requireWallet();
    const secrets = getSecrets(productId);
    if (!secrets) {
      throw new Error(
        `No seal codes for "${productId}" in this session. Register it here first, or paste the seal code below.`,
      );
    }
    secretHolder.batchSecret = secrets.batchSecret;
    secretHolder.handoffSecret = secrets.handoffSecret;

    const deployed = await getDeployed();
    const tx = await deployed.callTx.verifyAuthenticity(productId);
    return { productId, authentic: true, txId: tx.public.txId, blockHeight: Number(tx.public.blockHeight) };
  },

  /**
   * Consumer flow: check a code from the product/QR against the on-chain
   * commitment, then prove knowledge of the code in zero-knowledge.
   */
  async verifyWithSealCode(
    productId: string,
    sealCode: string,
  ): Promise<{ productId: string; authentic: boolean; txId?: string; blockHeight?: number }> {
    if (!/^[0-9a-fA-F]{64}$/.test(sealCode.trim())) {
      return { productId, authentic: false };
    }
    const onChainHash = await productAuthenticityHash(productId);
    if (onChainHash === null) {
      throw new Error(`Product "${productId}" not found on-chain.`);
    }
    if (!(await matchesAuthenticityHash(sealCode, onChainHash))) {
      return { productId, authentic: false };
    }

    requireWallet();
    secretHolder.batchSecret = hexToBytes(sealCode);
    secretHolder.handoffSecret = new Uint8Array(32);

    const deployed = await getDeployed();
    const tx = await deployed.callTx.verifyAuthenticity(productId);
    return { productId, authentic: true, txId: tx.public.txId, blockHeight: Number(tx.public.blockHeight) };
  },
};
