/**
 * HTTP API for the Supply Chain Tracker web demo.
 *
 * Exposes the same contract operations as the CLI over HTTP:
 *   GET  /api/health                 → server + contract info
 *   GET  /api/products               → all products + journeys (public ledger)
 *   GET  /api/products/:id           → single product detail
 *   POST /api/products               → register a product (returns seal codes)
 *   POST /api/products/:id/checkpoint→ record a checkpoint (ZK handoff)
 *   POST /api/products/:id/verify    → prove authenticity in zero-knowledge
 *
 * Also serves the built frontend (frontend/dist) at the same origin, so a
 * single server powers the whole demo. Run `npm run build --prefix frontend`
 * first (or `npm run frontend:dev` and proxy /api in dev).
 *
 * NOTE: this is a local-devnet demo server. Secrets are read from the
 * gitignored `.supply-chain-secrets.json` file only.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { Contract as SupplyChainContract } from '../contracts/managed/supply-chain/contract/index.js';
import { resolveNetwork, getOrCreateWallet, getDeployment } from './network';
import { createWallet, persistWalletState, type WalletContext } from './wallet';
import {
  createWitnesses,
  randomSecret,
  hexToBytes,
  bytesToHex,
  saveStoredSecrets,
  getStoredSecrets,
  type SupplyChainSecrets,
} from './witnesses';

// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

const PORT = Number(process.env.PORT ?? 4000);
const PRIVATE_STATE_ID = 'supplyChainPrivateState';
const STAGE_NAMES = ['MANUFACTURED', 'IN_TRANSIT', 'AT_DISTRIBUTOR', 'DELIVERED'];

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;

const __dirname = dirname(fileURLToPath(import.meta.url));
const zkConfigPath = resolve(__dirname, '..', 'contracts', 'managed', 'supply-chain');
const contractPath = join(zkConfigPath, 'contract', 'index.js');
const distPath = resolve(__dirname, '..', 'frontend', 'dist');

if (!existsSync(contractPath)) {
  console.error('❌ Contract not compiled! Run: npm run compile');
  process.exit(1);
}

const SupplyChain = await import(pathToFileURL(contractPath).href);

const secretHolder: SupplyChainSecrets = { batchSecret: new Uint8Array(32), handoffSecret: new Uint8Array(32) };

const compiledContract = CompiledContract.make(
  'supply-chain',
  SupplyChain.Contract as unknown as typeof SupplyChainContract,
).pipe(
  CompiledContract.withWitnesses(createWitnesses(secretHolder)),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
) as any;

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

// ─── Ledger read helpers ───────────────────────────────────────────────────────

function shortId(hex: string): string {
  return hex.length > 18 ? `${hex.slice(0, 8)}…${hex.slice(-8)}` : hex;
}

function toProductJson(ledger: any, id: string, p: any): any {
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

async function listProducts(providers: any, contractAddress: string): Promise<any[]> {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) return [];
  const ledger = SupplyChain.ledger(state.data);
  const out: any[] = [];
  for (const [id, p] of ledger.products) {
    out.push(toProductJson(ledger, id, p));
  }
  return out;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
  const segments = urlPath.split('/').filter(Boolean);
  if (segments.includes('api')) return false;
  let filePath = join(distPath, ...segments);
  if (segments.length === 0 || filePath.endsWith('/') || extname(filePath) === '') filePath = join(filePath, 'index.html');
  if (!existsSync(filePath)) filePath = join(distPath, 'index.html');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(filePath));
  return true;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run setup\` first.`);
    process.exit(1);
  }

  console.log(`\n  Connecting wallet (network: ${network})…`);
  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
  await walletCtx.wallet.waitForSyncedState();
  await persistWalletState(network, walletCtx);

  const providers = await createProviders(walletCtx);
  console.log('  Connecting to contract…');
  const deployed: any = await findDeployedContract(providers, {
    compiledContract: compiledContract as any,
    contractAddress: deployment.address,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const p = url.pathname;
      const method = req.method ?? 'GET';

      if (p === '/api/health') {
        send(res, 200, { ok: true, network, contractAddress: deployment.address, products: (await listProducts(providers, deployment.address)).length });
        return;
      }

      if (p === '/api/products' && method === 'GET') {
        send(res, 200, { products: await listProducts(providers, deployment.address) });
        return;
      }

      if (p === '/api/products' && method === 'POST') {
        const b = await readBody(req);
        const { productId, name, manufacturer, location, note } = b;
        if (!productId || !name || !manufacturer || !location) {
          send(res, 400, { error: 'productId, name, manufacturer and location are required' });
          return;
        }
        secretHolder.batchSecret = randomSecret();
        secretHolder.handoffSecret = randomSecret();
        saveStoredSecrets(productId, { ...secretHolder });
        const tx = await deployed.callTx.registerProduct(productId, name, manufacturer, location, note ?? 'Manufactured');
        send(res, 200, {
          productId,
          txId: tx.public.txId,
          blockHeight: Number(tx.public.blockHeight),
          batchSecretHex: bytesToHex(secretHolder.batchSecret),
          handoffSecretHex: bytesToHex(secretHolder.handoffSecret),
          note: 'Store these seal codes privately — they are the ZK witness for later checkpoints.',
        });
        return;
      }

      const match = p.match(/^\/api\/products\/([^/]+)\/(checkpoint|verify)$/);
      if (match && method === 'POST') {
        const productId = decodeURIComponent(match[1]);
        const op = match[2];
        const stored = getStoredSecrets(productId);
        if (!stored) {
          send(res, 400, { error: `No stored seal codes for ${productId} — register it from this server first.` });
          return;
        }
        secretHolder.batchSecret = hexToBytes(stored.batchSecretHex);
        secretHolder.handoffSecret = hexToBytes(stored.handoffSecretHex);
        const b = await readBody(req);
        if (op === 'checkpoint') {
          const { location, note } = b;
          if (!location) {
            send(res, 400, { error: 'location is required' });
            return;
          }
          const tx = await deployed.callTx.recordCheckpoint(productId, location, note ?? 'Checkpoint');
          send(res, 200, { productId, txId: tx.public.txId, blockHeight: Number(tx.public.blockHeight) });
        } else {
          const tx = await deployed.callTx.verifyAuthenticity(productId);
          send(res, 200, { productId, txId: tx.public.txId, blockHeight: Number(tx.public.blockHeight) });
        }
        return;
      }

      const detail = p.match(/^\/api\/products\/([^/]+)$/);
      if (detail && method === 'GET') {
        const productId = decodeURIComponent(detail[1]);
        const all = await listProducts(providers, deployment.address);
        const found = all.find((x) => x.productId === productId);
        if (!found) {
          send(res, 404, { error: `Product ${productId} not found` });
          return;
        }
        send(res, 200, found);
        return;
      }

      if (serveStatic(req, res, p)) return;

      send(res, 404, { error: 'Not found', hint: 'Use /api/health, /api/products, or a product route.' });
    } catch (error: any) {
      console.error('  ❌ Request failed:', error?.message ?? error);
      if (!res.headersSent) {
        send(res, 500, { error: error?.message ?? String(error) });
      } else {
        res.end();
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  ✅ Supply Chain Tracker API + web app running`);
    console.log(`     http://localhost:${PORT}`);
    console.log(`     contract: ${deployment.address}\n`);
  });

  const shutdown = async () => {
    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
