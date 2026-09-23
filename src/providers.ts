/**
 * Shared provider factory for the Supply Chain Tracker.
 *
 * Builds the midnight-js provider set (private state, public data, ZK config,
 * proof, wallet/midnight) used by the CLI, deploy script, and e2e tests.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import type { NetworkConfig } from './network';
import type { WalletContext } from './wallet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ZK_CONFIG_PATH = path.resolve(__dirname, '..', 'contracts', 'managed', 'supply-chain');

export interface ProviderOptions {
  walletCtx: WalletContext;
  networkConfig: NetworkConfig;
  zkConfigPath?: string;
  privateStatePassword?: string;
}

export async function createProviders(opts: ProviderOptions) {
  const {
    walletCtx,
    networkConfig,
    zkConfigPath = DEFAULT_ZK_CONFIG_PATH,
    privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1',
  } = opts;

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'supply-chain-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}
