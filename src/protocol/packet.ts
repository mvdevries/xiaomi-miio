import { MiioCrypto } from './crypto.js';

/**
 * miIO binary packet structure.
 *
 * Header (32 bytes):
 *   - Magic:      2 bytes (0x2131)
 *   - Length:      2 bytes (total packet length including header)
 *   - Unknown:     4 bytes (0x00000000, or 0xFFFFFFFF for Hello)
 *   - Device ID:   4 bytes (0xFFFFFFFF for Hello)
 *   - Stamp:       4 bytes (incrementing counter)
 *   - Checksum:    16 bytes (MD5 of header + token + payload, or token in Hello response)
 */
export class MiioPacket {
  static readonly MAGIC = 0x2131;
  static readonly HEADER_SIZE = 32;

  /** Create a Hello discovery packet (all 0xFF except magic and length). */
  static createHello(): Buffer {
    const packet = Buffer.alloc(MiioPacket.HEADER_SIZE, 0xff);
    packet.writeUInt16BE(MiioPacket.MAGIC, 0);
    packet.writeUInt16BE(MiioPacket.HEADER_SIZE, 2);
    return packet;
  }

  /** Encode a JSON command into an encrypted miIO packet. */
  static encode(
    deviceId: number,
    stamp: number,
    token: Buffer,
    payload: object
  ): Buffer {
    const miiocrypto = new MiioCrypto(token);
    const jsonStr = JSON.stringify(payload);
    const encrypted = miiocrypto.encrypt(Buffer.from(jsonStr, 'utf-8'));

    const packetLength = MiioPacket.HEADER_SIZE + encrypted.length;
    const header = Buffer.alloc(MiioPacket.HEADER_SIZE);

    header.writeUInt16BE(MiioPacket.MAGIC, 0);
    header.writeUInt16BE(packetLength, 2);
    header.writeUInt32BE(0x00000000, 4);
    header.writeUInt32BE(deviceId, 8);
    header.writeUInt32BE(stamp, 12);

    // Checksum placeholder (16 bytes of token for checksum calculation)
    token.copy(header, 16);

    // Calculate MD5 checksum over header + encrypted payload
    const checksum = MiioCrypto.md5(Buffer.concat([header, encrypted]));
    checksum.copy(header, 16);

    return Buffer.concat([header, encrypted]);
  }

  /** Decode a miIO packet, returning parsed header and decrypted payload. */
  static decode(
    data: Buffer,
    token: Buffer
  ): { deviceId: number; stamp: number; payload: object | null } {
    if (data.length < MiioPacket.HEADER_SIZE) {
      throw new Error(`Packet too short: ${data.length} bytes`);
    }

    const magic = data.readUInt16BE(0);
    if (magic !== MiioPacket.MAGIC) {
      throw new Error(`Invalid magic: 0x${magic.toString(16)}`);
    }

    const length = data.readUInt16BE(2);
    const deviceId = data.readUInt32BE(8);
    const stamp = data.readUInt32BE(12);

    if (length === MiioPacket.HEADER_SIZE) {
      // Hello response — no payload, checksum field contains the token
      return { deviceId, stamp, payload: null };
    }

    const encrypted = data.subarray(MiioPacket.HEADER_SIZE, length);
    const miiocrypto = new MiioCrypto(token);
    const decrypted = miiocrypto.decrypt(encrypted);
    const jsonStr = decrypted.toString('utf-8');
    const payload = JSON.parse(jsonStr) as object;

    return { deviceId, stamp, payload };
  }

  /** Extract the device token from a Hello response packet. */
  static extractToken(helloResponse: Buffer): Buffer {
    if (helloResponse.length < MiioPacket.HEADER_SIZE) {
      throw new Error('Hello response too short');
    }
    return Buffer.from(helloResponse.subarray(16, 32));
  }
}
