import { useState } from 'react'
import type { Product } from '../api'
import { useLaceWallet } from '../useLaceWallet'

type LaceWalletState = ReturnType<typeof useLaceWallet>

interface CircuitCallResult {
  txId: string
  blockHeight: number
}

interface CircuitCallButtonProps {
  lace: LaceWalletState
  product: Product
  onResult: (result: CircuitCallResult) => void
}

/**
 * Circuit call button for recording a checkpoint.
 * - Shows loading state during proof generation
 * - Transaction result displayed after submission
 * - Private inputs (seal codes) NEVER appear in the UI
 * - Label: 'Proved without revealing your input'
 */
export function CheckpointCircuitCall({ lace, product, onResult }: CircuitCallButtonProps) {
  const [busy, setBusy] = useState(false)
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')

  const onClick = async () => {
    if (lace.status.kind !== 'connected') return
    setBusy(true)
    try {
      const { api } = await import('../api')
      const res = await api.checkpoint(product.productId, location, note || 'Checkpoint', lace.status.address)
      onResult({ txId: res.txId, blockHeight: res.blockHeight })
    } catch (e) {
      console.error('Checkpoint failed:', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="circuit-call">
      <label>
        Location
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="New location"
        />
      </label>
      <label>
        Note
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Checkpoint note"
        />
      </label>
      <button className="primary" onClick={onClick} disabled={busy || !location}>
        {busy ? 'Generating ZK proof…' : 'Record checkpoint'}
      </button>
      <p className="muted tiny">Proved without revealing your input</p>
    </div>
  )
}

/**
 * Circuit call button for verifying authenticity.
 * - Shows loading state during proof generation
 * - Transaction result displayed after submission
 * - Private inputs (seal codes) NEVER appear in the UI
 * - Label: 'Proved without revealing your input'
 */
export function VerifyCircuitCall({ lace, product, onResult }: CircuitCallButtonProps) {
  const [busy, setBusy] = useState(false)

  const onClick = async () => {
    if (lace.status.kind !== 'connected') return
    setBusy(true)
    try {
      const { api } = await import('../api')
      const res = await api.verify(product.productId, lace.status.address)
      onResult({ txId: res.txId, blockHeight: res.blockHeight })
    } catch (e) {
      console.error('Verify failed:', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="circuit-call">
      <button className="primary" onClick={onClick} disabled={busy}>
        {busy ? 'Generating ZK proof…' : `Verify authenticity (${product.verifications}×)`}
      </button>
      <p className="muted tiny">Proved without revealing your input</p>
    </div>
  )
}
