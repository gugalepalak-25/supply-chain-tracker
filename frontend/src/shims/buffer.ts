// Browser polyfill for Node's `Buffer`. The Midnight SDK (wallet-sdk-address-format,
// midnight-js-utils, indexer provider) uses `Buffer` for address and hex handling.
// Import this module FIRST in the entry point so the global exists before any SDK
// code runs.
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') {
  ;(globalThis as { Buffer: typeof Buffer }).Buffer = Buffer
}

export {}
