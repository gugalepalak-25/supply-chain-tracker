import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Stage { MANUFACTURED = 0,
                    IN_TRANSIT = 1,
                    AT_DISTRIBUTOR = 2,
                    DELIVERED = 3
}

export type Event = { stage: Stage;
                      location: string;
                      note: string;
                      eventIndex: bigint
                    };

export type Product = { name: string;
                        manufacturer: string;
                        stage: Stage;
                        location: string;
                        authenticityHash: Uint8Array;
                        authorizationHash: Uint8Array;
                        eventCount: bigint
                      };

export type Witnesses<PS> = {
  batchSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  handoffSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerProduct(context: __compactRuntime.CircuitContext<PS>,
                  productId_0: string,
                  name_0: string,
                  manufacturer_0: string,
                  location_0: string,
                  note_0: string): __compactRuntime.CircuitResults<PS, []>;
  recordCheckpoint(context: __compactRuntime.CircuitContext<PS>,
                   productId_0: string,
                   location_0: string,
                   note_0: string): __compactRuntime.CircuitResults<PS, []>;
  verifyAuthenticity(context: __compactRuntime.CircuitContext<PS>,
                     productId_0: string): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerProduct(context: __compactRuntime.CircuitContext<PS>,
                  productId_0: string,
                  name_0: string,
                  manufacturer_0: string,
                  location_0: string,
                  note_0: string): __compactRuntime.CircuitResults<PS, []>;
  recordCheckpoint(context: __compactRuntime.CircuitContext<PS>,
                   productId_0: string,
                   location_0: string,
                   note_0: string): __compactRuntime.CircuitResults<PS, []>;
  verifyAuthenticity(context: __compactRuntime.CircuitContext<PS>,
                     productId_0: string): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  registerProduct(context: __compactRuntime.CircuitContext<PS>,
                  productId_0: string,
                  name_0: string,
                  manufacturer_0: string,
                  location_0: string,
                  note_0: string): __compactRuntime.CircuitResults<PS, []>;
  recordCheckpoint(context: __compactRuntime.CircuitContext<PS>,
                   productId_0: string,
                   location_0: string,
                   note_0: string): __compactRuntime.CircuitResults<PS, []>;
  verifyAuthenticity(context: __compactRuntime.CircuitContext<PS>,
                     productId_0: string): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  products: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: string): boolean;
    lookup(key_0: string): Product;
    [Symbol.iterator](): Iterator<[string, Product]>
  };
  history: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: string): boolean;
    lookup(key_0: string): {
      isEmpty(): boolean;
      length(): bigint;
      head(): { is_some: boolean, value: Event };
      [Symbol.iterator](): Iterator<Event>
    }
  };
  verifications: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: string): boolean;
    lookup(key_0: string): bigint;
    [Symbol.iterator](): Iterator<[string, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
