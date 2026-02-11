/**
 * Simple CLI for discovering miIO devices on the local network.
 *
 * Usage:
 *   npm run example:discovery
 *
 * You will be prompted for a timeout and whether to include tokens.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { discoverMiioDevices } from '../src/index.js';

const DEFAULT_TIMEOUT = 3000;

/** Print a list of discovered devices in a friendly format. */
function printDevices(devices: Awaited<ReturnType<typeof discoverMiioDevices>>): void {
  if (devices.length === 0) {
    console.log('No devices discovered.');
    return;
  }

  console.log(`Discovered ${devices.length} device(s):`);
  for (const device of devices) {
    const tokenHex = device.token ? device.token.toString('hex') : '(not requested)';
    console.log(`- ${device.address}  id=${device.deviceId}  stamp=${device.stamp}  token=${tokenHex}`);
  }
}

(async () => {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('miIO Discovery CLI');
  console.log('===================\n');

  const timeoutInput = (await rl.question(`Timeout in ms (default ${DEFAULT_TIMEOUT}): `)).trim();
  const includeTokenInput = (await rl.question('Include token from hello response? (y/N): ')).trim();

  const timeout = timeoutInput ? Number(timeoutInput) : DEFAULT_TIMEOUT;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    console.error('Invalid timeout. Must be a positive number.');
    rl.close();
    process.exit(1);
  }

  const includeToken = /^y(es)?$/i.test(includeTokenInput);

  console.log(`\nScanning for miIO devices (${timeout}ms)...`);
  try {
    const devices = await discoverMiioDevices({ timeout, includeToken });
    printDevices(devices);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Discovery failed: ${message}`);
  } finally {
    rl.close();
  }
})();
