export { MiioCrypto } from './crypto.js';
export { MiioPacket } from './packet.js';
export { MiioTransport } from './transport.js';
export { discoverMiioDevices, type DiscoveryOptions, type MiioDiscoveredDevice } from './discovery.js';

/**
 * Re-export of the protocol building blocks.
 *
 * The miIO protocol operates as follows:
 * 1. Send a Hello packet to UDP port 54321
 * 2. Receive device ID and stamp from the Hello response
 * 3. Encrypt JSON-RPC commands with AES-128-CBC using the device token
 * 4. Send commands and receive encrypted responses
 */
export class MiioProtocol {
  /** Default miIO UDP port. */
  static readonly PORT = 54321;

  /** Convert a hex token string to a Buffer. */
  static tokenFromHex(hex: string): Buffer {
    if (hex.length !== 32) {
      throw new Error(`Token hex must be 32 characters, got ${hex.length}`);
    }
    return Buffer.from(hex, 'hex');
  }
}
