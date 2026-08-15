import { useCallback, useEffect, useRef, useState } from 'react'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api'
import { setWalletApi } from './chain'
import {
  connectWallet,
  disconnectWallet,
  findLaceWallet,
  listWallets,
  pollForWallet,
  requestWalletPermissions,
  type WalletStatus,
} from './wallet'

const DEFAULT_NETWORK = 'preprod'

export interface LaceWalletState {
  status: WalletStatus
  /** Currently selected wallet (drives which wallet Connect uses). */
  wallet: InitialAPI | null
  /** All wallets injected into `window.midnight`. */
  wallets: InitialAPI[]
  selectedWallet: InitialAPI | null
  selectWallet: (w: InitialAPI | null) => void
  error: string | null
  connect: (networkId?: string) => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Manage the Lace browser-wallet lifecycle for the web demo.
 *
 * - Polls `window.midnight` so the button appears once the extension is
 *   installed (or after a refresh).
 * - `connect()` is safe to call from a click handler; it forwards to the
 *   wallet's `connect(networkId)` synchronously to preserve the user gesture.
 */
export function useLaceWallet(networkId = DEFAULT_NETWORK): LaceWalletState {
  const [wallets, setWallets] = useState<InitialAPI[]>([])
  const [selectedWallet, setSelectedWallet] = useState<InitialAPI | null>(null)
  const [status, setStatus] = useState<WalletStatus>({ kind: 'disconnected' })
  const [error, setError] = useState<string | null>(null)
  const apiRef = useRef<ConnectedAPI | null>(null)

  /**
   * Re-sync the discovered wallet list. Keeps the user's manual selection when
   * that wallet is still present; otherwise defaults to the preferred wallet
   * (Lace first, else the first detected).
   */
  const syncWallets = useCallback((list: InitialAPI[]) => {
    setWallets(list)
    setSelectedWallet((sel) =>
      sel && list.includes(sel) ? sel : (findLaceWallet(list) ?? list[0] ?? null),
    )
  }, [])

  const discover = useCallback(async () => {
    const list = listWallets()
    syncWallets(list)
    return list
  }, [syncWallets])

  const refresh = useCallback(async () => {
    const list = await discover()
    if (list.length && status.kind === 'unavailable') {
      setStatus({ kind: 'disconnected' })
    }
  }, [discover, status.kind])

  useEffect(() => {
    let cancelled = false
    const list = listWallets()
    syncWallets(list)
    if (list.length) {
      setStatus({ kind: 'disconnected' })
      return
    }
    setStatus({ kind: 'unavailable' })
    pollForWallet().then((found) => {
      if (cancelled || !found) return
      syncWallets(listWallets())
      setStatus({ kind: 'disconnected' })
    })
    return () => {
      cancelled = true
    }
  }, [syncWallets])

  const selectWallet = useCallback((w: InitialAPI | null) => {
    setSelectedWallet(w)
  }, [])

  const connect = useCallback(
    async (network?: string) => {
      setError(null)
      const target = network ?? networkId
      // Resolve the wallet SYNCHRONOUSLY if possible: `wallet.connect()` must be
      // reached without any `await` in between or browsers block Lace's
      // authorization pop-up (transient user activation is lost), leaving the
      // connect promise pending forever.
      const found = selectedWallet ?? findLaceWallet() ?? (await pollForWallet())
      if (!found) {
        setStatus({ kind: 'unavailable' })
        setError('No Midnight wallet detected. Install a Midnight wallet (Lace or 1AM) and refresh.')
        return
      }
      setSelectedWallet(found)
      setStatus({ kind: 'connecting' })
      try {
        const connection = await Promise.race([
          connectWallet(found, target),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'Connection timed out. If no authorization pop-up appeared, click Connect wallet again.',
                  ),
                ),
              45_000,
            ),
          ),
        ])
        apiRef.current = connection.api
        setNetworkId(connection.networkId)
        setWalletApi(connection.api)
        setStatus({
          kind: 'connected',
          walletName: connection.walletName,
          address: connection.address,
          networkId: connection.networkId,
          dustBalance: connection.dustBalance,
        })
        // Pre-grant permissions so subsequent transactions (register/checkpoint/
        // verify) don't prompt for authorization each time. Deferred so it never
        // races the just-finished connect pop-up, and ignored on failure.
        setTimeout(() => {
          requestWalletPermissions(connection.api).catch(() => {})
        }, 1_500)
      } catch (e) {
        setStatus({ kind: 'disconnected' })
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [networkId, selectedWallet],
  )

  const disconnect = useCallback(async () => {
    await disconnectWallet(apiRef.current)
    apiRef.current = null
    setWalletApi(null)
    setStatus({ kind: 'disconnected' })
    setError(null)
  }, [])

  useEffect(() => {
    if (status.kind !== 'connected') return
    const t = setInterval(async () => {
      const api = apiRef.current
      if (!api || typeof api.getConnectionStatus !== 'function') return
      try {
        const s = await api.getConnectionStatus()
        if (s.status !== 'connected') {
          apiRef.current = null
          setWalletApi(null)
          setStatus({ kind: 'disconnected' })
        }
      } catch {
        apiRef.current = null
        setWalletApi(null)
        setStatus({ kind: 'disconnected' })
      }
    }, 15_000)
    return () => clearInterval(t)
  }, [status.kind])

  // Keep the discovered wallet list fresh in case the extension appears later.
  useEffect(() => {
    const t = setInterval(() => {
      syncWallets(listWallets())
    }, 5_000)
    return () => clearInterval(t)
  }, [syncWallets])

  return {
    status,
    wallet: selectedWallet,
    wallets,
    selectedWallet,
    selectWallet,
    error,
    connect,
    disconnect,
    refresh,
  }
}
