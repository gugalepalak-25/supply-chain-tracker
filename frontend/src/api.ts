export interface JourneyEvent {
  eventIndex: number
  stage: number
  stageName: string
  location: string
  note: string
}

export interface Product {
  productId: string
  name: string
  manufacturer: string
  stage: number
  stageName: string
  location: string
  eventCount: number
  authenticityHash: string
  authorizationHash: string
  verifications: number
  events: JourneyEvent[]
}

export interface HealthInfo {
  ok: boolean
  network: string
  contractAddress: string
  products: number
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  health: () => request<HealthInfo>('/api/health'),
  products: () => request<{ products: Product[] }>('/api/products').then((r) => r.products),
  product: (id: string) => request<Product>(`/api/products/${encodeURIComponent(id)}`),
  register: (p: { productId: string; name: string; manufacturer: string; location: string; note?: string; actor?: string }) =>
    request<{ productId: string; txId: string; blockHeight: number; batchSecretHex: string; handoffSecretHex: string }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(p),
    }),
  checkpoint: (id: string, location: string, note: string, actor?: string) =>
    request<{ productId: string; txId: string; blockHeight: number }>(`/api/products/${encodeURIComponent(id)}/checkpoint`, {
      method: 'POST',
      body: JSON.stringify({ location, note, actor }),
    }),
  verify: (id: string, actor?: string) =>
    request<{ productId: string; txId: string; blockHeight: number }>(`/api/products/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ actor }),
    }),
}
