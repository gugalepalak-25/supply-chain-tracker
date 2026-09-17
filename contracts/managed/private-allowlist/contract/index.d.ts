import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type MemberInfo = { label: string; addedAt: bigint; active: bigint };

export type AccessEvent = { memberHash: Uint8Array;
                            timestamp: bigint;
                            token: Uint8Array
                          };

export type Witnesses<PS> = {
  memberSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  addMember(context: __compactRuntime.CircuitContext<PS>,
            label_0: string,
            commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveMembership(context: __compactRuntime.CircuitContext<PS>,
                  token_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  removeMember(context: __compactRuntime.CircuitContext<PS>,
               commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  addMember(context: __compactRuntime.CircuitContext<PS>,
            label_0: string,
            commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveMembership(context: __compactRuntime.CircuitContext<PS>,
                  token_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  removeMember(context: __compactRuntime.CircuitContext<PS>,
               commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  addMember(context: __compactRuntime.CircuitContext<PS>,
            label_0: string,
            commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveMembership(context: __compactRuntime.CircuitContext<PS>,
                  token_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  removeMember(context: __compactRuntime.CircuitContext<PS>,
               commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  members: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): MemberInfo;
    [Symbol.iterator](): Iterator<[Uint8Array, MemberInfo]>
  };
  readonly memberCount: bigint;
  accessLog: {
    isEmpty(): boolean;
    length(): bigint;
    head(): { is_some: boolean, value: AccessEvent };
    [Symbol.iterator](): Iterator<AccessEvent>
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
