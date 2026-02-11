import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MiioCrypto } from './crypto.js';

describe('MiioCrypto', () => {
  const token = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');

  it('should encrypt and decrypt roundtrip', () => {
    const crypto = new MiioCrypto(token);
    const plaintext = Buffer.from('{"id":1,"method":"get_prop","params":["power"]}', 'utf-8');

    const encrypted = crypto.encrypt(plaintext);
    const decrypted = crypto.decrypt(encrypted);

    assert.deepStrictEqual(decrypted, plaintext);
  });

  it('should produce deterministic output', () => {
    const crypto = new MiioCrypto(token);
    const plaintext = Buffer.from('hello miio', 'utf-8');

    const encrypted1 = crypto.encrypt(plaintext);
    const encrypted2 = crypto.encrypt(plaintext);

    assert.deepStrictEqual(encrypted1, encrypted2);
  });

  it('should throw on invalid token length', () => {
    assert.throws(
      () => new MiioCrypto(Buffer.from('0102030405', 'hex')),
      { message: /Token must be 16 bytes, got 5/ }
    );
  });

  it('should compute MD5 correctly', () => {
    // MD5 of empty buffer is d41d8cd98f00b204e9800998ecf8427e
    const hash = MiioCrypto.md5(Buffer.alloc(0));
    assert.strictEqual(hash.toString('hex'), 'd41d8cd98f00b204e9800998ecf8427e');
  });
});
