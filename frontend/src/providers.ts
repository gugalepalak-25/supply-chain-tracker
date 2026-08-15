// Browser-side Midnight providers.
//
// These adapt the connected wallet (via the DApp Connector API) into the
// provider objects `midnight-js` expects:
//
//   - walletProvider / midnightProvider  — a bridge to the wallet's own
//     shielding, balancing, signing and relaying. The DApp builds the
//     transaction, then the wallet adds fees/Zswap inputs and broadcasts.
//   - proofProvider                     — where ZK proofs are produced.
//     Lace does NOT implement `getProvingProvider()`, so for Lace we fall back
//     to the user's configured proof server (see `getConfiguration()`). Wallets
//     that DO implement it (e.g. 1AM) get wallet-delegated proving.
//   - privateStateProvider              — in-memory store. This contract has no
//     private ledger state; midnight-js still uses the provider to keep the
//     contract's signing key, so we keep it in memory for the session.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { dappConnectorProvingProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import {
  Binding,
  Proof,
  SignatureEnabled,
  Transaction,
  type FinalizedTransaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  createProofProvider,
  type MidnightProvider,
  type PrivateStateId,
  type PrivateStateProvider,
  type ProofProvider,
  type UnboundTransaction,
  type WalletProvider,
  type ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { bytesToHex, hexToBytes } from './hex';
import { PROOF_SERVER_URL } from './config';

// ─── Wallet bridge ────────────────────────────────────────────────────────────

export interface WalletBridge {
  walletProvider: WalletProvider;
  midnightProvider: MidnightProvider;
}

/**
 * Wrap the connected wallet's ConnectedAPI in WalletProvider/MidnightProvider.
 * Shielded addresses are fetched up-front so `getCoinPublicKey()` can stay a
 * synchronous call, matching the interface.
 */
export async function createWalletBridge(api: ConnectedAPI): Promise<WalletBridge> {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses();

  return {
    walletProvider: {
      getCoinPublicKey: () => shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
      async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> {
        const serialized = bytesToHex(tx.serialize());
        const { tx: balancedHex } = await api.balanceUnsealedTransaction(serialized);
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          hexToBytes(balancedHex),
        );
      },
    },
    midnightProvider: {
      async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
        await api.submitTransaction(bytesToHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
}

// ─── Proof provider selection ─────────────────────────────────────────────────

/**
 * Build a transaction-level ProofProvider for the connected wallet.
 *
 * Wallets implementing `getProvingProvider()` (e.g. 1AM) prove inside the
 * wallet. Lace does not expose that method, so we use the app-configured
 * proof server (VITE_PROOF_SERVER_URL, default http://127.0.0.1:6300). The
 * wallet's own `proverServerUri` is intentionally NOT honored — in practice it
 * points at a URI unreachable from the page, and the local server always works.
 */
export async function createProofProviderForWallet(
  api: ConnectedAPI,
  zkConfigProvider: ZKConfigProvider<string>,
): Promise<ProofProvider> {
  if (typeof api.getProvingProvider === 'function') {
    const provingProvider = await dappConnectorProvingProvider(api, zkConfigProvider);
    return createProofProvider(provingProvider);
  }

  let proofServerUrl = PROOF_SERVER_URL;
  try {
    const config = await api.getConfiguration();
    if (config.proverServerUri) {
      console.warn(
        `[proof-server] wallet advertises proverServerUri=${config.proverServerUri}; using app-configured ${PROOF_SERVER_URL}`,
      );
    }
  } catch {
    // Ignore: fall back to the configured default.
  }
  console.warn(`[proof-server] using ${proofServerUrl}`);
  return httpClientProofProvider(proofServerUrl, zkConfigProvider);
}

// ─── In-memory private state provider ─────────────────────────────────────────

/**
 * Session-scoped private state provider. Only used by midnight-js to keep the
 * contract's signing key (the contract itself has no private state).
 */
export function createInMemoryPrivateStateProvider<
  PSI extends PrivateStateId,
  PS = never,
>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<string, PS>();
  const signingKeys = new Map<string, SigningKey>();
  let contractAddress: string | undefined;

  const scoped = (id: string): string => `${contractAddress ?? 'unset'}:${id}`;

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address.toString();
    },
    async set(id: PSI, state: PS): Promise<void> {
      states.set(scoped(id), state);
    },
    async get(id: PSI): Promise<PS | null> {
      return states.get(scoped(id)) ?? null;
    },
    async remove(id: PSI): Promise<void> {
      states.delete(scoped(id));
    },
    async clear(): Promise<void> {
      states.clear();
    },
    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys.set(address.toString(), signingKey);
    },
    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return signingKeys.get(address.toString()) ?? null;
    },
    async removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(address.toString());
    },
    async clearSigningKeys(): Promise<void> {
      signingKeys.clear();
    },
    async exportPrivateStates(): Promise<never> {
      throw new Error('Private state export is not supported in the browser demo.');
    },
    async importPrivateStates() {
      return { imported: 0, skipped: 0, overwritten: 0 };
    },
    async exportSigningKeys(): Promise<never> {
      throw new Error('Signing key export is not supported in the browser demo.');
    },
    async importSigningKeys() {
      return { imported: 0, skipped: 0, overwritten: 0 };
    },
  };
}
