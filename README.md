# Supply Chain Tracker

Track a product's journey from manufacturer → distributor → consumer on the
[Midnight](https://midnight.network) blockchain. Every checkpoint is an on-chain
event, and consumers can scan a QR code to verify authenticity — **in
zero-knowledge**, without revealing the product's secret seal codes.

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
│   CLI    │ ────────────────► │   Midnight devnet    │
│  (src/)  │                   │ node · indexer ·     │
└──────────┘                   │ proof server         │
┌──────────┐   HTTP /api       └──────────────────────┘
│ Web demo │ ────────────────► src/api-server.ts
│ frontend │   (ZK calls via  │  └─ serves built frontend/dist
│ (QR etc) │    same wallet)  │
└──────────┘
```

- `contracts/supply-chain.compact` — the Compact contract.
- `src/` — wallet/network wiring, CLI, deploy/setup, HTTP API.
- `frontend/` — Vite + React dashboard with QR codes.
- `tests/` — simulator unit tests (`vitest`).
- `scripts/e2e-check.ts` — full on-chain journey against the deployed contract.

## Prerequisites

- Node.js ≥ 22, npm ≥ 10
- Docker (for the local Midnight devnet)

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

```bash
npm run frontend:install              # once
npm run frontend:build                # build static assets
npm run api                           # serves app + /api on http://localhost:4000
```

Open **http://localhost:4000** — register a product, record a checkpoint, then
scan the product's QR code to open its journey page and click **Verify
authenticity** to run the zero-knowledge proof.

Consumers holding the physical product can also use the **Consumer seal-code
check** panel on the journey page: type in the 64-char hex seal code printed on
the product and it is verified in zero-knowledge against the on-chain
commitment — no wallet required, and the code itself is never written to the
ledger.

On-chain actions (register / checkpoint / verify) require a connected **Lace**
wallet. Connect it from the header (or the in-context prompt) on the Midnight
Preprod network; your wallet address is recorded as the actor in the on-chain
note. The ZK proving itself runs on the API server's devnet wallet — the browser
wallet is what authorizes and attributes each action.

For frontend development with hot reload:

```bash
npm run api              # API server on :4000 (in another terminal)
npm run frontend:dev     # Vite dev server on :5173, proxies /api → :4000
```

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
- **Ports** — devnet uses 9944 (node), 8088 (indexer), 6300 (proof server);
  the web demo uses 4000. Free them (`npm run proof-server:stop`) if conflicts.
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
│   ├── cli.ts                       # interactive CLI
│   └── api-server.ts                # HTTP API + static hosting
├── frontend/                        # Vite + React web demo
├── scripts/e2e-check.ts             # end-to-end test
├── tests/supply-chain.test.ts       # simulator unit tests
├── compose.yml                       # local devnet
└── .midnight-state.json             # deployed contract info (gitignored)
```
