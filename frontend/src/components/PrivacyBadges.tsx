/**
 * Privacy badges that clearly label what is public vs private in the UI.
 */

export function PublicBadge() {
  return (
    <span className="privacy-badge public" title="This data is stored on the public ledger">
      🌐 Public
    </span>
  )
}

export function PrivateBadge() {
  return (
    <span className="privacy-badge private" title="This data never leaves your device">
      🔒 Private
    </span>
  )
}

export function ProvedBadge() {
  return (
    <span className="privacy-badge proved" title="Proved in zero-knowledge without revealing input">
      ✨ ZK Proved
    </span>
  )
}
