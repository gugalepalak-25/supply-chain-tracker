/**
 * Interactive CLI for the Supply Chain Tracker contract.
 *
 * PRIVACY NOTE: batch and handoff secrets are consumed only as zero-knowledge
 * witness inputs during proof generation. They are never printed as part of
 * ledger/event output. The register flow deliberately prints the newly
 * generated secrets once so the user can keep them (they go into the product
 * QR payload) — after that they live only in the gitignored secrets file.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

// Midnight SDK imports
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { Contract as SupplyChainContract } from '../contracts/managed/supply-chain/contract/index.js';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, getDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import {
  createWitnesses,
  randomSecret,
  hexToBytes,
  bytesToHex,
  saveStoredSecrets,
  getStoredSecrets,
  type SupplyChainSecrets,
} from './witnesses';

// Enable WebSocket for GraphQL subscriptions
// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// Must match the privateStateId used at deploy time.
const PRIVATE_STATE_ID = 'supplyChainPrivateState';

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'supply-chain');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  console.error('\n❌ Contract not compiled! Run: npm run compile\n');
  process.exit(1);
}

const SupplyChain = await import(pathToFileURL(contractPath).href);

// Secrets are bound via a mutable holder so the same deployed contract
// instance can run proofs for different products in one session.
const secretHolder: SupplyChainSecrets = { batchSecret: new Uint8Array(32), handoffSecret: new Uint8Array(32) };

const compiledContract = CompiledContract.make(
  'supply-chain',
  SupplyChain.Contract as unknown as typeof SupplyChainContract,
).pipe(
  CompiledContract.withWitnesses(createWitnesses(secretHolder)),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
) as any;

// ─── Providers ─────────────────────────────────────────────────────────────────

async function createProviders(walletCtx: WalletContext) {
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_NAMES = ['MANUFACTURED', 'IN_TRANSIT', 'AT_DISTRIBUTOR', 'DELIVERED'];

function stageName(stage: number): string {
  return STAGE_NAMES[stage] ?? `UNKNOWN(${stage})`;
}

function shortId(hex: string): string {
  return hex.length > 18 ? `${hex.slice(0, 8)}…${hex.slice(-8)}` : hex;
}

function fmtHash(b: Uint8Array): string {
  return shortId(bytesToHex(b));
}

async function setSecrets(productId: string, forOp: 'checkpoint' | 'verify', rl: any): Promise<void> {
  const stored = getStoredSecrets(productId);
  if (stored) {
    secretHolder.batchSecret = hexToBytes(stored.batchSecretHex);
    secretHolder.handoffSecret = hexToBytes(stored.handoffSecretHex);
    console.log(`  ℹ  Using stored secrets for ${productId}.`);
    return;
  }
  if (forOp === 'checkpoint') {
    const h = (await rl.question('  Paste the product\'s handoff secret (hex): ')).trim();
    secretHolder.handoffSecret = hexToBytes(h);
    secretHolder.batchSecret = new Uint8Array(32);
  } else {
    const b = (await rl.question('  Paste the product\'s batch secret (hex): ')).trim();
    secretHolder.batchSecret = hexToBytes(b);
    secretHolder.handoffSecret = new Uint8Array(32);
  }
}

// ─── Main CLI ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Supply Chain Tracker CLI                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rl = createInterface({ input: stdin, output: stdout });

  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run setup -- --network ${network}\` first.`);
    process.exit(1);
  }
  console.log(`  Contract: ${deployment.address}`);
  console.log(`  Network: ${network}\n`);

  try {
    console.log('  Connecting to wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
    const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
    if (restoredCount > 0) {
      console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
    }

    console.log('  Syncing with network...');
    const syncStart = Date.now();
    const syncInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - syncStart) / 1000);
      process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
    }, 5000);
    await walletCtx.wallet.waitForSyncedState();
    clearInterval(syncInterval);
    process.stdout.write('\r  ✓ Synced with network.                                      \n');
    await persistWalletState(network, walletCtx);

    const providers = await createProviders(walletCtx);
    console.log('  Connecting to contract...\n');
    const deployed: any = await findDeployedContract(providers, {
      compiledContract: compiledContract as any,
      contractAddress: deployment.address,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    console.log('  ✅ Connected!\n');

    const readLedger = async () => {
      const state = await providers.publicDataProvider.queryContractState(deployment.address);
      return state ? SupplyChain.ledger(state.data) : null;
    };

    let running = true;
    while (running) {
      console.log('─── Menu ───────────────────────────────────────────────────────');
      console.log('  1. Register product (manufacturer)');
      console.log('  2. Record checkpoint (handoff)');
      console.log('  3. Verify authenticity (consumer)');
      console.log('  4. Read product / history');
      console.log('  5. List all products');
      console.log('  6. Check wallet balance');
      console.log('  7. Exit\n');

      const choice = await rl.question('  Your choice: ');

      switch (choice.trim()) {
        case '1': {
          const productId = (await rl.question('  Product ID (e.g. SKU-1001): ')).trim();
          const name = (await rl.question('  Product name: ')).trim();
          const manufacturer = (await rl.question('  Manufacturer: ')).trim();
          const location = (await rl.question('  Manufacturing location: ')).trim();
          const note = (await rl.question('  Note (optional): ')).trim() || 'Manufactured';

          secretHolder.batchSecret = randomSecret();
          secretHolder.handoffSecret = randomSecret();
          saveStoredSecrets(productId, { ...secretHolder });

          console.log('\n  Submitting transaction (proof generation may take 30-60 seconds)...');
          try {
            const tx = await deployed.callTx.registerProduct(productId, name, manufacturer, location, note);
            console.log(`\n  ✅ Product registered: ${productId}`);
            console.log(`  Transaction ID: ${tx.public.txId}`);
            console.log(`  Block height: ${tx.public.blockHeight}\n`);
            console.log('  ┌─ PRODUCT SEAL CODES (keep private, put in the QR payload) ─┐');
            console.log(`  │ batchSecret   (authenticity): ${bytesToHex(secretHolder.batchSecret)}`);
            console.log(`  │ handoffSecret (authorization): ${bytesToHex(secretHolder.handoffSecret)}`);
            console.log('  └─────────────────────────────────────────────────────────────┘');
            console.log('  On-chain, only the SHA-256 commitments of these are stored.\n');
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '2': {
          const productId = (await rl.question('  Product ID: ')).trim();
          const location = (await rl.question('  New location: ')).trim();
          const note = (await rl.question('  Note (e.g. "Picked up by distributor"): ')).trim();
          setSecrets(productId, 'checkpoint', rl);

          console.log('\n  Submitting transaction — proving handoff without revealing the secret...');
          try {
            const tx = await deployed.callTx.recordCheckpoint(productId, location, note);
            console.log(`\n  ✅ Checkpoint recorded for ${productId}`);
            console.log(`  Transaction ID: ${tx.public.txId}`);
            console.log(`  Block height: ${tx.public.blockHeight}`);
            console.log('  (Proved without revealing the handoff secret)\n');
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '3': {
          const productId = (await rl.question('  Product ID: ')).trim();
          setSecrets(productId, 'verify', rl);

          console.log('\n  Submitting transaction — proving authenticity without revealing the seal code...');
          try {
            const tx = await deployed.callTx.verifyAuthenticity(productId);
            console.log(`\n  ✅ Authenticity verified for ${productId}`);
            console.log(`  Transaction ID: ${tx.public.txId}`);
            console.log(`  Block height: ${tx.public.blockHeight}`);
            console.log('  (Proved without revealing the batch secret)\n');
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '4': {
          const productId = (await rl.question('  Product ID: ')).trim();
          const ledger = await readLedger();
          if (!ledger) {
            console.log('\n  📋 No contract state found (nothing deployed/readable yet).\n');
            break;
          }
          if (!ledger.products.member(productId)) {
            console.log(`\n  📋 Product "${productId}" not found.\n`);
            break;
          }
          const p = ledger.products.lookup(productId);
          console.log('\n  ── Product ────────────────────────────────────────────────');
          console.log(`  Name:          ${p.name}`);
          console.log(`  Manufacturer:  ${p.manufacturer}`);
          console.log(`  Stage:         ${stageName(p.stage)}`);
          console.log(`  Location:      ${p.location}`);
          console.log(`  Event count:   ${p.eventCount}`);
          console.log(`  Authenticity commitment:  ${fmtHash(p.authenticityHash)}`);
          console.log(`  Authorization commitment: ${fmtHash(p.authorizationHash)}`);
          console.log('  ── Journey (newest first) ─────────────────────────────────');
          let idx = 0;
          for (const ev of ledger.history.lookup(productId)) {
            idx += 1;
            console.log(`  #${ev.eventIndex}  ${stageName(ev.stage).padEnd(15)} @ ${ev.location}  — ${ev.note}`);
          }
          const v = ledger.verifications.member(productId) ? ledger.verifications.lookup(productId) : 0n;
          console.log(`  ── Verifications: ${v}\n`);
          break;
        }

        case '5': {
          const ledger = await readLedger();
          if (!ledger || ledger.products.isEmpty()) {
            console.log('\n  📋 No products registered yet.\n');
            break;
          }
          console.log('\n  ── Products ──────────────────────────────────────────────');
          for (const [id, p] of ledger.products) {
            const v = ledger.verifications.member(id) ? ledger.verifications.lookup(id) : 0n;
            console.log(`  ${id.padEnd(16)} | ${p.name.padEnd(24)} | ${stageName(p.stage).padEnd(14)} | @ ${p.location.padEnd(18)} | verifications: ${v}`);
          }
          console.log('');
          break;
        }

        case '6': {
          const currentState = await walletCtx.wallet.waitForSyncedState();
          const balance = currentState.unshielded.balances[unshieldedToken().raw] ?? 0n;
          const dustBalance = currentState.dust.balance(new Date());
          console.log(`\n  tNight: ${balance.toLocaleString()}`);
          console.log(`  DUST:   ${dustBalance.toLocaleString()}\n`);
          break;
        }

        case '7':
          running = false;
          console.log('\n  👋 Goodbye!\n');
          break;

        default:
          console.log('\n  ❌ Invalid choice. Please enter 1-7.\n');
      }
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
