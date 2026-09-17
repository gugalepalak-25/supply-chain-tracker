import { useCallback, useState } from 'react'
import {
  addMember,
  proveMembership,
  type AllowlistMember,
  type AccessEvent,
} from '../chain-allowlist'
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api'
import { showToast } from './Toast'

interface AdminPanelProps {
  wallet: ConnectedAPI
  members: AllowlistMember[]
  onRefresh: () => void
}

/**
 * Admin panel for managing the allowlist.
 * Add/remove members, view the full list.
 */
export function AllowlistAdminPanel({ wallet, members, onRefresh }: AdminPanelProps) {
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const handleAdd = useCallback(async () => {
    if (!label.trim()) return
    setAdding(true)
    try {
      const result = await addMember(wallet, label.trim())
      setNewSecret(result.secret)
      showToast(`Member "${label}" added. Secret: ${result.secret.slice(0, 16)}...`, 'success')
      setLabel('')
      onRefresh()
    } catch (err) {
      showToast(`Failed to add member: ${err}`, 'error')
    } finally {
      setAdding(false)
    }
  }, [wallet, label, onRefresh])

  return (
    <div className="allowlist-admin">
      <h3>Manage Allowlist</h3>

      <div className="add-member-form">
        <input
          type="text"
          placeholder="Member label (e.g. Alice)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={adding}
          aria-label="Member label"
        />
        <button className="primary" onClick={handleAdd} disabled={adding || !label.trim()}>
          {adding ? 'Adding…' : 'Add Member'}
        </button>
      </div>

      {newSecret && (
        <div className="secret-display">
          <p><strong>⚠ Save this secret — it will NOT be shown again:</strong></p>
          <code className="secret-code">{newSecret}</code>
          <p className="muted">Commitment stored on-chain. Use this secret to prove membership.</p>
        </div>
      )}

      <div className="member-list">
        <h4>Members ({members.length})</h4>
        {members.length === 0 ? (
          <p className="muted">No members registered yet.</p>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Commitment (first 12…)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.commitment}>
                  <td>{m.label}</td>
                  <td className="tx-notes">{m.commitment.slice(0, 12)}…</td>
                  <td>
                    <span className={`status-dot ${m.active ? 'ok' : 'off'}`} />
                    {m.active ? 'Active' : 'Removed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface ProvePanelProps {
  wallet: ConnectedAPI
  onProved?: (event: AccessEvent) => void
}

/**
 * Member panel for proving membership.
 * Enter your secret to prove you're in the allowlist.
 */
export function AllowlistProvePanel({ wallet, onProved }: ProvePanelProps) {
  const [secret, setSecret] = useState('')
  const [proving, setProving] = useState(false)
  const [result, setResult] = useState<AccessEvent | null>(null)

  const handleProve = useCallback(async () => {
    if (!secret.trim() || secret.trim().length !== 64) {
      showToast('Enter a valid 64-character hex secret', 'error')
      return
    }
    setProving(true)
    try {
      const event = await proveMembership(wallet, secret.trim())
      setResult(event)
      showToast('Membership proved successfully!', 'success')
      onProved?.(event)
    } catch (err) {
      showToast(`Proof failed: ${err}`, 'error')
    } finally {
      setProving(false)
    }
  }, [wallet, secret, onProved])

  return (
    <div className="allowlist-prove">
      <h3>Prove Membership</h3>
      <p className="muted">Enter your secret to prove you're in the allowlist without revealing your identity.</p>

      <div className="prove-form">
        <input
          type="text"
          placeholder="Your 64-char hex secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          disabled={proving}
          className="mono"
          maxLength={64}
          aria-label="Member secret"
        />
        <button className="primary" onClick={handleProve} disabled={proving || !secret.trim()}>
          {proving ? 'Proving…' : 'Prove Membership'}
        </button>
      </div>

      {result && (
        <div className="prove-result">
          <p>✅ <strong>Membership proved!</strong></p>
          <p className="muted">Token: {result.token.slice(0, 16)}…</p>
          <p className="muted">Your identity was NOT revealed.</p>
        </div>
      )}
    </div>
  )
}

interface AccessLogProps {
  events: AccessEvent[]
}

/**
 * Display the access log showing who proved membership.
 */
export function AllowlistAccessLog({ events }: AccessLogProps) {
  if (events.length === 0) {
    return <p className="muted">No access events yet.</p>
  }

  return (
    <div className="allowlist-log">
      <h4>Access Log</h4>
      <table className="tx-table">
        <thead>
          <tr>
            <th>Member Hash (first 12…)</th>
            <th>Timestamp</th>
            <th>Token (first 8…)</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev, i) => (
            <tr key={i}>
              <td className="tx-notes">{ev.memberHash.slice(0, 12)}…</td>
              <td>{new Date(ev.timestamp).toLocaleString()}</td>
              <td className="tx-notes">{ev.token.slice(0, 8)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
