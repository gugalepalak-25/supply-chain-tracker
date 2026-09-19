import { useCallback, useEffect, useState } from 'react'
import QR from './QR'
import { api, type HealthInfo, type Product } from './api'
import { useLaceWallet } from './useLaceWallet'
import { WalletButton, WalletGate } from './components/WalletConnect'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import { Footer } from './components/Footer'
import { LoadingSpinner } from './components/LoadingSpinner'
import {
  AllowlistAdminPanel,
  AllowlistProvePanel,
  AllowlistAccessLog,
} from './components/AllowlistPanels'
import {
  readAllowlist,
  readAccessLog,
  isAllowlistDeployed,
  type AllowlistMember,
  type AccessEvent,
} from './chain-allowlist'

const STAGE_COLORS: Record<number, string> = {
  0: '#f59e0b',
  1: '#3b82f6',
  2: '#8b5cf6',
  3: '#10b981',
}

type Route =
  | { view: 'dashboard' }
  | { view: 'product'; id: string }
  | { view: 'allowlist' }

function parseHash(): Route {
  if (window.location.hash === '#/allowlist') return { view: 'allowlist' }
  const match = window.location.hash.match(/^#\/product\/(.+)$/)
  if (match) return { view: 'product', id: decodeURIComponent(match[1]) }
  return { view: 'dashboard' }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  const lace = useLaceWallet()
  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <ErrorBoundary>
      <div className="app">
        <Header lace={lace} />
        <main role="main" aria-label="Supply chain tracker">
          {route.view === 'dashboard' && <Dashboard lace={lace} />}
          {route.view === 'product' && <ProductView key={route.id} productId={route.id} lace={lace} />}
          {route.view === 'allowlist' && <AllowlistPage lace={lace} />}
        </main>
        <Footer />
        <ToastContainer />
      </div>
    </ErrorBoundary>
  )
}

function Header({ lace }: { lace: ReturnType<typeof useLaceWallet> }) {
  const [health, setHealth] = useState<HealthInfo | null>(null)
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])
  return (
    <header role="banner">
      <div className="brand" onClick={() => (window.location.hash = '#/')} tabIndex={0} role="link" aria-label="Go to dashboard">
        <span className="logo">◈</span>
        <div>
          <h1>Supply Chain Tracker</h1>
          <p className="subtitle">Provenance, verified in zero-knowledge</p>
        </div>
      </div>
      <div className="header-right">
        {health && (
          <div className="health">
            <span className={`dot ${health.ok ? 'ok' : 'down'}`} />
            <span>contract {health.contractAddress.slice(0, 10)}… · {health.products} product{health.products === 1 ? '' : 's'}</span>
          </div>
        )}
        <nav className="header-nav">
          <a href="#/" className="nav-link">Products</a>
          <a href="#/allowlist" className="nav-link">Allowlist</a>
        </nav>
        <WalletButton lace={lace} />
      </div>
    </header>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ lace }: { lace: ReturnType<typeof useLaceWallet> }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProducts(await api.products())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  return (
    <section>
      <div className="row">
        <h2>Tracked products</h2>
        <button className="primary" onClick={() => setShowRegister(true)}>
          + Register product
        </button>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      {loading && <p className="muted">Loading on-chain ledger…</p>}

      {!loading && products.length === 0 && (
        <div className="empty">
          <p>No products on the ledger yet.</p>
          <p className="muted">Register the first one to start the journey.</p>
        </div>
      )}

      <div className="grid">
        {products.map((p) => (
          <div className="card" key={p.productId}>
            <div className="card-head">
              <span className="sku">{p.productId}</span>
              <span className="stage" style={{ background: STAGE_COLORS[p.stage] ?? '#64748b' }}>
                {p.stageName}
              </span>
            </div>
            <h3>{p.name}</h3>
            <p className="muted">
              by {p.manufacturer} · @ {p.location}
            </p>
            <div className="card-meta">
              <span>{p.eventCount} events</span>
              <span>{p.verifications} verified ✓</span>
            </div>
            <div className="card-foot">
              <a className="link" href={`#/product/${encodeURIComponent(p.productId)}`}>
                View journey →
              </a>
              <div className="qr-mini">
                <QR value={originOf(location.href) + `#/product/${encodeURIComponent(p.productId)}`} size={72} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {showRegister && <RegisterModal lace={lace} onDone={() => { setShowRegister(false); setRefreshKey((k) => k + 1) }} onClose={() => setShowRegister(false)} />}
    </section>
  )
}

function originOf(href: string): string {
  try {
    return new URL(href).origin
  } catch {
    return ''
  }
}

function RegisterModal({ lace, onDone, onClose }: { lace: ReturnType<typeof useLaceWallet>; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ productId: '', name: '', manufacturer: '', location: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ batchSecretHex: string; handoffSecretHex: string; blockHeight: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (lace.status.kind !== 'connected') {
      setError('Connect your wallet first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.register({ ...form, actor: lace.status.address })
      setResult(res)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Register a product</h3>
        {result ? (
          <div className="seal">
            <p className="muted">Registered in block {result.blockHeight}. Keep these seal codes private — they are the zero-knowledge witness:</p>
            <div className="seal-codes">
              <code>batchSecret: {result.batchSecretHex}</code>
              <code>handoffSecret: {result.handoffSecretHex}</code>
            </div>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        ) : lace.status.kind === 'connected' ? (
          <>
            {error && <div className="error-banner">⚠ {error}</div>}
            <label>Product ID <input value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} placeholder="SKU-1001" /></label>
            <label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Organic Coffee" /></label>
            <label>Manufacturer <input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="Acme Farms" /></label>
            <label>Location <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Pune Plant" /></label>
            <label>Note <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional note about this batch" /></label>
            <div className="modal-actions">
              <button onClick={onClose} disabled={busy}>Cancel</button>
              <button className="primary" onClick={submit} disabled={busy || !form.productId || !form.name || !form.manufacturer || !form.location}>
                {busy ? 'Generating ZK proof…' : 'Register'}
              </button>
            </div>
          </>
        ) : (
          <div className="modal-gate">
            <WalletGate lace={lace}>
              <p className="muted">Registering will record your wallet as the manufacturer.</p>
            </WalletGate>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Product view ──────────────────────────────────────────────────────────────

function ProductView({ productId, lace }: { productId: string; lace: ReturnType<typeof useLaceWallet> }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [cpBusy, setCpBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProduct(await api.product(productId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  const verify = async () => {
    if (lace.status.kind !== 'connected') return
    setVerifying(true)
    setVerifyMsg(null)
    try {
      const res = await api.verify(productId, lace.status.address)
      setVerifyMsg(`✓ Authenticity proved in zero-knowledge · block ${res.blockHeight}`)
      await load()
    } catch (e) {
      setVerifyMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setVerifying(false)
    }
  }

  const checkpoint = async () => {
    if (lace.status.kind !== 'connected') return
    const location = prompt('New location:')
    if (!location) return
    setCpBusy(true)
    try {
      await api.checkpoint(productId, location, 'Recorded via web demo', lace.status.address)
      await load()
    } catch (e) {
      alert(`⚠ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCpBusy(false)
    }
  }

  if (loading) return <p className="muted">Loading on-chain state…</p>
  if (error || !product) return <div className="error-banner">⚠ {error ?? 'Product not found'}</div>

  const journey = [...product.events].sort((a, b) => b.eventIndex - a.eventIndex)
  const url = originOf(location.href) + `#/product/${encodeURIComponent(product.productId)}`

  return (
    <section className="product">
      <a className="link" href="#/">← All products</a>
      <div className="product-head">
        <div>
          <h2>{product.name}</h2>
          <p className="muted">
            {product.productId} · by {product.manufacturer}
          </p>
        </div>
        <span className="stage big" style={{ background: STAGE_COLORS[product.stage] ?? '#64748b' }}>
          {product.stageName}
        </span>
      </div>

      <div className="product-layout">
        <div className="main-col">
          <h3>Journey</h3>
          {journey.length === 0 ? (
            <p className="muted">No checkpoints yet.</p>
          ) : (
            <ol className="timeline">
              {journey.map((ev) => (
                <li key={ev.eventIndex}>
                  <span className="tl-dot" style={{ background: STAGE_COLORS[ev.stage] ?? '#64748b' }} />
                  <div>
                    <div className="tl-head">
                      <span className="tl-stage">{ev.stageName}</span>
                      <span className="tl-loc">@ {ev.location}</span>
                    </div>
                    <p className="muted">{ev.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <h3>Actions</h3>
          <WalletGate lace={lace}>
            <div className="actions">
              <button className="primary" onClick={verify} disabled={verifying}>
                {verifying ? 'Proving in zero-knowledge…' : `Verify authenticity (${product.verifications}×)`}
              </button>
              <button onClick={checkpoint} disabled={cpBusy}>
                {cpBusy ? 'Recording…' : 'Record checkpoint'}
              </button>
            </div>
            {verifyMsg && <p className="verify-msg">{verifyMsg}</p>}
          </WalletGate>
        </div>

        <aside className="side-col">
          <h3>Commitments</h3>
          <p className="muted">
            Only SHA-256 hashes of the seal codes are on-chain — the secrets themselves never leave the verifier.
          </p>
          <ul className="hashes">
            <li><span>authenticity</span><code>{product.authenticityHash}</code></li>
            <li><span>authorization</span><code>{product.authorizationHash}</code></li>
          </ul>
          <h3>Scan to verify</h3>
          <div className="qr-box">
            <QR value={url} size={180} />
          </div>
          <p className="muted tiny">Scan this code with any phone to open this product's journey.</p>
          <SealCodeVerifier productId={product.productId} onVerified={load} />
        </aside>
      </div>
    </section>
  )
}

// ─── Consumer seal-code check ─────────────────────────────────────────────────
//
// A consumer holding the physical seal code (printed on the product / QR
// payload) enters it here. The server proves knowledge of the code in
// zero-knowledge — the code itself is never written to the ledger.

function SealCodeVerifier({ productId, onVerified }: { productId: string; onVerified?: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const check = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    setResult(null)
    try {
      const res = await api.verifyWithSealCode(productId, code.trim())
      setResult({
        ok: res.authentic,
        msg: `Genuine product — authenticity proved in zero-knowledge${res.blockHeight !== undefined ? ` (block ${res.blockHeight})` : ''}.`,
      })
      if (res.authentic) onVerified?.()
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="seal-check">
      <h3>Consumer seal-code check</h3>
      <p className="muted tiny">Enter the seal code printed on the product. It is verified in zero-knowledge and never revealed on-chain.</p>
      <div className="seal-check-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          placeholder="64-char hex seal code"
          spellCheck={false}
        />
        <button onClick={check} disabled={busy || !code.trim()}>
          {busy ? 'Verifying…' : 'Check'}
        </button>
      </div>
      {result && <p className={result.ok ? 'verify-ok' : 'verify-fail'}>{result.msg}</p>}
    </div>
  )
}

// ─── Allowlist Page ────────────────────────────────────────────────────────

function AllowlistPage({ lace }: { lace: ReturnType<typeof useLaceWallet> }) {
  const [members, setMembers] = useState<AllowlistMember[]>([])
  const [accessLog, setAccessLog] = useState<AccessEvent[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!isAllowlistDeployed()) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [m, log] = await Promise.all([readAllowlist(), readAccessLog()])
      setMembers(m)
      setAccessLog(log)
    } catch (err) {
      console.error('Failed to load allowlist:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (!isAllowlistDeployed()) {
    return (
      <div className="allowlist-page">
        <div className="page-header">
          <h2>Private Allowlist Access</h2>
        </div>
        <div className="allowlist-admin" style={{ textAlign: 'center', padding: '40px' }}>
          <p>⚠️ Allowlist contract not deployed yet.</p>
          <p className="muted">Set <code>VITE_ALLOWLIST_CONTRACT_ADDRESS</code> in your .env to enable this feature.</p>
          <p className="muted">Deploy the contract with: <code>npx tsx src/deploy.ts --contract private-allowlist</code></p>
        </div>
      </div>
    )
  }

  return (
    <div className="allowlist-page">
      <div className="page-header">
        <h2>Private Allowlist Access</h2>
        <p className="muted">Prove membership without revealing your identity.</p>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading allowlist…" />
      ) : (
        <div className="allowlist-panels">
          <div className="panel-row">
            <AllowlistAdminPanel
              wallet={lace.status.kind === 'connected' ? lace : null as any}
              members={members}
              onRefresh={refresh}
            />
            <AllowlistProvePanel
              wallet={lace.status.kind === 'connected' ? lace : null as any}
              onProved={refresh}
            />
          </div>
          <AllowlistAccessLog events={accessLog} />
        </div>
      )}
    </div>
  )
}
