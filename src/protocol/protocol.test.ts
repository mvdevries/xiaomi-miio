import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MiioProtocol } from './protocol.js';

describe('MiioProtocol', () => {
  it('should have PORT constant equal to 54321', () => {
    assert.strictEqual(MiioProtocol.PORT, 54321);
  });

  describe('tokenFromHex', () => {
    it('should convert 32-char hex to 16-byte buffer', () => {
      const hex = 'ffffffffffffffffffffffffffffffff';
      const buf = MiioProtocol.tokenFromHex(hex);
      assert.strictEqual(buf.length, 16);
      assert.deepStrictEqual(buf, Buffer.from(hex, 'hex'));
    });

    it('should throw on invalid length', () => {
      assert.throws(
        () => MiioProtocol.tokenFromHex('abcd'),
        { message: /Token hex must be 32 characters, got 4/ }
      );
    });

    it('should throw on too long hex', () => {
      assert.throws(
        () => MiioProtocol.tokenFromHex('ff'.repeat(20)),
        { message: /Token hex must be 32 characters, got 40/ }
      );
    });
  });
});
