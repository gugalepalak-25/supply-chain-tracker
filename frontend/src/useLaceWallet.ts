import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api'
import {
  connectWallet,
  disconnectWallet,
  findLaceWallet,
  listWallets,
  pollForWallet,
  type LaceConnection,
  type WalletStatus,
} from './wallet'

const DEFAULT_NETWORK = 'preprod'

export interface LaceWalletState {
  status: WalletStatus
  wallet: InitialAPI | null
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
  const [wallet, setWallet] = useState<InitialAPI | null>(null)
  const [status, setStatus] = useState<WalletStatus>({ kind: 'disconnected' })
  const [error, setError] = useState<string | null>(null)
  const apiRef = useRef<ConnectedAPI | null>(null)

  const discover = useCallback(async () => {
    const found = findLaceWallet()
    setWallet(found)
    return found
  }, [])

  const refresh = useCallback(async () => {
    const found = await discover()
    if (found && (status.kind === 'unavailable' || status.kind === 'disconnected')) {
      setStatus({ kind: 'disconnected' })
    }
  }, [discover, status.kind])

  useEffect(() => {
    let cancelled = false
    const hasWallet = () => !!findLaceWallet()
    if (hasWallet()) {
      setWallet(findLaceWallet())
      setStatus({ kind: 'disconnected' })
      return
    }
    setStatus({ kind: 'unavailable' })
    pollForWallet().then((found) => {
      if (cancelled) return
      setWallet(found)
      if (found) setStatus({ kind: 'disconnected' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(
    async (network?: string) => {
      setError(null)
      const target = network ?? networkId
      const found = wallet ?? (await pollForWallet())
      if (!found) {
        setStatus({ kind: 'unavailable' })
        setError('No Midnight wallet detected. Install the Lace wallet for Midnight and refresh.')
        return
      }
      setWallet(found)
      setStatus({ kind: 'connecting' })
      try {
        const connection: LaceConnection = await connectWallet(found, target)
        apiRef.current = connection.api
        setStatus({
          kind: 'connected',
          address: connection.address,
          networkId: connection.networkId,
          dustBalance: connection.dustBalance,
        })
      } catch (e) {
        setStatus({ kind: 'disconnected' })
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [networkId, wallet],
  )

  const disconnect = useCallback(async () => {
    await disconnectWallet(apiRef.current)
    apiRef.current = null
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
          setStatus({ kind: 'disconnected' })
        }
      } catch {
        apiRef.current = null
        setStatus({ kind: 'disconnected' })
      }
    }, 15_000)
    return () => clearInterval(t)
  }, [status.kind])

  // Keep the discovered wallet list fresh in case the extension appears later.
  useEffect(() => {
    const t = setInterval(() => {
      const found = findLaceWallet(listWallets())
      if (found) setWallet((prev) => prev ?? found)
    }, 5_000)
    return () => clearInterval(t)
  }, [])

  return { status, wallet, error, connect, disconnect, refresh }
}
