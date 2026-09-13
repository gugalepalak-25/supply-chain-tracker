# Product Proposal

## What is the product, and who uses it?

Supply Chain Tracker is a zero-knowledge product authenticity platform built on the Midnight blockchain. It enables manufacturers to register products with cryptographic seal codes, record checkpoints as products move through the supply chain (manufacturer → distributor → consumer), and allows consumers to verify authenticity without revealing the underlying secrets.

**Users:**
- **Manufacturers** — register batches with unique seal codes, record production events
- **Distributors** — record handoff checkpoints as products move through the supply chain
- **Consumers** — scan QR codes to verify product authenticity in zero-knowledge
- **Brand auditors** — view the public chain of custody without accessing private seal codes

## Why Midnight specifically?

On a transparent blockchain, every transaction is publicly visible — including product movements, supplier relationships, and verification patterns. This leaks competitive intelligence: rivals can track where products ship, when new batches launch, and which distributors are active.

Midnight solves this with **zero-knowledge proofs**: the Supply Chain Tracker proves that a consumer holds a valid seal code without revealing the code itself. Manufacturers can prove authenticity while keeping their supply chain operations private. The ZK circuit proves knowledge of a SHA-256 preimage (the seal code) without exposing it on-chain — something impossible on transparent chains like Ethereum or Solana.

## Data Model

| Data Point | Type | Disclosed To |
|---|---|---|
| Product name, manufacturer, stage, location | Public ledger | Everyone |
| Event notes, verification count | Public ledger | Everyone |
| SHA-256 commitment of seal codes | Public ledger | Everyone (hash only) |
| Batch secret (authenticity seal code) | Private witness | No one (never on-chain) |
| Handoff secret (authorization seal code) | Private witness | No one (never on-chain) |
| Seal code preimage (raw 32-byte secret) | Private witness | No one (only in prover's wallet) |

## Mainnet Feasibility

Yes, this is realistic to reach Mainnet by Level 6. The contract is already deployed on Preprod and functioning end-to-end. The core logic (register, checkpoint, verify) is stable and tested with 17 passing tests. The frontend is live on Vercel with wallet integration (Lace, 1AM). To reach Mainnet, the remaining work is:

- Deploy the contract to Midnight Mainnet (when available)
- Add persistent storage for seal codes (currently in-memory for browser sessions)
- Add QR code generation for physical product labels
- Add batch import/export for enterprise manufacturers
- Performance optimization for high-volume supply chains
