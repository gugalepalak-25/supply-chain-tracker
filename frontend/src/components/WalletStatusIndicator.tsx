import { useLaceWallet } from '../useLaceWallet'

/**
 * Shows the current wallet connection status as a small indicator.
 * Green = connected, yellow = connecting, red = unavailable, gray = disconnected.
 */
export function WalletStatusIndicator() {
  const { status } = useLaceWallet()

  const statusMap = {
    unavailable: { color: '#f87171', label: 'No wallet detected' },
    disconnected: { color: '#6b7280', label: 'Wallet disconnected' },
    connecting: { color: '#fbbf24', label: 'Connecting…' },
    connected: { color: '#34d399', label: 'Connected' },
  }

  const { color, label } = statusMap[status.kind]

  return (
    <div className="wallet-status" title={label}>
      <span className="wallet-status-dot" style={{ background: color }} />
      <span className="wallet-status-text">{label}</span>
    </div>
  )
}
