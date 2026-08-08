// Unit tests for the Supply Chain Tracker contract.
//
// Coverage required by the build brief:
//   (a) circuit logic — register / checkpoint / verify state transitions
//   (b) state transitions — stage progression + event history + verification counts
//   (c) PRIVATE INPUTS ARE NEVER EXPOSED — the batch/handoff secrets must not
//       appear anywhere in the decoded ledger or the raw contract state.

import { describe, it, expect, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { SupplyChainSimulator } from './supply-chain-simulator.js';
import { bytesToHex, hexToBytes } from '../src/witnesses.js';
import type { Ledger } from '../contracts/managed/supply-chain/contract/index.js';

const SECRET_BATCH = hexToBytes('a1'.repeat(32));
const SECRET_HANDOFF = hexToBytes('b2'.repeat(32));

/** Flatten the decoded ledger into a JSON-safe string (hex for bytes). */
function serializeLedger(ledger: Ledger): string {
  const products: Record<string, unknown> = {};
  for (const [id, p] of ledger.products) {
    products[id] = {
      ...p,
      eventCount: p.eventCount.toString(),
      authenticityHash: Buffer.from(p.authenticityHash).toString('hex'),
      authorizationHash: Buffer.from(p.authorizationHash).toString('hex'),
    };
  }
  const history: Record<string, unknown[]> = {};
  for (const [id] of ledger.products) {
    history[id] = Array.from(ledger.history.lookup(id)).map((e) => ({
      ...e,
      eventIndex: e.eventIndex.toString(),
    }));
  }
  const verifications: Record<string, string> = {};
  for (const [id, n] of ledger.verifications) verifications[id] = n.toString();
  return JSON.stringify({ products, history, verifications });
}

/** The exact byte-array JSON the ledger would render if the raw secret leaked. */
function secretByteArrayJson(hex: string): string {
  return JSON.stringify(Array.from(hexToBytes(hex)));
}

describe('SupplyChainSimulator — initial state', () => {
  it('initializes to an empty public ledger, deterministically', () => {
    const s1 = new SupplyChainSimulator();
    const s2 = new SupplyChainSimulator();
    expect(s1.getLedger().products.isEmpty()).toBe(true);
    expect(s1.getLedger().history.isEmpty()).toBe(true);
    expect(s1.getLedger().verifications.isEmpty()).toBe(true);
    expect(serializeLedger(s1.getLedger())).toBe(serializeLedger(s2.getLedger()));
  });
});

describe('registerProduct (circuit logic)', () => {
  let sim: SupplyChainSimulator;
  beforeEach(() => {
    sim = new SupplyChainSimulator({
      batchSecret: SECRET_BATCH,
      handoffSecret: SECRET_HANDOFF,
    });
  });

  it('registers a product with public catalog fields and the manufacturing event', () => {
    const ledger = sim.registerProduct('SKU-1001', 'Organic Coffee', 'Acme Farms', 'Pune Plant', 'Manufactured');
    expect(ledger.products.member('SKU-1001')).toBe(true);
    const p = ledger.products.lookup('SKU-1001');
    expect(p.name).toBe('Organic Coffee');
    expect(p.manufacturer).toBe('Acme Farms');
    expect(p.stage).toBe(0); // MANUFACTURED
    expect(p.location).toBe('Pune Plant');
    expect(p.eventCount).toBe(1n);

    const events = Array.from(ledger.history.lookup('SKU-1001'));
    expect(events).toHaveLength(1);
    expect(events[0].stage).toBe(0);
    expect(events[0].location).toBe('Pune Plant');
    expect(events[0].note).toBe('Manufactured');
    expect(events[0].eventIndex).toBe(1n);
  });

  it('rejects a duplicate product id', () => {
    sim.registerProduct('SKU-1001', 'A', 'B', 'C', 'n');
    expect(() => sim.registerProduct('SKU-1001', 'A', 'B', 'C', 'n')).toThrow();
  });

  it('stores 32-byte domain-separated commitments, different for each role', () => {
    sim.registerProduct('SKU-1001', 'A', 'B', 'C', 'n');
    const p = sim.getLedger().products.lookup('SKU-1001');
    expect(p.authenticityHash).toHaveLength(32);
    expect(p.authorizationHash).toHaveLength(32);
    expect(bytesToHex(p.authenticityHash)).not.toBe(bytesToHex(p.authorizationHash));
  });
});

describe('recordCheckpoint (state transitions)', () => {
  let sim: SupplyChainSimulator;
  beforeEach(() => {
    sim = new SupplyChainSimulator({ batchSecret: SECRET_BATCH, handoffSecret: SECRET_HANDOFF });
    sim.registerProduct('SKU-1001', 'Organic Coffee', 'Acme Farms', 'Pune Plant', 'Manufactured');
  });

  it('advances MANUFACTURED → IN_TRANSIT and appends a public event', () => {
    const ledger = sim.recordCheckpoint('SKU-1001', 'Mumbai Hub', 'Loaded onto truck');
    const p = ledger.products.lookup('SKU-1001');
    expect(p.stage).toBe(1); // IN_TRANSIT
    expect(p.location).toBe('Mumbai Hub');
    expect(p.eventCount).toBe(2n);

    const events = Array.from(ledger.history.lookup('SKU-1001'));
    expect(events).toHaveLength(2);
    expect(events[0].stage).toBe(1); // newest first (List is front-insert)
    expect(events[0].location).toBe('Mumbai Hub');
    expect(events[0].note).toBe('Loaded onto truck');
    expect(events[0].eventIndex).toBe(2n);
  });

  it('walks the full journey MANUFACTURED → IN_TRANSIT → AT_DISTRIBUTOR → DELIVERED', () => {
    expect(sim.recordCheckpoint('SKU-1001', 'Mumbai Hub', 'In transit').products.lookup('SKU-1001').stage).toBe(1);
    expect(sim.recordCheckpoint('SKU-1001', 'Delhi DC', 'At distributor').products.lookup('SKU-1001').stage).toBe(2);
    expect(sim.recordCheckpoint('SKU-1001', 'Consumer, MG Road', 'Delivered').products.lookup('SKU-1001').stage).toBe(3);
  });

  it('rejects a checkpoint without the correct handoff secret', () => {
    sim.setSecrets({ handoffSecret: hexToBytes('ff'.repeat(32)) });
    expect(() => sim.recordCheckpoint('SKU-1001', 'Mumbai Hub', 'Sneaky')).toThrow();
  });

  it('rejects a checkpoint for an unknown product', () => {
    expect(() => sim.recordCheckpoint('SKU-NOPE', 'X', 'Y')).toThrow();
  });

  it('rejects a checkpoint after the product is already delivered', () => {
    sim.recordCheckpoint('SKU-1001', 'Mumbai Hub', '1');
    sim.recordCheckpoint('SKU-1001', 'Delhi DC', '2');
    sim.recordCheckpoint('SKU-1001', 'Consumer', '3');
    expect(() => sim.recordCheckpoint('SKU-1001', 'Beyond', '4')).toThrow();
  });
});

describe('verifyAuthenticity (consumer circuit)', () => {
  let sim: SupplyChainSimulator;
  beforeEach(() => {
    sim = new SupplyChainSimulator({ batchSecret: SECRET_BATCH, handoffSecret: SECRET_HANDOFF });
    sim.registerProduct('SKU-1001', 'Organic Coffee', 'Acme Farms', 'Pune Plant', 'Manufactured');
  });

  it('increments the public verification counter for the genuine seal code', () => {
    let ledger = sim.verifyAuthenticity('SKU-1001');
    expect(ledger.verifications.lookup('SKU-1001')).toBe(1n);
    ledger = sim.verifyAuthenticity('SKU-1001');
    expect(ledger.verifications.lookup('SKU-1001')).toBe(2n);
  });

  it('rejects a product whose batch secret does not match the commitment', () => {
    sim.setSecrets({ batchSecret: hexToBytes('aa'.repeat(32)) }); // wrong seal
    expect(() => sim.verifyAuthenticity('SKU-1001')).toThrow();
  });

  it('rejects verification of an unknown product', () => {
    expect(() => sim.verifyAuthenticity('SKU-NOPE')).toThrow();
  });
});

describe('PRIVACY: private inputs are never exposed', () => {
  it('never writes the batch or handoff secrets to the ledger', () => {
    const sim = new SupplyChainSimulator({
      batchSecret: SECRET_BATCH,
      handoffSecret: SECRET_HANDOFF,
    });
    sim.registerProduct('SKU-1001', 'Organic Coffee', 'Acme Farms', 'Pune Plant', 'Manufactured');
    sim.recordCheckpoint('SKU-1001', 'Mumbai Hub', 'Loaded');
    sim.verifyAuthenticity('SKU-1001');

    const serialized = serializeLedger(sim.getLedger());

    // Neither the hex form nor the raw byte-array form of the secrets may
    // appear anywhere in the public ledger.
    for (const hex of [bytesToHex(SECRET_BATCH), bytesToHex(SECRET_HANDOFF)]) {
      expect(serialized).not.toContain(hex);
      expect(serialized).not.toContain(secretByteArrayJson(hex));
    }

    // The ledger must still carry 32-byte commitments — so the check proves
    // the hashes (not the preimages) are what is stored.
    const p = sim.getLedger().products.lookup('SKU-1001');
    expect(Buffer.from(p.authenticityHash).toString('hex')).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(p.authorizationHash).toString('hex')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not leak the secrets in the raw contract VM state either', () => {
    const sim = new SupplyChainSimulator({
      batchSecret: SECRET_BATCH,
      handoffSecret: SECRET_HANDOFF,
    });
    sim.registerProduct('SKU-1001', 'Organic Coffee', 'Acme Farms', 'Pune Plant', 'Manufactured');

    const raw = JSON.stringify(
      (sim as unknown as { circuitContext: { currentQueryContext: { state: unknown } } }).circuitContext
        .currentQueryContext.state,
    );
    for (const hex of [bytesToHex(SECRET_BATCH), bytesToHex(SECRET_HANDOFF)]) {
      expect(raw).not.toContain(hex);
      expect(raw).not.toContain(secretByteArrayJson(hex));
    }
  });
});
