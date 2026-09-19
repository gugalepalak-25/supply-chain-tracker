# Supply Chain Tracker

![CI](https://github.com/gugalepalak-25/Supply-chian-tracker/actions/workflows/ci.yml/badge.svg)

> Zero-knowledge product authenticity and private allowlist access on Midnight blockchain.

## Live Demo

https://supply-chain-tracker-nu.vercel.app

## Video

https://github.com/user-attachments/assets/191cb03c-255d-49ff-9bed-af9161b6f1fd

## Contract Address

| Network | Contract | Address |
|----------|----------|---------|
| Preprod | Supply Chain | `307597f9daf7343037f33df1bc02dc12911341ea3146ad0ef1ebe1ddc52a959c` |
| Preprod | Private Allowlist | `c498506743fe67667be42665fb26628f9e602acfbb63c87d990157999e381359` |

## What This Product Does

Supply Chain Tracker is a zero-knowledge product authenticity platform built on the Midnight blockchain. Manufacturers register products with cryptographic seal codes, record checkpoints as products move through the supply chain (manufacturer → distributor → consumer), and consumers verify authenticity without revealing the underlying secrets.

The platform also includes **Private Allowlist Access** — a feature that lets users prove membership in an allowlist without revealing their identity. Admins register members with secret commitments; members prove they're in the allowlist using zero-knowledge proofs. The verifier learns that someone is a member, but never which member proved it.

**Why Midnight?** On transparent blockchains, every transaction is publicly visible — including product movements, supplier relationships, and verification patterns. Midnight solves this with zero-knowledge proofs: the tracker proves authenticity while keeping supply chain operations private.

## Privacy Model

### Supply Chain Contract

- **What is PUBLIC (on-chain, anyone can see):**
  - Product name, manufacturer, current stage, location
  - Event notes and checkpoint history
  - SHA-256 commitments of seal codes (hash only, not the secret)
  - Verification count per product

- **What is PRIVATE (private witness, never on-chain):**
  - `batchSecret` — the product's authenticity seal code
  - `handoffSecret` — the transfer authorization token
  - Raw seal code preimages (only in prover's wallet)

- **What the user PROVES without revealing:**
  - `verifyAuthenticity`: proves knowledge of the batch secret matching the on-chain commitment
  - `recordCheckpoint`: proves possession of the current handoff secret

### Private Allowlist Contract

- **What is PUBLIC:**
  - Member commitments (SHA-256 hashes of secrets)
  - Access log with random tokens (not identities)

- **What is PRIVATE:**
  - Member secrets (never on-chain)
  - Member identity during proofs

- **What the user PROVES:**
  - `proveMembership`: proves knowledge of a secret whose hash matches an allowlist entry, without revealing which one

## Tech Stack

- **Blockchain:** Midnight Network (Preprod)
- **Smart Contracts:** Compact language
- **SDK:** Midnight.js (midnight-js)
- **Frontend:** React + Vite + TypeScript
- **Wallet:** Lace (browser extension)
- **Testing:** Vitest
- **Deployment:** Vercel

## Prerequisites

- Lace wallet installed ([lace.io](https://lace.io))
- Node.js v22+
- Docker (for local devnet)
- Preprod tNIGHT tokens (from faucet)

## Setup & Run Locally

```bash
# Clone the repo
git clone https://github.com/gugalepalak-25/Supply-chian-tracker.git
cd Supply-chian-tracker

# Install dependencies
npm install

# Compile contracts
npm run compile
npm run compile-allowlist

# Install frontend dependencies
npm run frontend:install

# Start local devnet (optional, for local testing)
docker compose up -d

# Start frontend dev server
npm run frontend:dev
```

Open http://localhost:3000

## Run Tests

```bash
npm test
```

17 tests covering circuit logic, state transitions, and privacy guarantees.

## CI/CD

The CI pipeline runs on every push to `main` and on pull requests:

1. Checks out the code
2. Sets up Node.js v22
3. Installs dependencies
4. Compiles the Compact contract
5. Runs the test suite (17 tests)

See `.github/workflows/ci.yml`.

## Usage Guide

See [docs/USAGE.md](docs/USAGE.md) for a step-by-step guide.

## Product Proposal

See [PROPOSAL.md](PROPOSAL.md)

## Product X Profile

[PLACEHOLDER — I will add after creating the account]
