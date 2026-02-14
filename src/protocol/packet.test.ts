import { MiioPacket } from './packet.js';

describe('MiioPacket', () => {
  const token = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');

  describe('createHello', () => {
    it('should start with magic 0x2131', () => {
      const hello = MiioPacket.createHello();
      expect(hello.readUInt16BE(0)).toBe(0x2131);
    });

    it('should have length of 32', () => {
      const hello = MiioPacket.createHello();
      expect(hello.length).toBe(32);
      expect(hello.readUInt16BE(2)).toBe(32);
    });

    it('should have 0xFF padding after magic and length', () => {
      const hello = MiioPacket.createHello();
      for (let i = 4; i < 32; i++) {
        expect(hello[i]).toBe(0xff);
      }
    });
  });

  describe('encode + decode roundtrip', () => {
    it('should encode and decode a payload correctly', () => {
      const deviceId = 0x12345678;
      const stamp = 42;
      const payload = { id: 1, method: 'get_prop', params: ['power'] };

      const packet = MiioPacket.encode(deviceId, stamp, token, payload);
      const decoded = MiioPacket.decode(packet, token);

      expect(decoded.deviceId).toBe(deviceId);
      expect(decoded.stamp).toBe(stamp);
      expect(decoded.payload).toEqual(payload);
    });
  });

  describe('decode', () => {
    it('should throw on packet shorter than header', () => {
      expect(() => MiioPacket.decode(Buffer.alloc(10), token))
        .toThrow(/Packet too short: 10 bytes/);
    });

    it('should throw on invalid magic bytes', () => {
      const bad = Buffer.alloc(32);
      bad.writeUInt16BE(0x1234, 0); // wrong magic
      bad.writeUInt16BE(32, 2);
      expect(() => MiioPacket.decode(bad, token))
        .toThrow(/Invalid magic: 0x1234/);
    });

    it('should return null payload for hello response (header-only)', () => {
      const helloResponse = Buffer.alloc(32);
      helloResponse.writeUInt16BE(0x2131, 0);
      helloResponse.writeUInt16BE(32, 2);
      helloResponse.writeUInt32BE(0xaabbccdd, 8);
      helloResponse.writeUInt32BE(100, 12);

      const decoded = MiioPacket.decode(helloResponse, token);
      expect(decoded.deviceId).toBe(0xaabbccdd);
      expect(decoded.stamp).toBe(100);
      expect(decoded.payload).toBeNull();
    });
  });

  describe('extractToken', () => {
    it('should extract 16 bytes at offset 16 from hello response', () => {
      const response = Buffer.alloc(32);
      response.writeUInt16BE(0x2131, 0);
      response.writeUInt16BE(32, 2);
      // Write a known token at offset 16
      const expectedToken = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      expectedToken.copy(response, 16);

      const extracted = MiioPacket.extractToken(response);
      expect(extracted).toEqual(expectedToken);
    });

    it('should throw if response is too short', () => {
      expect(() => MiioPacket.extractToken(Buffer.alloc(16)))
        .toThrow(/Hello response too short/);
    });
  });
});
