import { MiioProtocol } from './protocol.js';

describe('MiioProtocol', () => {
  it('should have PORT constant equal to 54321', () => {
    expect(MiioProtocol.PORT).toBe(54321);
  });

  describe('tokenFromHex', () => {
    it('should convert 32-char hex to 16-byte buffer', () => {
      const hex = 'ffffffffffffffffffffffffffffffff';
      const buf = MiioProtocol.tokenFromHex(hex);
      expect(buf.length).toBe(16);
      expect(buf).toEqual(Buffer.from(hex, 'hex'));
    });

    it('should throw on invalid length', () => {
      expect(() => MiioProtocol.tokenFromHex('abcd'))
        .toThrow(/Token hex must be 32 characters, got 4/);
    });

    it('should throw on too long hex', () => {
      expect(() => MiioProtocol.tokenFromHex('ff'.repeat(20)))
        .toThrow(/Token hex must be 32 characters, got 40/);
    });
  });
});
