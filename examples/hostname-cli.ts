/**
 * CLI for resolving miIO device hostnames via reverse DNS.
 *
 * Usage:
 *   npm run example:hostname
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { lookupDeviceHostname } from '../src/index.js';

const DEFAULT_PORT = 54321;

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('miIO Hostname Lookup CLI');
  console.log('=========================\n');

  try {
    const address = (await rl.question('IP address: ')).trim();
    if (!address) {
      console.error('IP address is required.');
      process.exitCode = 1;
      return;
    }

    const portInput = (await rl.question(`Port (default ${DEFAULT_PORT}): `)).trim();
    const port = portInput ? Number(portInput) : DEFAULT_PORT;
    if (!Number.isFinite(port) || port <= 0) {
      console.error('Invalid port. Must be a positive number.');
      process.exitCode = 1;
      return;
    }

    const result = await lookupDeviceHostname(address, { port });

    console.log('Input address:', address);
    console.log('Input port:', port);
    console.log('lookup error:', result.error ? result.error.message : 'none');
    if (result.error?.cause) {
      const cause = result.error.cause instanceof Error ? result.error.cause.message : String(result.error.cause);
      console.log('lookup cause:', cause);
    }
    console.log('lookup hostname:', result.hostname ?? 'none');
    console.log('lookup service:', result.service ?? 'none');
  } finally {
    rl.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Unexpected error: ${message}`);
  process.exit(1);
});
