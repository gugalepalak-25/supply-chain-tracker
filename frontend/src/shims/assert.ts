// Browser shim for Node's `assert` module. `@subsquid/scale-codec` (pulled in
// by the wallet address-format SDK for bech32m handling) does `require("assert")`
// and calls `assert(...)` / `assert.strictEqual(...)`. Vite externalizes Node
// built-ins in the browser, which would throw at runtime — alias `assert` here.

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed')
}

function strictEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `${String(actual)} !== ${String(expected)}`)
  }
}

;(assert as unknown as { strictEqual: typeof strictEqual }).strictEqual = strictEqual

export default assert
