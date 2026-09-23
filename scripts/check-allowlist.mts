import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import * as Allowlist from '../contracts/managed/private-allowlist/contract/index.js';
import { bytesToHex } from '../src/witnesses.js';

const A = 'c498506743fe67667be42665fb26628f9e602acfbb63c87d990157999e381359';
const B = 'd13dae8e787865affe3bb5a898fe5866363ee9ad6850a1d3a0d015439bfc171e';

const pdp = indexerPublicDataProvider(
  'https://indexer.preprod.midnight.network/api/v4/graphql',
  'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
);

for (const [name, addr] of [['c49850 (frontend)', A], ['d13dae8e (user)', B]] as const) {
  try {
    const state = await pdp.queryContractState(addr);
    if (!state || !state.data) {
      console.log(`${name} ${addr.slice(0, 8)}: no state / not deployed`);
      continue;
    }
    const ledger = Allowlist.ledger(state.data);
    const members: string[] = [];
    for (const [key, info] of ledger.members) {
      members.push(`${info.label} (active=${info.active === 1n}) commit=${bytesToHex(key).slice(0, 16)}`);
    }
    console.log(`${name} ${addr.slice(0, 8)}: memberCount=${Number(ledger.memberCount)} members=[${members.join(', ') || 'none'}] logLength=${Array.from(ledger.accessLog).length}`);
  } catch (e: any) {
    console.log(`${name} ${addr.slice(0, 8)}: ERROR ${e?.message ?? e}`);
  }
}
process.exit(0);