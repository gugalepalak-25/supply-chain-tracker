// Orchestrator for `npm run setup`. Brings up the local devnet, compiles the
// contract, and deploys. Pass --network preview|preprod to target a public
// network instead (only the proof-server container is needed there).
import { spawnSync } from 'node:child_process';
import { resolveNetwork, setActiveNetwork, parseNetworkFlag } from './network';

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    process.stderr.write(`\nCommand failed: ${cmd} ${args.join(' ')}\n`);
    process.exit(r.status ?? 1);
  }
}

async function main(): Promise<void> {
  const argv = process.argv;
  const flag = parseNetworkFlag(argv);
  if (flag) setActiveNetwork(flag);
  const { network, config } = resolveNetwork({ argv });

  process.stdout.write(`\n→ Setting up supply-chain-tracker on network: ${network}\n\n`);

  // 1. Bring up only the services this network needs.
  run('docker', ['compose', 'up', '-d', '--wait', ...config.composeServices]);

  // 2. Compile the contract (network-agnostic).
  run('npm', ['run', 'compile']);

  // 3. Deploy. Forward --network so deploy.ts sees the same network.
  const deployArgs = network === 'undeployed' ? [] : ['--', '--network', network];
  run('npm', ['run', 'deploy', ...deployArgs]);
}

main().catch((e) => {
  process.stderr.write(`\nSetup failed: ${(e as Error).message}\n`);
  process.exit(1);
});
