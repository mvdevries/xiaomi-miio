import * as dgram from 'node:dgram';
import { MiioPacket } from './packet.js';

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_BROADCAST_ADDRESS = '255.255.255.255';
const DEFAULT_PORT = 54321;
const EMPTY_TOKEN = Buffer.alloc(16, 0);

export interface DiscoveryOptions {
  /** Broadcast address for discovery. Default: 255.255.255.255 */
  address?: string | undefined;
  /** UDP port for miIO discovery. Default: 54321 */
  port?: number | undefined;
  /** Discovery timeout in milliseconds. Default: 5000 */
  timeout?: number | undefined;
  /** Include the token from the Hello response (if present). Default: false */
  includeToken?: boolean | undefined;
  /** Optional factory for creating the UDP socket (for testing). */
  createSocket?: (() => dgram.Socket) | undefined;
}

export interface MiioDiscoveredDevice {
  /** Device IP address. */
  address: string;
  /** Device ID from the Hello response. */
  deviceId: number;
  /** Device stamp from the Hello response. */
  stamp: number;
  /** Token from the Hello response (if includeToken is true). */
  token?: Buffer | undefined;
}

/**
 * Discover miIO devices on the local network via UDP broadcast.
 *
 * Sends a Hello packet and collects all Hello responses until timeout.
 */
export async function discoverMiioDevices(
  options: DiscoveryOptions = {}
): Promise<MiioDiscoveredDevice[]> {
  const address = options.address ?? DEFAULT_BROADCAST_ADDRESS;
  const port = options.port ?? DEFAULT_PORT;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const includeToken = options.includeToken ?? false;
  const createSocket = options.createSocket ?? (() => dgram.createSocket('udp4'));

  const socket = createSocket();
  const results = new Map<string, MiioDiscoveredDevice>();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener('message', onMessage);
      socket.removeListener('error', onError);
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
      if (error) {
        reject(error);
      } else {
        resolve([...results.values()]);
      }
    };

    const timer = setTimeout(() => { finish(); }, timeout);

    const onError = (err: Error): void => { finish(err); };

    const onMessage = (msg: Buffer, rinfo: dgram.RemoteInfo): void => {
      try {
        const { deviceId, stamp } = MiioPacket.decode(msg, EMPTY_TOKEN);
        const device: MiioDiscoveredDevice = {
          address: rinfo.address,
          deviceId,
          stamp,
        };
        if (includeToken) {
          device.token = MiioPacket.extractToken(msg);
        }
        results.set(rinfo.address, device);
      } catch {
        // Ignore malformed or non-miIO responses
      }
    };

    socket.on('message', onMessage);
    socket.on('error', onError);

    socket.bind(0, () => {
      socket.setBroadcast(true);
      const hello = MiioPacket.createHello();
      socket.send(hello, 0, hello.length, port, address, (err) => {
        if (err) finish(err);
      });
    });
  });
}
