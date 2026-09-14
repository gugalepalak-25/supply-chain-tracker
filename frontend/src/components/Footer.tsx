/**
 * Footer with Midnight branding, links, and attribution.
 */
export function Footer() {
  return (
    <footer className="app-footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="logo">◈</span>
          <span>Supply Chain Tracker</span>
        </div>
        <div className="footer-links">
          <a href="https://midnight.network" target="_blank" rel="noreferrer">
            Midnight Network
          </a>
          <a href="https://docs.midnight.network" target="_blank" rel="noreferrer">
            Documentation
          </a>
          <a href="https://github.com/gugalepalak-25/supply-chain-tracker" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
        <div className="footer-copy">
          Built for the Midnight Builder Challenge · zero-knowledge provenance
        </div>
      </div>
    </footer>
  )
}
