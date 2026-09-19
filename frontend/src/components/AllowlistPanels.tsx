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
  const [newMember, setNewMember] = useState<{ label: string; secret: string; commitment: string } | null>(null)

  const handleAdd = useCallback(async () => {
    if (!label.trim()) return
    setAdding(true)
    try {
      const result = await addMember(wallet, label.trim())
      setNewMember({ label: label.trim(), secret: result.secret, commitment: result.commitment })
      showToast(`Member "${label}" added. Share their secret privately.`, 'success')
      setLabel('')
      onRefresh()
    } catch (err) {
      showToast(`Failed to add member: ${err}`, 'error')
    } finally {
      setAdding(false)
    }
  }, [wallet, label, onRefresh])

  const copySecret = useCallback(async () => {
    if (!newMember) return
    await navigator.clipboard.writeText(newMember.secret)
    showToast('Secret copied to clipboard', 'info')
  }, [newMember])

  return (
    <div className="allowlist-admin">
      <h3>Admin: Add Members</h3>
      <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        Adding a member generates a private secret. Share it with them to grant access.
      </p>

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

      {newMember && (
        <div className="secret-display">
          <p><strong>✅ Member "{newMember.label}" approved and added!</strong></p>
          <p style={{ marginTop: 8 }}>Share this secret with them privately:</p>
          <div className="secret-row">
            <code className="secret-code">{newMember.secret}</code>
            <button className="copy-btn" onClick={copySecret} title="Copy to clipboard">
              📋
            </button>
          </div>
          <div className="secret-instructions">
            <p><strong>How to share this secret with the member:</strong></p>
            <ul>
              <li>Send it via a <strong>private channel</strong> (Signal, encrypted email, in-person)</li>
              <li><strong>Never</strong> post it publicly, in chat, or on social media</li>
              <li>The member should <strong>save it securely</strong> — it cannot be recovered</li>
            </ul>
            <p><strong>What the member does with it:</strong></p>
            <ul>
              <li>Paste it into the "Prove Membership" panel on this page</li>
              <li>Click "Prove Membership" — their identity stays hidden</li>
              <li>The proof is logged on-chain with a random token, NOT their identity</li>
            </ul>
          </div>
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

      <div className="prove-help">
        <p><strong>How do I get my secret?</strong></p>
        <p className="muted">
          Ask the <strong>allowlist admin</strong> to add you as a member.
          They will receive a 64-character hex secret when they register you.
          They must share it with you through a <strong>private channel</strong>
          (Signal, encrypted email, in-person).
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Your secret looks like: <code>a1b2c3d4e5f6…</code> (64 hex characters)
        </p>
      </div>

      <div className="prove-form">
        <input
          type="text"
          placeholder="Paste your 64-char hex secret here"
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

      <div className="prove-privacy-note">
        <p>🔒 <strong>What happens when you prove:</strong></p>
        <ul>
          <li>Your secret is used to compute a commitment (hash)</li>
          <li>The commitment is checked against the on-chain allowlist</li>
          <li>A random token is logged — your identity is <strong>NOT</strong> revealed</li>
          <li>Your secret is <strong>never</strong> stored on-chain or in any database</li>
        </ul>
      </div>

      {result && (
        <div className="prove-result">
          <p>✅ <strong>Membership proved!</strong></p>
          <p className="muted">Token: {result.token.slice(0, 16)}…</p>
          <p className="muted">Your identity was NOT revealed on-chain.</p>
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
      <h4>Access Log (proven memberships)</h4>
      <p className="muted" style={{ marginBottom: 12 }}>
        Each row shows a successful membership proof. The member hash is the commitment (not the secret).
      </p>
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
