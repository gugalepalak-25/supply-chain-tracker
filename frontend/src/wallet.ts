// Lace wallet integration via the Midnight DApp Connector API (v4 / CAIP-372).
//
// Lace injects its Initial API into `window.midnight`. It is exposed both under
// the legacy friendly key `window.midnight.mnLace` and (per the v4 spec) under
// a freshly generated UUID key with a stable `rdns`. We discover by scanning
// the whole `window.midnight` object and preferring Lace by rdns/name.
//
// Reference: https://docs.midnight.network/sdks/community/wallets/community-wallets-integration

import type { ConnectedAPI, InitialAPI, ConnectionStatus } from '@midnight-ntwrk/dapp-connector-api'

export const LACE_INSTALL_URL = 'https://docs.midnight.network/relnotes/lace'

export interface LaceConnection {
  api: ConnectedAPI
  address: string
  networkId: string
  dustBalance: bigint | null
}

export type WalletStatus =
  | { kind: 'unavailable' }          // no wallet extension detected
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | { kind: 'connected'; address: string; networkId: string; dustBalance: bigint | null }

// ─── Discovery ────────────────────────────────────────────────────────────────

/** All wallets injected into `window.midnight` (v4 Initial APIs). */
export function listWallets(): InitialAPI[] {
  const injected = window.midnight
  if (!injected) return []
  return Object.values(injected).filter(
    (w): w is InitialAPI => !!w && typeof w === 'object' && typeof w.connect === 'function',
  )
}

function isLace(w: InitialAPI): boolean {
  const haystack = `${w.name} ${w.rdns}`.toLowerCase()
  return haystack.includes('lace')
}

/** Prefer Lace (by rdns/name), falling back to any discovered wallet. */
export function findLaceWallet(wallets: InitialAPI[] = listWallets()): InitialAPI | null {
  return wallets.find(isLace) ?? wallets[0] ?? null
}

/**
 * Poll for `window.midnight` until a wallet injects it. Extensions inject
 * slightly after `DOMContentLoaded`, so code that runs early must wait.
 */
export async function pollForWallet(timeoutMs = 10_000): Promise<InitialAPI | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const wallet = findLaceWallet()
    if (wallet) return wallet
    await new Promise((r) => setTimeout(r, 250))
  }
  return findLaceWallet()
}

// ─── Connect / disconnect ─────────────────────────────────────────────────────

/**
 * Connect to the wallet. MUST be called synchronously inside the click handler:
 * Lace opens a real authorization pop-up which browsers silently block once
 * transient user activation is lost (e.g. after an `await`).
 */
export async function connectWallet(wallet: InitialAPI, networkId = 'preprod'): Promise<LaceConnection> {
  const api = await wallet.connect(networkId)
  const status = await getConnectionStatus(api)
  if (status.status !== 'connected') throw new Error('wallet disconnected')
  const resolvedNetwork = status.networkId ?? networkId

  const { unshieldedAddress } = await api.getUnshieldedAddress()
  let dustBalance: bigint | null = null
  try {
    const dust = await api.getDustBalance()
    dustBalance = dust.balance
  } catch {
    dustBalance = null
  }

  return { api, address: unshieldedAddress, networkId: resolvedNetwork, dustBalance }
}

async function getConnectionStatus(api: ConnectedAPI): Promise<ConnectionStatus> {
  if (typeof api.getConnectionStatus === 'function') return api.getConnectionStatus()
  return { status: 'connected', networkId: 'mainnet' }
}

/**
 * Disconnect from the wallet. The v4 spec does not define a disconnect method,
 * so we also try the legacy Lace `disconnect()` when present; either way the
 * DApp drops its reference to the ConnectedAPI and reports the session closed.
 */
export async function disconnectWallet(api: ConnectedAPI | null): Promise<void> {
  const maybeDisconnect = (api as unknown as { disconnect?: () => Promise<unknown> })?.disconnect
  if (typeof maybeDisconnect === 'function') {
    try {
      await maybeDisconnect()
    } catch {
      // ignore — the DApp-side session is closed regardless
    }
  }
}

/** Short, display-friendly form of a Bech32m address. */
export function shortAddress(address: string): string {
  if (address.length <= 18) return address
  return `${address.slice(0, 9)}…${address.slice(-6)}`
}
