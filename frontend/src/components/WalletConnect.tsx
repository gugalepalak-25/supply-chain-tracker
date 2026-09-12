import { useState } from 'react'
import { useLaceWallet } from '../useLaceWallet'
import { LACE_INSTALL_URL, shortAddress, walletDisplayName } from '../wallet'

type LaceWalletState = ReturnType<typeof useLaceWallet>

/**
 * Wallet connect/disconnect UI for the Supply Chain Tracker.
 *
 * - Connect button triggers Lace wallet connection
 * - Disconnect button clears wallet state
 * - Shows connected wallet address when connected
 * - Shows clear disconnected state when not connected
 * - Handles errors: wallet not installed, user rejected, network mismatch
 */
export function WalletButton({ lace }: { lace: LaceWalletState }) {
  const { status, error, connect, disconnect, wallets, selectedWallet, selectWallet } = lace
  const [busy, setBusy] = useState(false)

  const onClick = async () => {
    setBusy(true)
    try {
      if (status.kind === 'connected') {
        await disconnect()
      } else {
        await connect()
      }
    } finally {
      setBusy(false)
    }
  }

  if (status.kind === 'connected') {
    return (
      <div className="wallet">
        <span className="wallet-addr" title={status.address}>
          <span className="dot ok" /> {shortAddress(status.address)}
        </span>
        <span className="wallet-net">
          {status.walletName ? `${status.walletName} · ` : ''}
          {status.networkId}
        </span>
        <button className="wallet-btn" onClick={onClick} disabled={busy}>
          Disconnect
        </button>
      </div>
    )
  }

  const selectedIndex = wallets.findIndex((w) => w === selectedWallet)

  return (
    <div className="wallet">
      {wallets.length > 1 && (
        <select
          className="wallet-select"
          value={selectedIndex === -1 ? '' : String(selectedIndex)}
          disabled={busy || status.kind === 'connecting'}
          onChange={(e) => {
            const i = Number(e.target.value)
            selectWallet(wallets[i] ?? null)
          }}
          aria-label="Choose wallet"
        >
          {wallets.map((w, i) => (
            <option key={w.rdns ?? `wallet-${i}`} value={i}>
              {walletDisplayName(w)}
            </option>
          ))}
        </select>
      )}
      <button className="wallet-btn" onClick={onClick} disabled={busy || status.kind === 'connecting'}>
        {busy || status.kind === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </button>
      {status.kind === 'unavailable' && (
        <span className="wallet-hint">
          Wallet not detected —{' '}
          <a href={LACE_INSTALL_URL} target="_blank" rel="noreferrer">
            install a Midnight wallet
          </a>
          , then refresh
        </span>
      )}
      {error && <span className="wallet-error">⚠ {error}</span>}
    </div>
  )
}

/**
 * Gates child content behind wallet connection. Shows a connect prompt when
 * the wallet is not connected.
 */
export function WalletGate({ lace, children }: { lace: LaceWalletState; children: React.ReactNode }) {
  const { status, error, connect, wallets, selectedWallet, selectWallet } = lace
  if (status.kind === 'connected') return <>{children}</>

  const selectedIndex = wallets.findIndex((w) => w === selectedWallet)

  return (
    <div className="wallet-gate">
      <p>Connect your wallet to perform on-chain actions.</p>
      {status.kind === 'unavailable' && (
        <p className="wallet-hint">
          Wallet not detected —{' '}
          <a href={LACE_INSTALL_URL} target="_blank" rel="noreferrer">
            install a Midnight wallet
          </a>
          , then refresh
        </p>
      )}
      {error && <p className="wallet-error">⚠ {error}</p>}
      {wallets.length > 1 && (
        <select
          className="wallet-select"
          value={selectedIndex === -1 ? '' : String(selectedIndex)}
          disabled={status.kind === 'connecting'}
          onChange={(e) => {
            const i = Number(e.target.value)
            selectWallet(wallets[i] ?? null)
          }}
          aria-label="Choose wallet"
        >
          {wallets.map((w, i) => (
            <option key={w.rdns ?? `wallet-${i}`} value={i}>
              {walletDisplayName(w)}
            </option>
          ))}
        </select>
      )}
      <button className="wallet-btn" onClick={() => connect()} disabled={status.kind === 'connecting'}>
        {status.kind === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      </button>
    </div>
  )
}
