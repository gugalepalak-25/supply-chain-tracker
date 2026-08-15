// The frontend API. Formerly proxied to the Node API server; now everything
// is served directly by `chain.ts`, which talks to the Midnight indexer (reads)
// and the connected Lace wallet (writes) with no backend in between.

import { chain } from './chain';

export type {
  JourneyEvent,
  Product,
  HealthInfo,
  RegisterResult,
  TxResult,
} from './chain';

export type { Product as ProductT } from './chain';

export const api = {
  health: () => chain.health(),
  products: () => chain.products(),
  product: (id: string) => chain.product(id),
  register: (p: { productId: string; name: string; manufacturer: string; location: string; note?: string; actor?: string }) =>
    chain.register(p),
  checkpoint: (id: string, location: string, note: string, actor?: string) =>
    chain.checkpoint(id, location, note, actor),
  verify: (id: string, actor?: string) => chain.verify(id, actor),
  verifyWithSealCode: (id: string, sealCode: string) => chain.verifyWithSealCode(id, sealCode),
};
