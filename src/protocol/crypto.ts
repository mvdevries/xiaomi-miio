import * as crypto from 'node:crypto';

/**
 * Handles miIO protocol encryption and decryption.
 *
 * The miIO protocol uses AES-128-CBC with PKCS#7 padding.
 * - Key = MD5(token)
 * - IV  = MD5(Key + token)
 */
export class MiioCrypto {
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor(token: Buffer) {
    if (token.length !== 16) {
      throw new Error(`Token must be 16 bytes, got ${token.length}`);
    }
    this.key = MiioCrypto.md5(token);
    this.iv = MiioCrypto.md5(Buffer.concat([this.key, token]));
  }

  /** Encrypt a plaintext buffer using AES-128-CBC. */
  encrypt(plaintext: Buffer): Buffer {
    const cipher = crypto.createCipheriv('aes-128-cbc', this.key, this.iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  /** Decrypt a ciphertext buffer using AES-128-CBC. */
  decrypt(ciphertext: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, this.iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** Compute MD5 hash of the given data. */
  static md5(data: Buffer): Buffer {
    return crypto.createHash('md5').update(data).digest();
  }
}
