import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DnsLookupError, lookupDeviceHostname } from './dns.js';

describe('lookupDeviceHostname', () => {
  it('returns hostname and service on success', async () => {
    const lookupService = mock.fn((_address: string, _port: number) => {
      return Promise.resolve({ hostname: 'miio-device.local', service: 'miio' });
    });

    const result = await lookupDeviceHostname('192.168.1.10', { port: 54321, lookupService });
    assert.strictEqual(result.address, '192.168.1.10');
    assert.strictEqual(result.port, 54321);
    assert.strictEqual(result.hostname, 'miio-device.local');
    assert.strictEqual(result.service, 'miio');
    assert.strictEqual(result.error, null);
    assert.strictEqual(lookupService.mock.callCount(), 1);
  });

  it('returns a typed error on failure', async () => {
    const lookupService = mock.fn(() => {
      return Promise.reject(new Error('nope'));
    });

    const result = await lookupDeviceHostname('192.168.1.20', { port: 54321, lookupService });
    assert.strictEqual(result.hostname, null);
    assert.strictEqual(result.service, null);
    assert.ok(result.error);
    assert.ok(result.error instanceof DnsLookupError);
    assert.strictEqual(result.error.address, '192.168.1.20');
    assert.strictEqual(result.error.port, 54321);
    assert.ok(result.error.cause instanceof Error);
  });
});
