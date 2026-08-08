// Headless simulator for the Supply Chain Tracker contract.
//
// This runs the compiled contract directly on the compact-runtime VM — no
// wallet, no indexer, no proof server needed. It mirrors the
// example-counter / example-bboard simulator pattern and is what the vitest
// suite drives.
//
// The secrets live in a mutable holder so tests can switch products/secrets
// without rebuilding the contract instance — the witnesses read the holder at
// proof time (exactly like the CLI and the DApp do).

import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
  type Witnesses,
} from '../contracts/managed/supply-chain/contract/index.js';
import { createWitnesses, randomSecret, type SupplyChainSecrets } from '../src/witnesses';

export type PrivateState = Record<string, never>;

export class SupplyChainSimulator {
  readonly contract: Contract<PrivateState, Witnesses<PrivateState>>;
  circuitContext: CircuitContext<PrivateState>;
  readonly secrets: SupplyChainSecrets;

  constructor(secrets?: Partial<SupplyChainSecrets>) {
    this.secrets = {
      batchSecret: secrets?.batchSecret ?? randomSecret(),
      handoffSecret: secrets?.handoffSecret ?? randomSecret(),
    };
    this.contract = new Contract<PrivateState, Witnesses<PrivateState>>(
      createWitnesses(this.secrets),
    );
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext({}, '0'.repeat(64)),
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  /** Decode the current public ledger state. */
  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  /** Override the seal codes used by the next circuit run (e.g. wrong-secret tests). */
  public setSecrets(secrets: Partial<SupplyChainSecrets>): void {
    if (secrets.batchSecret) this.secrets.batchSecret = secrets.batchSecret;
    if (secrets.handoffSecret) this.secrets.handoffSecret = secrets.handoffSecret;
  }

  public registerProduct(
    productId: string,
    name: string,
    manufacturer: string,
    location: string,
    note: string,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerProduct(
      this.circuitContext,
      productId,
      name,
      manufacturer,
      location,
      note,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public recordCheckpoint(
    productId: string,
    location: string,
    note: string,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.recordCheckpoint(
      this.circuitContext,
      productId,
      location,
      note,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public verifyAuthenticity(productId: string): Ledger {
    this.circuitContext = this.contract.impureCircuits.verifyAuthenticity(
      this.circuitContext,
      productId,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}
