# xiaomi-miio

Zero-dependency Node.js TypeScript library for communicating with Xiaomi devices via the miIO protocol.

miIO is Xiaomi's local LAN protocol used by many devices (fans, lamps, etc.) for discovery and command/control.
It is UDP-based, uses a 32-byte header, and encrypts JSON-RPC payloads with AES-128-CBC.

This library focuses on the protocol and transport layer only:

- No device-specific logic (that lives in the Homey app in this repo)
- No external dependencies
- No filesystem access

## Requirements

- Node.js 22+
- npm 10+

## Install

```bash
npm install @martyndevries/xiaomi-miio
```

## Background and references

- miIO binary protocol notes: https://github.com/OpenMiHome/mihome-binary-protocol
- miIO protocol notes (archived): https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md
- Xiaomi developer portal: https://developers.xiaomi.com
- Xiaomi IoT platform: https://iot.mi.com
- Similar projects:
  - python-miio: https://github.com/rytilahti/python-miio
  - miio (Node.js): https://www.npmjs.com/package/miio

## Run locally

```bash
cd xiaomi-miio
npm install
npm run build
```

The build compiles TypeScript to `dist/` and is required before consuming the library from other packages.

Run tests:

```bash
npm run test:dev
```

Tests compile to `dist-test/` and run with Node's built-in test runner.

## Examples

Bedside Lamp 2 CLI (interactive control of a single device):

```bash
npm run example:bedlamp2
```

This will prompt for the device IP and token, perform a handshake, and then let you send simple commands.

Discovery CLI (scan the local network for miIO devices via UDP broadcast):

```bash
npm run example:discovery
```

This prints each responding device with its IP address, device ID, and stamp. Tokens are optional.

DNS hostname lookup CLI (reverse lookup by IP address):

```bash
npm run example:hostname
```

You will be prompted for the IP address and optional port.

## Minimal usage (TypeScript)

This example connects to a known device IP and token, turns it on, and sets the speed level.

```ts
import { MiioDevice, MiioProtocol } from '@martyndevries/xiaomi-miio';

const device = new MiioDevice({
  address: '192.168.1.50',
  token: MiioProtocol.tokenFromHex('00112233445566778899aabbccddeeff'),
  model: 'zhimi.fan.sa1',
});

const info = await device.connect();
console.log('Device ID:', info.deviceId);

await device.call('set_power', ['on']);
await device.call('set_speed_level', [50]);

device.destroy();
```

## Discovery usage (TypeScript)

This example broadcasts a discovery packet and prints all devices that respond.

```ts
import { discoverMiioDevices } from '@martyndevries/xiaomi-miio';

const devices = await discoverMiioDevices({ timeout: 3000, includeToken: false });
for (const device of devices) {
  console.log(`${device.address} id=${device.deviceId} stamp=${device.stamp}`);
}
```

## Contributing
- Martyn de Vries (Maintainer)

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.
