# Supply Chain Tracker

Track a product's journey from manufacturer → distributor → consumer on the
[Midnight](https://midnight.network) blockchain. Every checkpoint is an on-chain
event, and consumers can scan a QR code to verify authenticity — **in
zero-knowledge**, without revealing the product's secret seal codes.

## Product idea

Counterfeit goods cost global brands billions every year, yet today's
anti-counterfeiting systems either leak where products actually move or fail to
detect fake units. Supply Chain Tracker is a zero-knowledge product
authenticity platform: manufacturers register each batch with a secret seal
code, every handoff is recorded as an on-chain checkpoint, and consumers scan a
QR code to confirm a product is genuine — the proof is verified in ZK against
the ledger's commitment, so neither the seal code nor the supply chain's
movements are ever exposed to competitors. Brands get an auditable,
privacy-preserving chain of custody; consumers get trust backed by a public
ledger, not a hologram.

## What it demonstrates

| Concept | Where |
|---|---|
| Zero-knowledge proof of authenticity (SHA-256 preimage, private witness) | `contracts/supply-chain.compact` |
| On-chain state + history (structured ledger) | the `products`, `history`, `verifications` collections |
| ZK handoff between parties without sharing secrets | `recordCheckpoint` |
| Privacy: only hash commitments of seal codes are public | `verifyAuthenticity`, e2e privacy assertion |
| Consumer seal-code check — scan, type the code, get a ZK verdict | `SealCodeVerifier` in the web demo |
| Full dApp: CLI + web UI + QR codes | `src/`, `frontend/` |

## Architecture

```
┌──────────┐   deploy/callTx   ┌──────────────────────┐
│   CLI    │ ────────────────► │   Midnight network   │
│  (src/)  │                   │ node · indexer ·     │
└──────────┘                   │ proof server         │
                               └──────────────────────┘
┌──────────┐   reads: public   ┌──────────┐   proves/
│ Web demo │ ───── indexer ──► │ Lace or  │ ◄── submits
│ frontend │                   │ 1AM      │     (connected wallet)
└──────────┘   ◄───────────────┤  wallet  │
                               └──────────┘
```

- `contracts/supply-chain.compact` — the Compact contract.
- `src/` — wallet/network wiring, CLI, deploy/setup.
- `frontend/` — Vite + React dashboard with QR codes. Reads the public
  indexer directly and writes via the connected browser wallet — **no backend
  API server involved**.
- `tests/` — simulator unit tests (`vitest`).
- `scripts/e2e-check.ts` — full on-chain journey against the deployed contract.


## Quick start

```bash
npm install

# 1. Start the local devnet (node, indexer, proof server)
npm run proof-server:start            # docker compose up -d --wait

# 2. Compile the Compact contract to managed circuits
npm run compile

# 3. Deploy: creates a wallet, registers DUST, deploys the contract
npm run setup                         # = deploy, then `npm run check-balance`

# 4. Explore
npm run cli                           # interactive CLI
npm run test:e2e                      # on-chain register→checkpoint→verify
```

The contract address and network are persisted to `.midnight-state.json`
(gitignored).

### Web demo

The web demo runs entirely in the browser against the **public Midnight Preprod
network** (the contract deployed by `npm run setup`, default address in
`frontend/src/config.ts`, overridable via `frontend/.env.example`):

```bash
npm run frontend:install              # once
npm run frontend:build                # prepares zk assets, typechecks, builds
npm run frontend:dev                  # Vite dev server on http://localhost:3000
```

Open **http://localhost:3000** — register a product, record a checkpoint, then
scan the product's QR code to open its journey page and click **Verify
authenticity** to run the zero-knowledge proof.

Consumers holding the physical product can also use the **Consumer seal-code
check** panel on the journey page: type in the 64-char hex seal code printed on
the product and it is verified in zero-knowledge against the on-chain
commitment — no wallet required, and the code itself is never written to the
ledger.

On-chain actions (register / checkpoint / verify) require a connected browser
wallet (a **Lace for Midnight** wallet, or any DApp-Connector wallet such as
**1AM**), connected on the Midnight Preprod network. Your wallet address is
recorded as the actor in the on-chain note. Reads come straight from the public
Preprod indexer, so the dashboard works without a wallet too.

How ZK proofs are produced depends on the wallet:

- **1AM** implements `getProvingProvider()` — proofs run inside the wallet,
  fully in-browser, no extra infrastructure.
- **Lace** does not expose that method, so it uses the proof server it is
  configured with (Lace settings); if none is set, the app falls back to
  `VITE_PROOF_SERVER_URL` (default `http://127.0.0.1:6300`) — e.g. the local
  devnet proof server from `npm run proof-server:start`.

Wallets need a little **DUST** (Lace: receive it from `mintsaddr`; the CLI's
`npm run setup` wallet also funds on Preprod). ZK assets are copied into
`frontend/public/managed/` by `npm run prepare` (runs automatically on
`npm run build` / `npm run dev`).
## Smart Contract Deployment

The Supply Chain Tracker smart contract has been deployed to the Midnight Preprod network.

### Deployment Details

| Detail | Information |
|---|---|
| Network | Midnight Preprod |
| Contract Address | `307597f9daf7343037f33df1bc02dc12911341ea3146ad0ef1ebe1ddc52a959c` |
| Contract | Supply Chain Tracker |
| Deployment Status | Successfully deployed |

### Deployment Screenshot
<img width="1915" height="1093" alt="Screenshot 2026-08-16 181315" src="https://github.com/user-attachments/assets/6a64234e-31dc-4163-81a8-a4bf785ce4ef" />
<img width="1891" height="1025" alt="Screenshot 2026-08-16 181253" src="https://github.com/user-attachments/assets/3c52983e-d754-4933-b5be-7f7da4180319" />


The following screenshot shows the successful smart contract deployment from the terminal:

![Smart Contract Deployment](docs/contract-deployment.png)
## CLI usage

```
 1. Register product (manufacturer)   — generates & prints the seal codes
 2. Record checkpoint (handoff)       — proves handoff without sharing secrets
 3. Verify authenticity (consumer)    — proves the seal code is authentic, in ZK
 4. Read product / history
 5. List all products
 6. Check wallet balance
 7. Exit
```

Seal codes (`batchSecret` = authenticity, `handoffSecret` = authorization) are
generated at registration, stored in `.supply-chain-secrets.json` (gitignored),
and used only as zero-knowledge witness inputs — they never appear on-chain.
Treat them like private keys.

## Tests

```bash
npm test          # 17 simulator unit tests (contract logic, privacy, stages, seal-code pre-check)
npm run build     # TypeScript typecheck (root + e2e script)
npm run test:e2e  # full journey against the deployed devnet contract
```

## Troubleshooting

- **`Error: expected instance of StateValue` on `callTx`** — caused by duplicate
  `@midnight-ntwrk/onchain-runtime-v3` versions in the dependency tree. The
  `overrides` entry in `package.json` pins it to one version; after adding it,
  re-run `npm install`.
- **`ReferenceError: Buffer is not defined` in the browser** — the Midnight SDK
  uses Node's `Buffer` for address/hex handling. The web demo loads a browser
  polyfill first via `frontend/src/shims/buffer.ts` (imported at the top of
  `main.tsx`).
- **`expected instance of LedgerParameters` in the browser** — two copies of
  `@midnight-ntwrk/ledger-v8` (8.1.0 nested, 8.1.1 hoisted) each instantiate the
  wasm, breaking class identity. The `overrides` entry in `frontend/package.json`
  forces a single `8.1.1`; re-run `npm install` after changing it.
- **`'prove' returned an error: Failed to fetch`** — the proof server is not
  reachable. With Lace, start it (`npm run proof-server:start`, listens on
  `127.0.0.1:6300`) or use the **1AM** wallet, which proves in-wallet and needs
  no proof server. If the wallet advertises its own `proverServerUri`, the app
  intentionally ignores it and uses `VITE_PROOF_SERVER_URL`.
- **Ports** — devnet uses 9944 (node), 8088 (indexer), 6300 (proof server);
  the Vite dev server uses 3000. Free them (`npm run proof-server:stop`) if
  conflicts.
- **First proof is slow** — proof generation for the first transaction of a
  session takes 30–60s; subsequent ones are faster.

## Project structure

```
.
├── contracts/
│   └── supply-chain.compact         # Compact contract source
│   └── managed/supply-chain/        # compiled circuits (generated)
├── src/
│   ├── network.ts  wallet.ts        # devnet + wallet wiring
│   ├── witnesses.ts                 # ZK secrets + storage
│   ├── setup.ts  deploy.ts          # one-shot deploy helpers
│   └── cli.ts                       # interactive CLI
├── frontend/                        # Vite + React web demo (browser wallet)
│   ├── src/chain.ts                 # direct indexer reads + wallet writes
│   ├── src/providers.ts             # wallet bridge / proof provider selection
│   ├── src/useLaceWallet.ts         # wallet discovery + connection (Lace/1AM)
│   ├── src/shims/buffer.ts          # browser Buffer polyfill (SDK requirement)
│   ├── src/witnesses.ts             # browser-side ZK secrets (in-memory)
│   └── scripts/prepare.mjs          # copies zk assets into public/
├── scripts/e2e-check.ts             # end-to-end test
├── tests/supply-chain.test.ts       # simulator unit tests
├── compose.yml                       # local devnet
└── .midnight-state.json             # deployed contract info (gitignored)
```
