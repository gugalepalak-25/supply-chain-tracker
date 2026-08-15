// Browser-side configuration for direct Midnight contract interaction.
//
// The web app now talks to the Midnight chain directly (indexer for reads, the
// connected Lace wallet for proving/balancing/submission) instead of going
// through the Node API server. Every value here can be overridden with a
// VITE_* env var at build/dev time (see frontend/.env.example).
//
// Defaults target the preprod deployment recorded in the repo's
// `.midnight-state.json`.

const env = import.meta.env ?? {};

export const NETWORK_ID: string = env.VITE_NETWORK_ID ?? 'preprod';

/** On-chain contract address the app reads from and writes to. */
export const CONTRACT_ADDRESS: string =
  env.VITE_CONTRACT_ADDRESS ?? '5e08b7928d3c14c8605b7aa21117532525559a14784a71130b4def286d56786d';

/** Public indexer (GraphQL + WebSocket). */
export const INDEXER_URL: string =
  env.VITE_INDEXER_URL ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS_URL: string =
  env.VITE_INDEXER_WS_URL ?? 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

/** Where the compiled zk assets are served from (populated by `npm run prepare`). */
export const ZK_CONFIG_BASE: string = env.VITE_ZK_CONFIG_BASE ?? '/managed/supply-chain';

export type ProvingMode = 'wallet' | 'server';

/**
 * Where zero-knowledge proofs are generated:
 *  - 'wallet'  (default) — delegated to the connected wallet: wallets that
 *    implement `getProvingProvider()` (e.g. 1AM) prove in-wallet; Lace falls
 *    back to the proof server it is configured with (or VITE_PROOF_SERVER_URL).
 *  - 'server'  — an HTTP proof server proves (used by Lace when it has no
 *    configured proof server; e.g. the local devnet one at 127.0.0.1:6300).
 */
export const PROVING_MODE: ProvingMode = (env.VITE_PROVING as ProvingMode) ?? 'wallet';

export const PROOF_SERVER_URL: string = env.VITE_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300';
