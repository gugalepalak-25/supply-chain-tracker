# Supply Chain Tracker

![CI](https://github.com/gugalepalak-25/Supply-chian-tracker/actions/workflows/ci.yml/badge.svg)

> Zero-knowledge product authenticity platform on Midnight blockchain.

## Live Demo

https://supply-chain-tracker-nu.vercel.app

##Video 


https://github.com/user-attachments/assets/191cb03c-255d-49ff-9bed-af9161b6f1fd



## Contract Address

| Network | Address |
|----------|---------|
| Preprod | `307597f9daf7343037f33df1bc02dc12911341ea3146ad0ef1ebe1ddc52a959c` |

## What This Does

A zero-knowledge product authenticity platform where manufacturers register batches with secret seal codes, every handoff is recorded as an on-chain checkpoint, and consumers scan a QR code to confirm a product is genuine — the proof is verified in ZK against the ledger's commitment, so neither the seal code nor the supply chain's movements are ever exposed to competitors.

## Privacy Model

- **PUBLIC**: Product name, manufacturer, stage, location, event notes, SHA-256 commitments of seal codes, verification count
- **PRIVATE**: The actual seal codes (`batchSecret`, `handoffSecret`) — the preimages behind the on-chain commitments
- **PROVED without revealing**: Knowledge of a secret whose hash matches the on-chain commitment, without revealing the secret itself

## Privacy Claim

An on-chain observer sees that a valid proof was submitted but cannot see the actual seal codes or which physical unit was handled. The ZK circuit proves knowledge of a SHA-256 preimage without revealing it.

## Tech Stack

- Midnight network
- Compact (smart contract language)
- Midnight.js SDK
- React + Vite
- Lace wallet

## Prerequisites

- Lace wallet installed
- Node.js v22

## Setup & Run Locally

```bash
git clone https://github.com/gugalepalak-25/Supply-chian-tracker.git
cd Supply-chian-tracker
npm install
npm run compile
npm run frontend:install
npm run frontend:dev
```

Open http://localhost:3000

## Run Tests

```bash
npm test
```

## CI/CD

The CI pipeline runs on every push to `main` and on pull requests. It:
1. Checks out the code
2. Sets up Node.js v22
3. Installs dependencies
4. Compiles the Compact contract
5. Runs the test suite (17 tests)

## Product Proposal

See [PROPOSAL.md](PROPOSAL.md)
