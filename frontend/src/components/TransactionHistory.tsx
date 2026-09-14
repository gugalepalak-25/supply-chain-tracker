import type { Product } from '../api'

interface TransactionHistoryProps {
  events: Product['events']
}

const STAGE_LABELS: Record<number, string> = {
  0: 'Registered',
  1: 'In Transit',
  2: 'At Distributor',
  3: 'Delivered',
}

const STAGE_COLORS: Record<number, string> = {
  0: '#f59e0b',
  1: '#3b82f6',
  2: '#8b5cf6',
  3: '#10b981',
}

/**
 * Table view of all checkpoint events for a product.
 * Shows stage, location, time, and notes in a sortable table.
 */
export function TransactionHistory({ events }: TransactionHistoryProps) {
  if (events.length === 0) {
    return <p className="muted">No events recorded yet.</p>
  }

  return (
    <table className="tx-table" role="table" aria-label="Transaction history">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Stage</th>
          <th scope="col">Location</th>
          <th scope="col">Time</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {events.map((ev, i) => (
          <tr key={i}>
            <td>{i}</td>
            <td>
              <span className="tx-stage" style={{ color: STAGE_COLORS[ev.stage] ?? '#9ca3af' }}>
                {STAGE_LABELS[ev.stage] ?? `Stage ${ev.stage}`}
              </span>
            </td>
            <td>{ev.location || '—'}</td>
            <td className="tx-time">{new Date(Number(ev.timestamp) * 1000).toLocaleString()}</td>
            <td className="tx-notes">{ev.notes || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
