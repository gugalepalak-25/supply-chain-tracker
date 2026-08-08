/**
 * End-to-end check for the Supply Chain Tracker.
 *
 * Performs the full product journey against the DEPLOYED contract on the
 * active network: register → record checkpoint → verify authenticity, then
 * reads the public ledger back through the indexer and asserts the results.
 * Also verifies the batch/handoff secrets never appear in the ledger.
 *
 * Run with: npm run test:e2e
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { Contract as SupplyChainContract } from '../contracts/managed/supply-chain/contract/index.js';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, getDeployment } from '../src/network';
import { createWallet, persistWalletState, type WalletContext } from '../src/wallet';
import { createWitnesses, randomSecret, bytesToHex, saveStoredSecrets, type SupplyChainSecrets } from '../src/witnesses';

// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_ID = 'supplyChainPrivateState';
const PRODUCT_ID = `SKU-E2E-${Date.now() % 100000}`;

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

function fail(msg: string): never {
  console.error(`❌ e2e-check failed: ${msg}`);
  process.exit(1);
}

async function createProviders(walletCtx: WalletContext) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'supply-chain');
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

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

async function main() {
  const deployment = getDeployment(network);
  if (!deployment) fail('No deploy on file — run `npm run deploy` first.');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'supply-chain');
  const contractPath = path.join(zkConfigPath, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) fail('Compiled contract missing — run `npm run compile`.');

  const SupplyChain = await import(pathToFileURL(contractPath).href);
  const secrets: SupplyChainSecrets = { batchSecret: randomSecret(), handoffSecret: randomSecret() };
  saveStoredSecrets(PRODUCT_ID, secrets);

  const compiledContract = CompiledContract.make(
    'supply-chain',
    SupplyChain.Contract as unknown as typeof SupplyChainContract,
  ).pipe(
    CompiledContract.withWitnesses(createWitnesses(secrets)),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  ) as any;

  console.log(`\n→ e2e-check on ${network} · contract ${deployment.address}\n`);
  console.log(`  product: ${PRODUCT_ID}`);
  console.log(`  batchSecret (hex):   ${bytesToHex(secrets.batchSecret)}`);
  console.log(`  handoffSecret (hex): ${bytesToHex(secrets.handoffSecret)}\n`);

  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
  await walletCtx.wallet.waitForSyncedState();
  await persistWalletState(network, walletCtx);

  const providers = await createProviders(walletCtx);
  const deployed = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: deployment.address,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });

  console.log('  1/4 Registering product…');
  const t1 = await deployed.callTx.registerProduct(PRODUCT_ID, 'E2E Coffee', 'Acme Farms', 'Pune Plant', 'Manufactured');
  console.log(`     ✓ registerProduct  (block ${t1.public.blockHeight})`);

  console.log('  2/4 Recording checkpoint (IN_TRANSIT)…');
  const t2 = await deployed.callTx.recordCheckpoint(PRODUCT_ID, 'Mumbai Hub', 'Loaded onto truck');
  console.log(`     ✓ recordCheckpoint (block ${t2.public.blockHeight})`);

  console.log('  3/4 Verifying authenticity (consumer)…');
  const t3 = await deployed.callTx.verifyAuthenticity(PRODUCT_ID);
  console.log(`     ✓ verifyAuthenticity (block ${t3.public.blockHeight})`);

  console.log('  4/4 Reading state back through the indexer…');
  const onChain = await providers.publicDataProvider.queryContractState(deployment.address);
  if (!onChain) fail(`queryContractState returned null for ${deployment.address}`);
  const ledger = SupplyChain.ledger(onChain.data);

  if (!ledger.products.member(PRODUCT_ID)) fail(`product ${PRODUCT_ID} not found on-chain`);
  const p = ledger.products.lookup(PRODUCT_ID);
  if (p.stage !== 1) fail(`expected stage IN_TRANSIT(1), got ${p.stage}`);
  if (p.eventCount !== 2n) fail(`expected eventCount 2, got ${p.eventCount}`);
  const events = Array.from(ledger.history.lookup(PRODUCT_ID));
  if (events.length !== 2) fail(`expected 2 events, got ${events.length}`);
  const verifications = ledger.verifications.member(PRODUCT_ID) ? ledger.verifications.lookup(PRODUCT_ID) : 0n;
  if (verifications !== 1n) fail(`expected 1 verification, got ${verifications}`);

  // Privacy assertion: secrets never appear in the decoded on-chain ledger.
  const serialized = JSON.stringify({
    products: Array.from(ledger.products).map(([id, v]) => [id, { ...v, authenticityHash: bytesToHex(v.authenticityHash), authorizationHash: bytesToHex(v.authorizationHash), eventCount: v.eventCount.toString() }]),
    history: Array.from(ledger.history).map(([id, list]) => [id, Array.from(list)]),
    verifications: Array.from(ledger.verifications).map(([id, n]) => [id, n.toString()]),
  });
  for (const hex of [bytesToHex(secrets.batchSecret), bytesToHex(secrets.handoffSecret)]) {
    if (serialized.includes(hex)) fail('A secret leaked into the public ledger state!');
  }

  console.log('\n✅ e2e-check passed');
  console.log(`   contractAddress: ${deployment.address}`);
  console.log(`   product:         ${PRODUCT_ID}`);
  console.log(`   stage:           IN_TRANSIT, events: 2, verifications: 1`);
  console.log(`   privacy:         secrets absent from on-chain state`);

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
